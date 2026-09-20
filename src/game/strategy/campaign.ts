import { nextRandom } from '../rng.ts';
import { ACTIONS, REGIONS, STARTING_TREASURY } from './data.ts';
import { PATHS } from './types.ts';
import type {
  ActionDefinition,
  CampaignOutcome,
  CampaignState,
  RegionState,
} from './types.ts';

const clamp = (value: number): number => Math.max(0, Math.min(100, value));

function meterHasReachedTarget(region: RegionState): boolean {
  return PATHS.some((path) => region.meters[path] >= 100);
}

export function heldRegions(state: CampaignState): RegionState[] {
  return state.regions.filter((region) => region.held || meterHasReachedTarget(region));
}

export function checkOutcome(state: CampaignState): CampaignOutcome {
  if (state.exposure >= 100) return 'lost';
  if (heldRegions(state).length >= 5) return 'won';
  return 'playing';
}

export function createCampaign(seed: number): CampaignState {
  return {
    seed,
    turn: 1,
    treasury: STARTING_TREASURY,
    exposure: 0,
    agents: 3,
    regions: REGIONS.map((region) => ({
      ...region,
      meters: { subvert: 0, force: 0, enlighten: 0 },
      held: false,
    })),
    assignments: {},
    outcome: 'playing',
  };
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
  if (Object.keys(state.assignments).length >= state.agents) return false;
  if (action.requires || action.cost > state.treasury) return false;
  return !action.minimum || Object.entries(action.minimum).every(
    ([path, minimum]) => region.meters[path as keyof RegionState['meters']] >= minimum,
  );
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
    treasury: state.treasury - action.cost,
    assignments: { ...state.assignments, [regionId]: actionId },
  };
}

export function clearAction(state: CampaignState, regionId: string): CampaignState {
  const actionId = state.assignments[regionId];
  const action = actionId ? ACTIONS[actionId] : undefined;
  if (!action) return state;
  const assignments = { ...state.assignments };
  delete assignments[regionId];
  return { ...state, treasury: state.treasury + action.cost, assignments };
}

export function endTurn(state: CampaignState): CampaignState {
  if (state.outcome !== 'playing') return state;

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
        if (amount !== undefined) effects[path] += Math.max(0, amount + variation);
      }
      resistance = Math.max(0, resistance + (action.resistanceDelta ?? 0));
      exposure = clamp(exposure + action.exposure);
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
  const next: CampaignState = {
    ...state,
    seed,
    turn: state.turn + 1,
    treasury: state.treasury + held.reduce((sum, region) => sum + region.wealth, 0),
    exposure,
    agents: 3 + Math.floor(held.length / 2),
    regions,
    assignments: {},
    outcome: 'playing',
  };
  return { ...next, outcome: checkOutcome(next) };
}
