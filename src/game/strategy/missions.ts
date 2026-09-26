import { AREA51_HANGAR, ATLANTIS_RUINS } from '../scenarios.ts';
import { generateMission } from '../mapgen.ts';
import { nextRandom } from '../rng.ts';
import type { GameState, MissionType, Outcome, Scenario } from '../types.ts';
import { checkOutcome } from './outcome.ts';
import { hasResearchGrant } from './research.ts';
import { pendingEvent } from './events.ts';
import { ACTIONS } from './data.ts';
import { buildFieldSquad, livingSoldiers, RECRUIT_COST, RECRUIT_NAMES, settleRoster } from './roster.ts';
import { PATHS } from './types.ts';
import type {
  CampaignState,
  InfluencePath,
  MissionOffer,
  RegionState,
  Soldier,
} from './types.ts';

export type MissionId = 'area-51' | 'atlantis';

export interface MissionDefinition {
  id: MissionId;
  name: string;
  scenario: Scenario;
}

export const MISSIONS: readonly MissionDefinition[] = [
  { id: 'area-51', name: 'Area 51 Hangar', scenario: AREA51_HANGAR },
  { id: 'atlantis', name: 'Atlantis Ruins', scenario: ATLANTIS_RUINS },
] as const;

function isUnlocked(state: CampaignState, id: MissionId): boolean {
  if (id === 'area-51') return state.unlockedMissions.includes(id);
  return hasResearchGrant(state, 'unlock-atlantis');
}

export function availableMissions(state: CampaignState): MissionDefinition[] {
  return MISSIONS.filter((mission) => {
    if (!isUnlocked(state, mission.id)) return false;
    const progress = state.missions[mission.id];
    if (!progress) return true;
    if (progress.status !== 'failed') return false;
    return (progress.retryTurn ?? 0) <= state.turn;
  });
}

export function startMission(state: CampaignState, id: string): CampaignState {
  if (!availableMissions(state).some((mission) => mission.id === id)) return state;
  if (livingSoldiers(state).length === 0) return state;
  return {
    ...state,
    missions: { ...state.missions, [id]: { status: 'in-progress' } },
  };
}

export function completeMission(
  state: CampaignState,
  id: string,
  result: Exclude<Outcome, 'playing'>,
  battle?: GameState,
): CampaignState {
  if (state.missions[id]?.status !== 'in-progress') return state;
  let next: CampaignState;
  if (result === 'lost') {
    next = {
      ...state,
      treasury: Math.max(0, state.treasury - 20),
      missions: { ...state.missions, [id]: { status: 'failed', retryTurn: state.turn + 1 } },
    };
  } else {
    const reward = id === 'area-51' ? 'alien-artefact' : id === 'atlantis' ? 'aurichalcum' : null;
    const items = reward && !state.items.includes(reward) ? [...state.items, reward] : state.items;
    next = {
      ...state,
      exposure: id === 'area-51' ? Math.max(0, state.exposure - 10) : state.exposure,
      items,
      missions: { ...state.missions, [id]: { status: 'completed' } },
    };
  }
  return battle ? settleRoster(next, battle) : next;
}

export function missionScenario(state: CampaignState, id: MissionId): Scenario {
  const definition = MISSIONS.find((mission) => mission.id === id);
  if (!definition) throw new Error(`unknown mission ${id}`);
  const scenario = definition.scenario;
  const squadSpawns = scenario.units.filter((unit) => unit.team === 'squad');
  const aliens = scenario.units.filter((unit) => unit.team === 'alien');
  const objective = scenario.objective;
  return {
    ...scenario,
    rows: [...scenario.rows],
    units: [
      ...buildFieldSquad(state, squadSpawns),
      ...aliens.map((unit) => ({ ...unit, pos: { ...unit.pos }, weapon: { ...unit.weapon } })),
    ],
    objective: objective?.kind === 'hold'
      ? { kind: 'hold', tile: { ...objective.tile }, holdRounds: objective.holdRounds }
      : undefined,
  };
}

