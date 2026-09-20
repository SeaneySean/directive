import { describe, expect, test } from 'bun:test';
import { createCampaign, endTurn } from './campaign.ts';
import { EVENTS, pendingEvent, resolveEvent } from './events.ts';
import type { CampaignState, InfluencePath } from './types.ts';

function withMeter(
  state: CampaignState,
  regionId: string,
  path: InfluencePath,
  value: number,
): CampaignState {
  return {
    ...state,
    regions: state.regions.map((region) => region.id === regionId
      ? { ...region, meters: { ...region.meters, [path]: value } }
      : region),
  };
}

function firedAgain(state: CampaignState, eventId: string): boolean {
  return pendingEvent(state)?.id === eventId;
}

describe('campaign events', () => {
  test('The Candidate install and pass choices fire once', () => {
    const eligible = withMeter(createCampaign(10), 'north-america', 'subvert', 40);
    expect(pendingEvent(eligible)?.id).toBe('candidate');

    const installed = resolveEvent(eligible, 0);
    expect(installed.regions[0]!.meters.subvert).toBe(70);
    expect(installed.exposure).toBe(10);
    expect(installed.flags).toContain('favourable-law');
    expect(firedAgain(installed, 'candidate')).toBe(false);

    const passed = resolveEvent(eligible, 1);
    expect(passed.exposure).toBe(0);
    expect(passed.flags).not.toContain('favourable-law');
    expect(passed.firedEvents).toContain('candidate');
  });

  test('The Leak unlocks Area 51 and ignore adds exposure', () => {
    const eligible = { ...createCampaign(11), turn: 3 };
    expect(pendingEvent(eligible)?.id).toBe('leak');

    const responded = resolveEvent(eligible, 0);
    expect(responded.unlockedMissions).toContain('area-51');
    expect(responded.exposure).toBe(0);

    const ignored = resolveEvent(eligible, 1);
    expect(ignored.unlockedMissions).toContain('area-51');
    expect(ignored.exposure).toBe(15);
    expect(firedAgain(ignored, 'leak')).toBe(false);
  });

  test('Whistleblower pay is gated by treasury and fallback breaks ties by region order', () => {
    const rich = { ...createCampaign(12), exposure: 60, treasury: 30 };
    const paid = resolveEvent(rich, 0);
    expect(paid.treasury).toBe(0);
    expect(paid.firedEvents).toContain('whistleblower');
    expect(firedAgain(paid, 'whistleblower')).toBe(false);

    let tied = { ...createCampaign(13), exposure: 60, treasury: 29 };
    tied = withMeter(tied, 'north-america', 'subvert', 35);
    tied = withMeter(tied, 'europe', 'subvert', 35);
    expect(resolveEvent(tied, 0)).toBe(tied);
    const exposed = resolveEvent(tied, 1);
    expect(exposed.regions[0]!.meters.subvert).toBe(15);
    expect(exposed.regions[2]!.meters.subvert).toBe(35);
    expect(firedAgain(exposed, 'whistleblower')).toBe(false);
  });

  test('Miracle affects deterministic neighbours of the first qualifying region', () => {
    let eligible = withMeter(createCampaign(14), 'europe', 'enlighten', 50);
    eligible = withMeter(eligible, 'africa', 'enlighten', 60);
    const result = resolveEvent(eligible, 0);

    expect(pendingEvent(eligible)?.id).toBe('miracle-at-the-well');
    expect(result.regions.find((region) => region.id === 'russia')?.meters.enlighten).toBe(15);
    expect(result.regions.find((region) => region.id === 'middle-east')?.meters.enlighten).toBe(15);
    expect(firedAgain(result, 'miracle-at-the-well')).toBe(false);
  });

  test('The Summit accept adds a permanent agent and exposure while refuse does not', () => {
    let eligible = createCampaign(15);
    for (const region of eligible.regions.slice(0, 3)) {
      eligible = withMeter(eligible, region.id, 'force', 100);
    }

    const accepted = resolveEvent(eligible, 0);
    expect(accepted.bonusAgents).toBe(1);
    expect(accepted.agents).toBe(4);
    expect(accepted.exposure).toBe(20);
    expect(firedAgain(accepted, 'summit')).toBe(false);

    const refused = resolveEvent(eligible, 1);
    expect(refused.bonusAgents).toBe(0);
    expect(refused.exposure).toBe(0);
    expect(firedAgain(refused, 'summit')).toBe(false);
  });

  test('event order is canonical and a pending event blocks endTurn by identity', () => {
    expect(EVENTS.map((event) => event.id)).toEqual([
      'candidate', 'leak', 'whistleblower', 'miracle-at-the-well', 'summit',
    ]);
    let state = { ...createCampaign(16), turn: 3, exposure: 60 };
    state = withMeter(state, 'north-america', 'subvert', 40);
    expect(pendingEvent(state)?.id).toBe('candidate');
    expect(endTurn(state)).toBe(state);
  });
});
