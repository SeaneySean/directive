import { describe, expect, test } from 'bun:test';
import { assignAction, createCampaign, isActionAvailable } from './campaign.ts';
import {
  availableOffers,
  completeOffer,
  launchOffer,
  offerById,
  offerScenario,
  OFFER_EXPOSURE,
  remainingAgents,
} from './missions.ts';
import type { MissionType } from '../types.ts';
import type { CampaignState, InfluencePath, MissionOffer } from './types.ts';

const ALL_EVENTS = ['candidate', 'leak', 'whistleblower', 'miracle-at-the-well', 'summit'];

/** Fire every event so none can block a launch mid-test. */
function noEvents(state: CampaignState): CampaignState {
  return { ...state, firedEvents: ALL_EVENTS };
}

/** A valid open offer for `regionId`, using `state.turn` as its spawn turn. */
function openOffer(state: CampaignState, regionId: string, type: MissionType, path: InfluencePath): MissionOffer {
  return {
    id: `${regionId}:${state.turn}`,
    regionId,
    type,
    path,
    seed: 123456789,
    status: 'open',
    spawnTurn: state.turn,
    expiresTurn: state.turn + 3,
  };
}

function withOffer(state: CampaignState, offer: MissionOffer): CampaignState {
  return { ...state, offers: [offer] };
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
  test('launching an offer spends one agent until the next turn', () => {
    let state = withOffer(createCampaign(3), openOffer(createCampaign(3), 'north-america', 'recover', 'subvert'));
    const offerId = state.offers[0]!.id;
    expect(remainingAgents(state)).toBe(3);
    const launched = launchOffer(state, offerId);
    expect(launched).not.toBe(state);
    expect(remainingAgents(launched)).toBe(2);
    expect(offerById(launched, offerId)!.status).toBe('launched');
    // Agent capacity is enforced in the action API too.
    state = assignAction(launched, 'north-america', 'buy-media');
    state = assignAction(state, 'south-america', 'buy-media');
    expect(Object.keys(state.assignments)).toHaveLength(2);
    expect(assignAction(state, 'europe', 'buy-media')).toEqual(state);
    expect(isActionAvailable(state, 'europe', 'buy-media')).toBe(false);
  });

  test('an offer can be attempted once per turn; repeated launch and completion are no-ops', () => {
    let state = withOffer(createCampaign(4), openOffer(createCampaign(4), 'north-america', 'assassinate', 'subvert'));
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
    state = withOffer(state, openOffer(state, 'africa', 'recover', 'subvert'));
    const offerId = state.offers[0]!.id;
    state = launchOffer(state, offerId);
    const won = completeOffer(state, offerId, 'won');
    const region = won.regions.find((candidate) => candidate.id === 'africa')!;
    expect(region.meters.subvert).toBe(55);
    expect(region.resistance).toBe(Math.max(0, 1 - 5)); // Africa resistance is 1 -> 0
    expect(offerById(won, offerId)!.status).toBe('won');

    let cappedState = withMeter(createCampaign(5), 'africa', 'subvert', 90);
    cappedState = withOffer(cappedState, openOffer(cappedState, 'africa', 'recover', 'subvert'));
    const capped = completeOffer(launchOffer(cappedState, cappedState.offers[0]!.id), cappedState.offers[0]!.id, 'won');
    expect(capped.regions.find((candidate) => candidate.id === 'africa')!.meters.subvert).toBe(100);
  });

  test('a loss costs 20 treasury floored at zero, and no influence is granted', () => {
    let state = { ...createCampaign(6), treasury: 15 };
    state = withOffer(state, openOffer(state, 'oceania', 'clash', 'force'));
    const offerId = state.offers[0]!.id;
    state = launchOffer(state, offerId);
    const lost = completeOffer(state, offerId, 'lost');
    expect(lost.treasury).toBe(0);
    expect(lost.regions.find((candidate) => candidate.id === 'oceania')!.meters.subvert).toBe(0);
    expect(offerById(lost, offerId)!.status).toBe('lost');
  });

  test('exposure is applied once on completion, halved for Enlighten offers and capped', () => {
    let plain = withOffer(createCampaign(7), openOffer(createCampaign(7), 'south-america', 'clash', 'force'));
    plain = launchOffer(plain, plain.offers[0]!.id);
    const won = completeOffer(plain, plain.offers[0]!.id, 'won');
    expect(won.exposure).toBe(OFFER_EXPOSURE.clash);

    let enlighten = noEvents(withMeter(createCampaign(8), 'south-america', 'enlighten', 50));
    enlighten = withOffer(enlighten, openOffer(enlighten, 'south-america', 'clash', 'enlighten'));
    enlighten = launchOffer(enlighten, enlighten.offers[0]!.id);
    const enlightenWon = completeOffer(enlighten, enlighten.offers[0]!.id, 'won');
    expect(enlightenWon.exposure).toBe(Math.floor(OFFER_EXPOSURE.clash / 2));
  });

  test('launching is rejected during a pending event, an active mission, or a finished campaign', () => {
    const event = withOffer({ ...createCampaign(9), turn: 3 }, openOffer({ ...createCampaign(9), turn: 3 }, 'north-america', 'recover', 'subvert'));
    expect(launchOffer(event, event.offers[0]!.id)).toEqual(event);

    const active = withOffer(
      { ...createCampaign(10), missions: { 'area-51': { status: 'in-progress' } } },
      openOffer(createCampaign(10), 'north-america', 'recover', 'subvert'),
    );
    expect(launchOffer(active, active.offers[0]!.id)).toEqual(active);

    const done = withOffer(
      { ...createCampaign(11), outcome: 'won', endingId: 'quiet-throne' },
      openOffer(createCampaign(11), 'north-america', 'recover', 'subvert'),
    );
    expect(launchOffer(done, done.offers[0]!.id)).toEqual(done);
  });

  test('winning a mission on the fifth region ends the campaign immediately', () => {
    let state = createCampaign(12);
    state = { ...state, regions: state.regions.map((region, index) => ({ ...region, held: index < 4 })) };
    state = withMeter(state, 'russia', 'subvert', 65);
    state = noEvents(withOffer(state, openOffer(state, 'russia', 'recover', 'subvert')));
    const offerId = state.offers[0]!.id;
    state = launchOffer(state, offerId);
    const won = completeOffer(state, offerId, 'won');
    expect(won.outcome).toBe('won');
    expect(won.endingId).toBe('quiet-throne');
  });

  test('exposure hitting 100 on a win loses the campaign, preserving loss precedence', () => {
    const base = withOffer(
      { ...createCampaign(13), exposure: 96 },
      openOffer({ ...createCampaign(13), exposure: 96 }, 'north-america', 'recover', 'subvert'),
    );
    let state = noEvents(base);
    const offerId = state.offers[0]!.id;
    state = launchOffer(state, offerId);
    const won = completeOffer(state, offerId, 'won');
    expect(won.outcome).toBe('lost');
    expect(won.endingId).toBe('exposed');
    expect(offerById(won, offerId)!.status).toBe('won');
    expect(won.regions[0]!.meters.subvert).toBe(35); // still granted
  });

  test('generated missions receive the researched plasma upgrade', () => {
    const plain = withOffer(createCampaign(15), openOffer(createCampaign(15), 'north-america', 'recover', 'subvert'));
    const upgraded = { ...plain, completedResearch: ['weaponry-2'] };
    const id = 'north-america:1';
    expect(offerScenario(plain, id).units.some((unit) => unit.team === 'squad' && unit.weapon.name === 'Plasma')).toBe(false);
    expect(offerScenario(upgraded, id).units.filter((unit) => unit.team === 'squad').every((unit) => unit.weapon.name === 'Plasma')).toBe(true);
  });
});