// --- Generated mission offers that spawn from acted regions ---

export const OFFER_INFLUENCE_GAIN = 35;
export const OFFER_RESISTANCE_DELTA = -5;
export const OFFER_TREASURY_LOSS = 20;

/** Exposure applied once on completion, per type, halved for Enlighten offers. */
export const OFFER_EXPOSURE: Record<MissionType, number> = {
  recover: 4,
  assassinate: 8,
  clash: 2,
};

/** An eligible acted region spawns a mission when its roll falls below this. */
export const SPAWN_CHANCE = 0.45;
/** The most open generated offers at once (story missions are not counted). */
export const OPEN_OFFER_CAP = 2;
/** An offer is available for this many turns: spawnTurn .. expiresTurn - 1. */
export const OFFER_LIFETIME = 3;
/** A Subvert action yields assassination (rather than recover) below this roll. */
export const SUBVERT_ASSASSINATE_THRESHOLD = 0.225;

const clamp = (value: number): number => Math.max(0, Math.min(100, value));

/** Deterministic 32-bit seed from the offer's (region, turn, type) identity. */
function offerSeed(regionId: string, turn: number, type: MissionType): number {
  const raw = `${regionId}:${turn}:${type}`;
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < raw.length; i++) {
    hash = Math.imul(hash ^ raw.charCodeAt(i), 16777619);
  }
  return hash >>> 0;
}

/** The turn on which an offer spawned on `spawnTurn` expires. */
export function offerExpiresTurn(spawnTurn: number): number {
  return spawnTurn + OFFER_LIFETIME;
}

/**
 * The mission type an offer takes from its assigned action's primary path.
 * Subvert is assassination `below` `SUBVERT_ASSASSINATE_THRESHOLD`, otherwise
 * recover; Force is always clash; Enlighten is always recover. No extra roll.
 */
export function offerTypeForPath(path: InfluencePath, rollValue: number): MissionType {
  switch (path) {
    case 'subvert':
      return rollValue < SUBVERT_ASSASSINATE_THRESHOLD ? 'assassinate' : 'recover';
    case 'force':
      return 'clash';
    case 'enlighten':
      return 'recover';
  }
}

/** A freshly spawned, frozen open offer. */
function makeOffer(regionId: string, turn: number, type: MissionType, path: InfluencePath): MissionOffer {
  return {
    id: `${regionId}:${turn}`,
    regionId,
    type,
    path,
    seed: offerSeed(regionId, turn, type),
    status: 'open',
    spawnTurn: turn,
    expiresTurn: offerExpiresTurn(turn),
  };
}

/**
 * Expire open offers at an END TURN transition: drop any open offer whose
 * `expiresTurn <= resultingTurn`, prune terminal won/lost records, and always
 * retain launched offers (which settle exactly once into won/lost).
 */
export function expireOffers(offers: readonly MissionOffer[], resultingTurn: number): MissionOffer[] {
  return offers.filter((offer) => {
    if (offer.status === 'won' || offer.status === 'lost') return false;
    if (offer.status === 'launched') return true;
    return offer.expiresTurn > resultingTurn;
  });
}

export interface OfferSpawnResult {
  offers: MissionOffer[];
  seed: number;
}

/**
 * Visit eligible acted regions in `REGIONS` order (the `regions` array), rolling
 * `nextRandom` once per eligible region and spawning when the value is below
 * `SPAWN_CHANCE`. Held regions, regions already holding an open offer and the
 * two-open-offer cap are all skipped (the cap stops further visitation). New
 * offers append to the surviving offers; survivors are never regenerated.
 *
 * The pressure fallback (criterion 3) runs when the outgoing turn had no
 * assignments and no generated offer remains open: it spawns one clash with a
 * frozen Force path in the unheld region with the highest resulting Force meter
 * (ties broken in `REGIONS` order), using no random roll.
 */
