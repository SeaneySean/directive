import { describe, expect, test } from 'bun:test';
import { assignAction, createCampaign, endTurn, isActionAvailable } from './campaign.ts';
import {
  availableOffers,
  completeOffer,
  generateOffers,
  launchOffer,
  offerById,
  offerPath,
  offerScenario,
  OFFER_EXPOSURE,
  OFFER_INFLUENCE_GAIN,
  remainingAgents,
} from './missions.ts';
import type { CampaignState, InfluencePath } from './types.ts';

const ALL_EVENTS = ['candidate', 'leak', 'whistleblower', 'miracle-at-the-well', 'summit'];

/** Fire every event so none can block a launch mid-test. */
function noEvents(state: CampaignState): CampaignState {
  return { ...state, firedEvents: ALL_EVENTS };
}

function withMeter(state: CampaignState, regionId: string, path: InfluencePath, value: number): CampaignState {
  return {
    ...state,
    regions: state.regions.map((region) =>
      region.id === regionId ? { ...region, meters: { ...region.meters, [path]: value } } : region,
    ),
  };
}

describe('campaign offers', () => {
  test('every region gets one open offer per turn, frozen and deterministic', () => {
    const state = createCampaign(1);
    expect(state.offers).toHaveLength(state.regions.length);
    expect(state.offers.every((offer) => offer.status === 'open')).toBe(true);
    // Regenerating with the same state yields identical offers (no reroll).
    expect(generateOffers(state)).toEqual(state.offers);
    // The derived scenario is also stable for a frozen offer.
    const first = offerScenario(state, state.offers[0]!.id);
    expect(offerScenario(state, state.offers[0]!.id)).toEqual(first);
  });

  test('offer path is the highest meter, ties breaking in Subvert order', () => {
    const state = createCampaign(2);
    // All meters zero: the tie resolves to Subvert.
    expect(offerPath(state.regions[0]!)).toBe('subvert');
    const forced = withMeter(state, 'north-america', 'enlighten', 50);
    expect(offerPath(forced.regions[0]!)).toBe('enlighten');
    expect(offerPath(withMeter(state, 'north-america', 'force', 30).regions[0]!)).toBe('force');
  });

  test('launching an offer spends one agent until the next turn', () => {
    let state = createCampaign(3);
    const offerId = state.offers[0]!.id;
    expect(remainingAgents(state)).toBe(3);
    const launched = launchOffer(state, offerId);
    expect(launched).not.toBe(state);
    expect(remainingAgents(launched)).toBe(2);
    expect(offerById(launched, offerId)!.status).toBe('launched');
    // Agent-capacity is enforced in the action API too.
    state = assignAction(launched, 'north-america', 'buy-media');
    state = assignAction(state, 'south-america', 'buy-media');
    expect(Object.keys(state.assignments)).toHaveLength(2);
    expect(assignAction(state, 'europe', 'buy-media')).toEqual(state);
    expect(isActionAvailable(state, 'europe', 'buy-media')).toBe(false);
  });

  test('an offer can be attempted once per turn; repeated launch and completion are no-ops', () => {
    let state = createCampaign(4);
    const offerId = state.offers[0]!.id;
    const launched = launchOffer(state, offerId);
    expect(launchOffer(launched, offerId)).toEqual(launched); // already launched
    const won = completeOffer(launched, offerId, 'won');
    expect(completeOffer(won, offerId, 'won')).toEqual(won); // already settled
    expect(completeOffer(won, offerId, 'lost')).toEqual(won); // no cross-result rewrite
    expect(offerById(won, offerId)!.status).toBe('won');
    expect(availableOffers(won).map((offer) => offer.id)).not.toContain(offerId);
  });

  test('a win raises the frozen path by 35 (capped at 100) and reduces Resistance by 5', () => {
    let state = withMeter(createCampaign(5), 'africa', 'subvert', 20);
    const offerId = 'africa:1';
    state = launchOffer(state, offerId);
    const won = completeOffer(state, offerId, 'won');
    const region = won.regions.find((candidate) => candidate.id === 'africa')!;
    expect(region.meters.subvert).toBe(55);
    expect(region.resistance).toBe(Math.max(0, 1 - 5)); // Africa resistance is 1 -> 0
    expect(offerById(won, offerId)!.status).toBe('won');

    const capped = completeOffer(launchOffer(withMeter(createCampaign(5), 'africa', 'subvert', 90), offerId), offerId, 'won');
    expect(capped.regions.find((candidate) => candidate.id === 'africa')!.meters.subvert).toBe(100);
  });

  test('a loss costs 20 treasury floored at zero, and no influence is granted', () => {
    let state = { ...createCampaign(6), treasury: 15 };
    state = launchOffer(state, 'oceania:1');
    const lost = completeOffer(state, 'oceania:1', 'lost');
    expect(lost.treasury).toBe(0);
    expect(lost.regions.find((candidate) => candidate.id === 'oceania')!.meters.subvert).toBe(0);
    expect(offerById(lost, 'oceania:1')!.status).toBe('lost');
  });

  test('exposure is applied once on completion, halved for Enlighten offers and capped', () => {
    const plain = completeOffer(launchOffer(createCampaign(7), 'south-america:1'), 'south-america:1', 'won');
    // south-america turn-1 offer type = clash (index 1 + 1 = 2 -> clash, +2 exposure)
    expect(plain.exposure).toBe(OFFER_EXPOSURE.clash);

    let enlighten = noEvents(withMeter(createCampaign(8), 'south-america', 'enlighten', 50));
    enlighten = { ...enlighten, offers: generateOffers(enlighten) };
    const enlightenOffer = 'south-america:1';
    expect(offerById(enlighten, enlightenOffer)!.path).toBe('enlighten');
    enlighten = launchOffer(enlighten, enlightenOffer);
    const enlightenWon = completeOffer(enlighten, enlightenOffer, 'won');
    expect(enlightenWon.exposure).toBe(Math.floor(OFFER_EXPOSURE.clash / 2));
  });

  test('launching is rejected during a pending event, an active mission, or a finished campaign', () => {
    // Pending event: turn 3 with Area 51 still unlocked-mention handling.
    const event = { ...createCampaign(9), turn: 3 };
    expect(launchOffer(event, event.offers.find((offer) => offer.regionId === 'north-america')!.id)).toEqual(event);

    // Active story mission.
    const active: CampaignState = { ...createCampaign(10), missions: { 'area-51': { status: 'in-progress' } } };
    expect(launchOffer(active, active.offers[0]!.id)).toEqual(active);

    // Finished campaign.
    const done: CampaignState = { ...createCampaign(11), outcome: 'won', endingId: 'quiet-throne' };
    expect(launchOffer(done, done.offers[0]!.id)).toEqual(done);
  });

  test('winning a mission on the fifth region ends the campaign immediately', () => {
    let state = createCampaign(12);
    state = { ...state, regions: state.regions.map((region, index) => ({ ...region, held: index < 4 })) };
    // Push the fifth region's Subvert toward 100 so a win tips it over.
    state = withMeter(state, 'russia', 'subvert', 65);
    state = noEvents({ ...state, offers: generateOffers(state) });
    const offerId = 'russia:1';
    state = launchOffer(state, offerId);
    const won = completeOffer(state, offerId, 'won');
    expect(won.outcome).toBe('won');
    expect(won.endingId).toBe('quiet-throne');
  });

  test('exposure hitting 100 on a win loses the campaign, preserving loss precedence', () => {
    let state = noEvents({ ...createCampaign(13), exposure: 96 });
    state = launchOffer(state, 'north-america:1');
    const won = completeOffer(state, 'north-america:1', 'won');
    expect(won.outcome).toBe('lost');
    expect(won.endingId).toBe('exposed');
    expect(offerById(won, 'north-america:1')!.status).toBe('won');
    expect(won.regions[0]!.meters.subvert).toBe(OFFER_INFLUENCE_GAIN); // still granted
  });

  test('ending the turn regenerates offers and frees spent agents', () => {
    let state = createCampaign(14);
    state = launchOffer(state, state.offers[0]!.id);
    expect(state.spentMissionAgents).toBe(1);
    const next = endTurn(state);
    expect(next.spentMissionAgents).toBe(0);
    expect(next.turn).toBe(2);
    expect(next.offers.every((offer) => offer.id.endsWith(':2') && offer.status === 'open')).toBe(true);
  });

  test('generated missions receive the researched plasma upgrade', () => {
    const plain = createCampaign(15);
    const upgraded = { ...plain, completedResearch: ['weaponry-2'] };
    const id = 'north-america:1';
    expect(offerScenario(plain, id).units.some((unit) => unit.team === 'squad' && unit.weapon.name === 'Plasma')).toBe(false);
    expect(offerScenario(upgraded, id).units.filter((unit) => unit.team === 'squad').every((unit) => unit.weapon.name === 'Plasma')).toBe(true);
  });
});