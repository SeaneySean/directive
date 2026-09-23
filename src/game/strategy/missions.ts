import { AREA51_HANGAR, ATLANTIS_RUINS } from '../scenarios.ts';
import { generateMission } from '../mapgen.ts';
import type { MissionType, Outcome, Scenario, Weapon } from '../types.ts';
import { checkOutcome } from './outcome.ts';
import { hasResearchGrant } from './research.ts';
import { pendingEvent } from './events.ts';
import { PATHS } from './types.ts';
import type {
  CampaignState,
  InfluencePath,
  MissionOffer,
  RegionState,
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

const PLASMA: Weapon = { name: 'Plasma', range: 7, accuracy: 75, damage: 5 };

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
  return {
    ...state,
    missions: { ...state.missions, [id]: { status: 'in-progress' } },
  };
}

export function completeMission(
  state: CampaignState,
  id: string,
  result: Exclude<Outcome, 'playing'>,
): CampaignState {
  if (state.missions[id]?.status !== 'in-progress') return state;
  if (result === 'lost') {
    return {
      ...state,
      treasury: Math.max(0, state.treasury - 20),
      missions: { ...state.missions, [id]: { status: 'failed', retryTurn: state.turn + 1 } },
    };
  }

  const reward = id === 'area-51' ? 'alien-artefact' : id === 'atlantis' ? 'aurichalcum' : null;
  const items = reward && !state.items.includes(reward) ? [...state.items, reward] : state.items;
  return {
    ...state,
    exposure: id === 'area-51' ? Math.max(0, state.exposure - 10) : state.exposure,
    items,
    missions: { ...state.missions, [id]: { status: 'completed' } },
  };
}

export function missionScenario(state: CampaignState, id: MissionId): Scenario {
  const definition = MISSIONS.find((mission) => mission.id === id);
  if (!definition) throw new Error(`unknown mission ${id}`);
  const upgrade = hasResearchGrant(state, 'plasma-small-arms');
  const objective = definition.scenario.objective;
  return {
    ...definition.scenario,
    rows: [...definition.scenario.rows],
    units: definition.scenario.units.map((unit) => ({
      ...unit,
      pos: { ...unit.pos },
      weapon: upgrade && unit.team === 'squad' ? { ...PLASMA } : { ...unit.weapon },
    })),
    objective: objective?.kind === 'hold'
      ? { kind: 'hold', tile: { ...objective.tile }, holdRounds: objective.holdRounds }
      : undefined,
  };
}

// --- Generated per-region mission offers (criterion 3) ---

const OFFER_TYPES: readonly MissionType[] = ['recover', 'assassinate', 'clash'];

export const OFFER_INFLUENCE_GAIN = 35;
export const OFFER_RESISTANCE_DELTA = -5;
export const OFFER_TREASURY_LOSS = 20;

/** Exposure applied once on completion, per type, halved for Enlighten offers. */
export const OFFER_EXPOSURE: Record<MissionType, number> = {
  recover: 4,
  assassinate: 8,
  clash: 2,
};

const clamp = (value: number): number => Math.max(0, Math.min(100, value));

/** The offer's path is the region's highest meter, ties broken in PATHS order. */
export function offerPath(region: RegionState): InfluencePath {
  let best: InfluencePath = PATHS[0];
  for (const path of PATHS.slice(1)) {
    if (region.meters[path] > region.meters[best]) best = path;
  }
  return best;
}

/** Deterministic 32-bit seed from the offer's (region, turn, type) identity. */
function offerSeed(regionId: string, turn: number, type: MissionType): number {
  const raw = `${regionId}:${turn}:${type}`;
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < raw.length; i++) {
    hash = Math.imul(hash ^ raw.charCodeAt(i), 16777619);
  }
  return hash >>> 0;
}

/** One frozen offer per region for the current turn, cyclic type per region index. */
export function generateOffers(state: CampaignState): MissionOffer[] {
  return state.regions.map((region, index) => {
    const type = OFFER_TYPES[(index + state.turn) % OFFER_TYPES.length]!;
    return {
      id: `${region.id}:${state.turn}`,
      regionId: region.id,
      type,
      path: offerPath(region),
      seed: offerSeed(region.id, state.turn, type),
      status: 'open' as const,
    };
  });
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

/** The generated scenario for an offer, with the researched plasma upgrade applied. */
export function offerScenario(state: CampaignState, offerId: string): Scenario {
  const offer = offerById(state, offerId);
  if (!offer) throw new Error(`unknown offer ${offerId}`);
  const scenario = generateMission(offer.type, offer.path, offer.seed);
  if (!hasResearchGrant(state, 'plasma-small-arms')) return scenario;
  return {
    ...scenario,
    units: scenario.units.map((unit) =>
      unit.team === 'squad' ? { ...unit, weapon: { ...PLASMA } } : unit,
    ),
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