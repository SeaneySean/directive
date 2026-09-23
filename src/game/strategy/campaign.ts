import { nextRandom } from '../rng.ts';
import { ACTIONS, REGIONS, STARTING_TREASURY } from './data.ts';
import { pendingEvent } from './events.ts';
import { generateOffers } from './missions.ts';
import { advanceResearch } from './research.ts';
import { freshRoster } from './roster.ts';
import { PATHS } from './types.ts';
import type {
  ActionDefinition,
  CampaignState,
  RegionState,
} from './types.ts';

const clamp = (value: number): number => Math.max(0, Math.min(100, value));

import { checkOutcome, heldRegions } from './outcome.ts';

export { checkOutcome, heldRegions };

export function createCampaign(seed: number): CampaignState {
  const turn = 1;
  const base: CampaignState = {
    seed,
    turn,
    treasury: STARTING_TREASURY,
    exposure: 0,
    agents: 3,
    regions: REGIONS.map((region) => ({
      ...region,
      meters: { subvert: 0, force: 0, enlighten: 0 },
      held: false,
    })),
    assignments: {},
    activeResearch: null,
    researchPoints: 0,
    completedResearch: [],
    items: [],
    flags: [],
    firedEvents: [],
    unlockedMissions: [],
    missions: {},
    offers: [],
    spentMissionAgents: 0,
    roster: freshRoster(),
    recruitCount: 0,
    bonusAgents: 0,
    outcome: 'playing',
    endingId: null,
  };
  return { ...base, offers: generateOffers(base) };
}

export function isActionAvailable(
  state: CampaignState,
  regionId: string,
  actionId: string,
): boolean {
  if (state.outcome !== 'playing') return false;
  const region = state.regions.find((candidate) => candidate.id === regionId);
  const action = ACTIONS[actionId];
  if (!region || !action || region.held || state.assignments[regionId]) return false;
  if (Object.keys(state.assignments).length + state.spentMissionAgents >= state.agents) return false;
  if (action.requires && !state.completedResearch.includes(action.requires)) return false;
  if (actionCost(state, action) > state.treasury) return false;
  return !action.minimum || Object.entries(action.minimum).every(
    ([path, minimum]) => region.meters[path as keyof RegionState['meters']] >= minimum,
  );
}

export function actionCost(state: CampaignState, action: ActionDefinition): number {
  const discount = action.path === 'subvert' && state.flags.includes('favourable-law') ? 2 : 0;
  return Math.max(0, action.cost - discount);
}

export function visibleMeter(state: CampaignState, value: number): number {
  return state.completedResearch.includes('cybernetics-1') ? value : Math.round(value / 10) * 10;
}

export function availableActions(state: CampaignState, regionId: string): ActionDefinition[] {
  return Object.values(ACTIONS).filter((action) => isActionAvailable(state, regionId, action.id));
}

export function assignAction(
  state: CampaignState,
  regionId: string,
  actionId: string,
): CampaignState {
  if (!isActionAvailable(state, regionId, actionId)) return state;
  const action = ACTIONS[actionId]!;
  return {
    ...state,
    treasury: state.treasury - actionCost(state, action),
    assignments: { ...state.assignments, [regionId]: actionId },
  };
}

export function clearAction(state: CampaignState, regionId: string): CampaignState {
  const actionId = state.assignments[regionId];
  const action = actionId ? ACTIONS[actionId] : undefined;
  if (!action) return state;
  const assignments = { ...state.assignments };
  delete assignments[regionId];
  return { ...state, treasury: state.treasury + actionCost(state, action), assignments };
}

export function endTurn(state: CampaignState): CampaignState {
  if (state.outcome !== 'playing' || pendingEvent(state)) return state;

  let seed = state.seed;
  let exposure = state.exposure;
  const regions = state.regions.map((region): RegionState => {
    const actionId = state.assignments[region.id];
    const action = actionId ? ACTIONS[actionId] : undefined;
    let resistance = region.resistance;
    const effects = { ...region.meters };

    if (action) {
      const random = nextRandom(seed);
      seed = random.seed;
      const variation = Math.floor(random.value * 5) - 2;
      for (const path of PATHS) {
        const amount = action.effects[path];
        if (amount !== undefined) {
          const multiplier = action.id === 'buy-media' && state.completedResearch.includes('psychology-1') ? 2 : 1;
          effects[path] += Math.max(0, amount * multiplier + variation);
        }
      }
      resistance = Math.max(0, resistance + (action.resistanceDelta ?? 0));
      const exposureMultiplier = action.path === 'subvert' && state.completedResearch.includes('psychology-2') ? 0.5 : 1;
      exposure = clamp(exposure + action.exposure * exposureMultiplier);
    }

    for (const path of PATHS) effects[path] = clamp(effects[path] - resistance);
    return {
      ...region,
      resistance,
      meters: effects,
      held: region.held || PATHS.some((path) => effects[path] >= 100),
    };
  });

  const held = regions.filter((region) => region.held);
  const advanced: CampaignState = {
    ...state,
    seed,
    turn: state.turn + 1,
    treasury: state.treasury + held.reduce((sum, region) => sum + region.wealth, 0),
    exposure,
    agents: 3 + Math.floor(held.length / 2) + state.bonusAgents,
    regions,
    assignments: {},
    offers: [],
    spentMissionAgents: 0,
    roster: state.roster.map((soldier) =>
      soldier.alive ? { ...soldier, hp: Math.min(soldier.maxHp, soldier.hp + 3) } : soldier,
    ),
    outcome: 'playing',
  };
  const withOffers: CampaignState = { ...advanced, offers: generateOffers(advanced) };
  const researched = advanceResearch(withOffers);
  const withAgents = {
    ...researched,
    agents: researched.agents + (researched.completedResearch.includes('cybernetics-2') ? 1 : 0),
  };
  return checkOutcome(withAgents);
}
