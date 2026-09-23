import { PATHS } from './types.ts';
import type { CampaignState, InfluencePath, RegionState } from './types.ts';

export function meterHasReachedTarget(region: RegionState): boolean {
  return PATHS.some((path) => region.meters[path] >= 100);
}

export function heldRegions(state: CampaignState): RegionState[] {
  return state.regions.filter((region) => region.held || meterHasReachedTarget(region));
}

export function checkOutcome(state: CampaignState): CampaignState {
  if (state.exposure >= 100) return { ...state, outcome: 'lost', endingId: 'exposed' };
  if (state.completedResearch.includes('cybernetics-3')) {
    return { ...state, outcome: 'won', endingId: 'machine-ascends' };
  }
  if (heldRegions(state).length >= 5) {
    const totals = PATHS.reduce<Record<InfluencePath, number>>((result, path) => {
      result[path] = state.regions.reduce((sum, region) => sum + region.meters[path], 0);
      return result;
    }, { subvert: 0, force: 0, enlighten: 0 });
    let dominant: InfluencePath = 'subvert';
    for (const path of PATHS.slice(1)) {
      if (totals[path] > totals[dominant]) dominant = path;
    }
    const endingIds = {
      subvert: 'quiet-throne',
      force: 'pax-illuminata',
      enlighten: 'long-dawn',
    } as const;
    return { ...state, outcome: 'won', endingId: endingIds[dominant] };
  }
  return state.outcome === 'playing' && state.endingId === null
    ? state
    : { ...state, outcome: 'playing', endingId: null };
}