export function spawnOffers(
  resultingTurn: number,
  seed: number,
  regions: readonly RegionState[],
  assignments: Record<string, string>,
  survivingOffers: readonly MissionOffer[],
): OfferSpawnResult {
  let currentSeed = seed;
  let offers = [...survivingOffers];
  let open = offers.filter((offer) => offer.status === 'open').length;

  for (const region of regions) {
    if (open >= OPEN_OFFER_CAP) break;
    const actionId = assignments[region.id];
    if (!actionId) continue;
    if (region.held) continue;
    if (offers.some((offer) => offer.regionId === region.id && offer.status === 'open')) continue;

    const roll = nextRandom(currentSeed);
    currentSeed = roll.seed;
    if (roll.value >= SPAWN_CHANCE) continue;

    const path: InfluencePath = ACTIONS[actionId]?.path ?? 'subvert';
    const type = offerTypeForPath(path, roll.value);
    offers = [...offers, makeOffer(region.id, resultingTurn, type, path)];
    open += 1;
  }

  if (Object.keys(assignments).length === 0 && open === 0) {
    const eligible = regions.filter((region) => !region.held);
    let target = eligible[0];
    for (const region of eligible.slice(1)) {
      if (region.meters.force > (target?.meters.force ?? -1)) target = region;
    }
    if (target) offers = [...offers, makeOffer(target.id, resultingTurn, 'clash', 'force')];
  }

  return { offers, seed: currentSeed };
}

export interface OfferTransition {
  spawned: MissionOffer[];
  expired: { regionId: string; regionName: string }[];
}

/**
 * The feedback difference across an END TURN transition: offers that newly
 * surfaced and open offers that expired. Derived from before/after state so no
 * persistent campaign log is needed.
 */
export function offerTransition(before: CampaignState, after: CampaignState): OfferTransition {
  const beforeIds = new Set(before.offers.map((offer) => offer.id));
  const afterIds = new Set(after.offers.map((offer) => offer.id));
  const spawned = after.offers.filter((offer) => offer.status === 'open' && !beforeIds.has(offer.id));
  const expired = before.offers
    .filter((offer) => offer.status === 'open' && !afterIds.has(offer.id))
    .map((offer) => ({
      regionId: offer.regionId,
      regionName: before.regions.find((region) => region.id === offer.regionId)?.name ?? offer.regionId,
    }));
  return { spawned, expired };
}

export function offerById(state: CampaignState, id: string): MissionOffer | undefined {
  return state.offers.find((offer) => offer.id === id);
}

/** Agents not yet spent on assignments or launched generated missions. */
export function remainingAgents(state: CampaignState): number {
  return state.agents - Object.keys(state.assignments).length - state.spentMissionAgents;
}

/** True while a story mission or a generated mission is mid-battle. */
function hasActiveMission(state: CampaignState): boolean {
  return Object.values(state.missions).some((mission) => mission.status === 'in-progress')
    || state.offers.some((offer) => offer.status === 'launched');
}

/** Open offers, regardless of remaining agents (the HUD decides which to enable). */
export function availableOffers(state: CampaignState): MissionOffer[] {
  return state.offers.filter((offer) => offer.status === 'open');
}

/** Launch a generated offer, spending one agent until the next campaign turn. */
export function launchOffer(state: CampaignState, offerId: string): CampaignState {
  if (state.outcome !== 'playing' || pendingEvent(state) || hasActiveMission(state)) return state;
  if (livingSoldiers(state).length === 0) return state;
  if (remainingAgents(state) <= 0) return state;
  const offer = state.offers.find((candidate) => candidate.id === offerId);
  if (!offer || offer.status !== 'open') return state;
  return {
    ...state,
    spentMissionAgents: state.spentMissionAgents + 1,
    offers: state.offers.map((candidate) =>
      candidate.id === offerId ? { ...candidate, status: 'launched' as const } : candidate,
    ),
  };
}

