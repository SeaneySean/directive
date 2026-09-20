import { describe, expect, test } from 'bun:test';
import { ACTIONS, REGIONS } from './data.ts';
import {
  assignAction,
  checkOutcome,
  createCampaign,
  endTurn,
  heldRegions,
} from './campaign.ts';
import type { CampaignState } from './types.ts';

function withMeter(
  state: CampaignState,
  regionId: string,
  path: 'subvert' | 'force' | 'enlighten',
  value: number,
): CampaignState {
  return {
    ...state,
    regions: state.regions.map((region) =>
      region.id === regionId
        ? { ...region, meters: { ...region.meters, [path]: value } }
        : region,
    ),
  };
}

describe('campaign strategy rules', () => {
  test('assignments are limited by available agents and one action per region', () => {
    let state = createCampaign(1);
    state = assignAction(state, REGIONS[0]!.id, 'buy-media');
    state = assignAction(state, REGIONS[1]!.id, 'buy-media');
    state = assignAction(state, REGIONS[2]!.id, 'buy-media');
    const atLimit = state;

    expect(Object.keys(state.assignments)).toHaveLength(3);
    expect(assignAction(state, REGIONS[3]!.id, 'buy-media')).toEqual(atLimit);
    expect(assignAction(state, REGIONS[0]!.id, 'found-movement')).toEqual(atLimit);
  });

  test('an action cannot make treasury negative', () => {
    const poor = { ...createCampaign(2), treasury: ACTIONS['buy-media'].cost - 1 };
    const result = assignAction(poor, REGIONS[0]!.id, 'buy-media');

    expect(result).toEqual(poor);
    expect(result.treasury).toBeGreaterThanOrEqual(0);
  });

  test('a meter reaching 100 makes its region held', () => {
    const state = assignAction(withMeter(createCampaign(3), 'north-america', 'subvert', 99), 'north-america', 'buy-media');
    const next = endTurn(state);

    expect(next.regions.find((region) => region.id === 'north-america')?.held).toBe(true);
    expect(heldRegions(next)).toHaveLength(1);
  });

  test('holding five regions wins the campaign', () => {
    let state = createCampaign(4);
    for (const region of REGIONS.slice(0, 5)) state = withMeter(state, region.id, 'enlighten', 100);

    expect(checkOutcome(state)).toBe('won');
  });

  test('exposure reaching 100 loses the campaign', () => {
    const state = { ...createCampaign(5), exposure: 100 };

    expect(checkOutcome(state)).toBe('lost');
  });

  test('endTurn is deterministic for a seed and does not mutate its input', () => {
    const first = assignAction(createCampaign(8675309), 'europe', 'arm-faction');
    const snapshot = structuredClone(first);

    expect(endTurn(first)).toEqual(endTurn(first));
    expect(first).toEqual(snapshot);
  });
});
