import { describe, expect, test } from 'bun:test';
import { ACTIONS, REGIONS } from './data.ts';
import {
  assignAction,
  checkOutcome,
  createCampaign,
  endTurn,
  heldRegions,
  isActionAvailable,
  visibleMeter,
} from './campaign.ts';
import { RESEARCH, chooseResearch } from './research.ts';
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
    const state = assignAction(withMeter(createCampaign(3), 'north-america', 'force', 99), 'north-america', 'arm-faction');
    const next = endTurn(state);

    expect(next.regions.find((region) => region.id === 'north-america')?.held).toBe(true);
    expect(heldRegions(next)).toHaveLength(1);
  });

  test('holding five regions wins the campaign', () => {
    let state = createCampaign(4);
    for (const region of REGIONS.slice(0, 5)) state = withMeter(state, region.id, 'enlighten', 100);

    expect(checkOutcome(state).outcome).toBe('won');
    expect(checkOutcome(state).endingId).toBe('long-dawn');
  });

  test('exposure reaching 100 loses the campaign', () => {
    const state = { ...createCampaign(5), exposure: 100 };

    expect(checkOutcome(state).outcome).toBe('lost');
    expect(checkOutcome(state).endingId).toBe('exposed');
  });

  test('endTurn is deterministic for a seed and does not mutate its input', () => {
    const first = assignAction(createCampaign(8675309), 'europe', 'arm-faction');
    const snapshot = structuredClone(first);

    expect(endTurn(first)).toEqual(endTurn(first));
    expect(first).toEqual(snapshot);
  });

  test('research gates actions and changes action costs and effects', () => {
    const fresh = createCampaign(20);
    expect(isActionAvailable(fresh, 'north-america', 'coup')).toBe(false);
    expect(isActionAvailable({ ...fresh, completedResearch: ['weaponry-1'] }, 'north-america', 'coup')).toBe(false);
    const forceReady = withMeter({ ...fresh, completedResearch: ['weaponry-1'] }, 'north-america', 'force', 50);
    expect(isActionAvailable(forceReady, 'north-america', 'coup')).toBe(true);

    const favourable = { ...fresh, flags: ['favourable-law'] };
    expect(assignAction(favourable, 'europe', 'buy-media').treasury).toBe(fresh.treasury - 6);

    const normal = endTurn(assignAction(fresh, 'south-america', 'buy-media'));
    const researched = { ...fresh, completedResearch: ['psychology-1', 'psychology-2'] };
    const enhanced = endTurn(assignAction(researched, 'south-america', 'buy-media'));
    expect(enhanced.regions[1]!.meters.subvert - normal.regions[1]!.meters.subvert).toBe(26);
    expect(normal.exposure).toBe(2);
    expect(enhanced.exposure).toBe(1);
  });

  test('Surveillance Net reveals exact meters and Neural Lace adds an agent', () => {
    const state = createCampaign(21);
    expect(visibleMeter(state, 54)).toBe(50);
    expect(visibleMeter({ ...state, completedResearch: ['cybernetics-1'] }, 54)).toBe(54);
    const next = endTurn({ ...state, completedResearch: ['cybernetics-1', 'cybernetics-2'] });
    expect(next.agents).toBe(4);
  });

  test('endTurn advances the active research project', () => {
    const chosen = chooseResearch(createCampaign(22), 'psychology-1');
    const next = endTurn(chosen);
    expect(next.activeResearch).toBe('psychology-1');
    expect(next.researchPoints).toBeGreaterThan(0);
    expect(next.researchPoints).toBeLessThan(RESEARCH['psychology-1'].cost);
  });

  test('AGI wins unless exposure has reached 100', () => {
    const agi = { ...createCampaign(23), completedResearch: ['cybernetics-3'] };
    expect(checkOutcome(agi)).toMatchObject({ outcome: 'won', endingId: 'machine-ascends' });
    expect(checkOutcome({ ...agi, exposure: 100 })).toMatchObject({ outcome: 'lost', endingId: 'exposed' });
  });

  test('dominant path endings use deterministic Subvert, Force, Enlighten tie order', () => {
    const held = createCampaign(24).regions.map((region, index) => ({ ...region, held: index < 5 }));
    const tied = { ...createCampaign(24), regions: held };
    expect(checkOutcome(tied).endingId).toBe('quiet-throne');

    const force = withMeter(tied, 'oceania', 'force', 1);
    expect(checkOutcome(force).endingId).toBe('pax-illuminata');

    const enlighten = withMeter(force, 'oceania', 'enlighten', 2);
    expect(checkOutcome(enlighten).endingId).toBe('long-dawn');
  });
});