/** The generated scenario for an offer, built from the roster squad. */
export function offerScenario(state: CampaignState, offerId: string): Scenario {
  const offer = offerById(state, offerId);
  if (!offer) throw new Error(`unknown offer ${offerId}`);
  const scenario = generateMission(offer.type, offer.path, offer.seed);
  const squadSpawns = scenario.units.filter((unit) => unit.team === 'squad');
  const aliens = scenario.units.filter((unit) => unit.team === 'alien');
  return {
    ...scenario,
    units: [...buildFieldSquad(state, squadSpawns), ...aliens],
  };
}

/**
 * Settle a launched offer exactly once. Win raises the offer's frozen path by
 * 35 (capped) and lowers Resistance by 5 (floored); loss costs 20 treasury
 * (floored). Exposure is applied once for either result. Held status and the
 * campaign outcome update immediately.
 */
export function completeOffer(
  state: CampaignState,
  offerId: string,
  result: Exclude<Outcome, 'playing'>,
  battle?: GameState,
): CampaignState {
  const offer = state.offers.find((candidate) => candidate.id === offerId);
  if (!offer || offer.status !== 'launched') return state;

  const exposureType = OFFER_EXPOSURE[offer.type];
  const exposureGain = offer.path === 'enlighten' ? Math.floor(exposureType / 2) : exposureType;

  let next: CampaignState = {
    ...state,
    exposure: clamp(state.exposure + exposureGain),
    offers: state.offers.map((candidate) =>
      candidate.id === offerId ? { ...candidate, status: result } : candidate,
    ),
  };

  if (result === 'won') {
    next = {
      ...next,
      regions: next.regions.map((region) => region.id === offer.regionId
        ? applyOfferWin(region, offer.path)
        : region),
    };
  } else {
    next = { ...next, treasury: Math.max(0, next.treasury - OFFER_TREASURY_LOSS) };
  }
  if (battle) next = settleRoster(next, battle);
  return checkOutcome(next);
}

function applyOfferWin(region: RegionState, path: InfluencePath): RegionState {
  const meters = { ...region.meters, [path]: clamp(region.meters[path] + OFFER_INFLUENCE_GAIN) };
  return {
    ...region,
    meters,
    resistance: Math.max(0, region.resistance + OFFER_RESISTANCE_DELTA),
    held: region.held || PATHS.some((candidate) => meters[candidate] >= 100),
  };
}

/**
 * Replace the first KIA roster slot with a fresh recruit for 40 treasury. The
 * recruit has a new id, a deterministic name from the cycling pool, full HP,
 * no kills, rank 0 and a rifle. Returns the state unchanged when there is no
 * KIA, the treasury is short, an event is pending, a mission is active, or the
 * campaign has ended. Recruiting consumes no strategic agent.
 */
export function recruitSoldier(state: CampaignState): CampaignState {
  if (!canRecruit(state)) return state;
  const index = state.roster.findIndex((soldier) => !soldier.alive);

  const recruit: Soldier = {
    id: `r${state.recruitCount + 1}`,
    name: RECRUIT_NAMES[state.recruitCount % RECRUIT_NAMES.length]!,
    hp: 12,
    maxHp: 12,
    kills: 0,
    rank: 0,
    alive: true,
    weapon: 'rifle',
  };
  return {
    ...state,
    roster: state.roster.map((soldier, i) => (i === index ? recruit : soldier)),
    treasury: state.treasury - RECRUIT_COST,
    recruitCount: state.recruitCount + 1,
  };
}

/** True when a replacement could be hired right now (a KIA slot and nothing blocking). */
export function canRecruit(state: CampaignState): boolean {
  if (state.outcome !== 'playing' || pendingEvent(state) || hasActiveMission(state)) return false;
  if (state.treasury < RECRUIT_COST) return false;
  return state.roster.some((soldier) => !soldier.alive);
}
