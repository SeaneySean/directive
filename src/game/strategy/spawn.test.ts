import { describe, expect, test } from 'bun:test';
import { assignAction, createCampaign, endTurn } from './campaign.ts';
import {
  completeOffer,
  expireOffers,
  launchOffer,
  offerById,
  offerExpiresTurn,
  offerTransition,
  offerTypeForPath,
  spawnOffers,
  OPEN_OFFER_CAP,
} from './missions.ts';
import type { CampaignState, MissionOffer } from './types.ts';

function makeOpenOffer(regionId: string, spawnTurn: number, overrides: Partial<MissionOffer> = {}): MissionOffer {
  return {
    id: `${regionId}:${spawnTurn}`,
    regionId,
    type: 'recover',
    path: 'subvert',
    seed: 4242,
    status: 'open',
    spawnTurn,
    expiresTurn: spawnTurn + 3,
    ...overrides,
  };
}

describe('mission spawn rules', () => {
  test('a campaign starts with no generated offers', () => {
    expect(createCampaign(1).offers).toHaveLength(0);
  });

  test('offer type maps deterministically from the action path', () => {
    expect(offerTypeForPath('force', 0.9)).toBe('clash');
    expect(offerTypeForPath('enlighten', 0.9)).toBe('recover');
    expect(offerTypeForPath('subvert', 0.1)).toBe('assassinate');
    expect(offerTypeForPath('subvert', 0.3)).toBe('recover');
  });

  test('spawns only from acted regions and is seed-deterministic', () => {
    const base = createCampaign(42);
    const assignments = { 'north-america': 'buy-media', 'south-america': 'arm-faction', 'europe': 'fund-abundance' };
    const run = () => spawnOffers(2, 999, base.regions, assignments, []);
    expect(run()).toEqual(run()); // identical inputs -> identical offers and seed
    const result = run();
    expect(result.offers.length).toBeLessThanOrEqual(OPEN_OFFER_CAP);
    for (const offer of result.offers) {
      expect(Object.keys(assignments)).toContain(offer.regionId);
    }
    // Every new offer carries the turn-scoped identity and a frozen expiry.
    for (const offer of result.offers) {
      expect(offer.id).toBe(`${offer.regionId}:2`);
      expect(offer.spawnTurn).toBe(2);
      expect(offer.expiresTurn).toBe(2 + 3);
    }
  });

  test('held regions are never visited for spawning', () => {
    const base = createCampaign(43);
    const held = base.regions.map((region) => (region.id === 'north-america' ? { ...region, held: true } : region));
    const result = spawnOffers(2, 5, held, { 'north-america': 'buy-media' }, []);
    expect(result.offers).toHaveLength(0);
  });

  test('a region already holding an open offer is not revisited', () => {
    const base = createCampaign(44);
    const existing = makeOpenOffer('north-america', 1, { expiresTurn: 6 });
    const result = spawnOffers(2, 8, base.regions, { 'north-america': 'buy-media', 'south-america': 'arm-faction' }, [existing]);
    // The surviving offer persists untouched; no fresh offer spawns in its region.
    expect(result.offers).toContainEqual(existing);
    for (const offer of result.offers) {
      if (offer.id !== existing.id) expect(offer.regionId).not.toBe('north-america');
    }
  });

  test('never spawns more than the two-open-offer cap, whatever the rolls', () => {
    const base = createCampaign(46);
    const assignments = {
      'north-america': 'buy-media',
      'south-america': 'arm-faction',
      europe: 'fund-abundance',
      'middle-east': 'buy-media',
      africa: 'found-movement',
      russia: 'arm-faction',
      asia: 'buy-media',
      oceania: 'fund-abundance',
    };
    for (let seed = 0; seed < 500; seed++) {
      const result = spawnOffers(2, seed, base.regions, assignments, []);
      expect(result.offers.length).toBeLessThanOrEqual(OPEN_OFFER_CAP);
    }
  });

  test('an empty idle turn spawns one clash via the pressure fallback', () => {
    const base = createCampaign(47);
    const result = spawnOffers(5, 123, base.regions, {}, []);
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]!.type).toBe('clash');
    expect(result.offers[0]!.path).toBe('force');
  });

  test('pressure spawn targets the unheld region with the highest Force, ties in REGIONS order', () => {
    const base = createCampaign(48);
    const forced = base.regions.map((region) =>
      region.id === 'africa' ? { ...region, meters: { ...region.meters, force: 60 } } : region,
    );
    expect(spawnOffers(5, 1, forced, {}, []).offers[0]!.regionId).toBe('africa');

    const tied = base.regions.map((region) =>
      region.id === 'north-america' || region.id === 'south-america'
        ? { ...region, meters: { ...region.meters, force: 42 } }
        : region,
    );
    expect(spawnOffers(5, 1, tied, {}, []).offers[0]!.regionId).toBe('north-america');
  });

  test('pressure spawn does nothing when every region is held', () => {
    const base = createCampaign(49);
    const held = base.regions.map((region) => ({ ...region, held: true }));
    expect(spawnOffers(5, 1, held, {}, []).offers).toHaveLength(0);
  });

  test('an offer expires three turns after it spawns', () => {
    expect(offerExpiresTurn(2)).toBe(5);
  });

  test('expireOffers drops expired open offers and terminal records but keeps launched ones', () => {
    const expired = makeOpenOffer('europe', 2, { expiresTurn: 3 });
    const alive = makeOpenOffer('asia', 2, { expiresTurn: 6 });
    const launched = makeOpenOffer('africa', 2, { status: 'launched', expiresTurn: 3 });
    const won = makeOpenOffer('oceania', 2, { status: 'won', expiresTurn: 3 });
    const kept = expireOffers([expired, alive, launched, won], 3);
    expect(kept.map((offer) => offer.regionId).sort()).toEqual(['africa', 'asia']);
  });

  test('the exact expiry boundary removes an offer only on entry to expiresTurn', () => {
    const offer = makeOpenOffer('europe', 2, { expiresTurn: 5 });
    expect(expireOffers([offer], 4)).toContainEqual(offer); // still available entering turn 4
    expect(expireOffers([offer], 5)).toHaveLength(0);       // gone entering turn 5
  });

  test('a launched offer is never expired and settles after its expiry boundary', () => {
    const base = createCampaign(52);
    const launched = makeOpenOffer('europe', 3, { status: 'launched', expiresTurn: 4 });
    // Launch-status offers survive expiry at any resulting turn.
    expect(expireOffers([launched], 99)).toContainEqual(launched);
    // And they settle exactly once, awarding influence, even past their boundary.
    let state: CampaignState = { ...base, offers: [launched] };
    state = launchOffer(state, launched.id); // no-op: already launched
    const won = completeOffer(state, launched.id, 'won');
    expect(offerById(won, launched.id)!.status).toBe('won');
    expect(won.regions.find((region) => region.id === 'europe')!.meters.subvert).toBe(35);
  });

  test('surviving open offers persist across turns without regeneration', () => {
    let state = createCampaign(53);
    const survivor = makeOpenOffer('europe', 1, { expiresTurn: 10 });
    state = { ...state, offers: [survivor] };
    const next = endTurn(state);
    const kept = next.offers.find((offer) => offer.id === survivor.id);
    expect(kept).toBeTruthy();
    expect(kept!.seed).toBe(survivor.seed);
    expect(kept!.type).toBe(survivor.type);
    expect(kept!.path).toBe(survivor.path);
  });

  test('a region whose offer just expired can spawn a fresh offer next turn', () => {
    const base = createCampaign(54);
    const expiring = makeOpenOffer('europe', 1, { expiresTurn: 2 });
    const survivors = expireOffers([expiring], 2);
    expect(survivors).toHaveLength(0); // expiry ran before replacement spawning
    const result = spawnOffers(2, 7, base.regions, { europe: 'arm-faction' }, survivors);
    for (const offer of result.offers) expect(offer.regionId).toBe('europe');
  });

  test('spawn rolls advance the seed deterministically across identical endTurns', () => {
    const first = endTurn(assignAction(createCampaign(77), 'north-america', 'buy-media'));
    const second = endTurn(assignAction(createCampaign(77), 'north-america', 'buy-media'));
    expect(first.offers).toEqual(second.offers);
    expect(first.seed).toBe(second.seed);
    expect(first.seed).not.toBe(createCampaign(77).seed);
  });

  test('offerTransition reports spawned and expired offers from before/after state', () => {
    const before = createCampaign(60);
    const expiring = makeOpenOffer('europe', 1, { expiresTurn: 2 });
    const beforeState = { ...before, offers: [expiring] };
    const spawnedOffer = makeOpenOffer('north-america', 2);
    const afterState = { ...before, turn: 2, offers: [spawnedOffer] };
    const transition = offerTransition(beforeState, afterState);
    expect(transition.spawned.map((offer) => offer.regionId)).toEqual(['north-america']);
    expect(transition.expired.map((entry) => entry.regionName)).toEqual(['Europe']);
  });

  test('an endTurn spawn never mutates its input', () => {
    const input = assignAction(createCampaign(88), 'north-america', 'arm-faction');
    const snapshot = structuredClone(input);
    endTurn(input);
    expect(input).toEqual(snapshot);
  });
});