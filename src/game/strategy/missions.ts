import { AREA51_HANGAR, ATLANTIS_RUINS } from '../scenarios.ts';
import type { Outcome, Scenario, Weapon } from '../types.ts';
import { hasResearchGrant } from './research.ts';
import type { CampaignState } from './types.ts';

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