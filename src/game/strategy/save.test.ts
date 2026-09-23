import { describe, expect, test } from 'bun:test';
import { createCampaign } from './campaign.ts';
import { deserializeCampaign, serializeCampaign } from './save.ts';

describe('campaign saves', () => {
  test('round-trips a versioned campaign without sharing references', () => {
    const campaign = createCampaign(42);
    const restored = deserializeCampaign(serializeCampaign(campaign));
    expect(restored).toEqual(campaign);
    expect(restored).not.toBe(campaign);
    expect(restored!.regions).not.toBe(campaign.regions);
  });

  test('rejects malformed and unsupported saves', () => {
    expect(deserializeCampaign(null)).toBeNull();
    expect(deserializeCampaign('{nope')).toBeNull();
    expect(deserializeCampaign(JSON.stringify({ version: 4, campaign: createCampaign(1) }))).toBeNull();
  });

  test('migrates a version-1 save without losing campaign progress', () => {
    const campaign = createCampaign(42);
    const parsed: { version: number; campaign: Record<string, unknown> } = JSON.parse(serializeCampaign(campaign));
    parsed.version = 1;
    delete parsed.campaign.offers;
    delete parsed.campaign.spentMissionAgents;
    const restored = deserializeCampaign(JSON.stringify(parsed));
    expect(restored).not.toBeNull();
    expect(restored!.offers).toHaveLength(campaign.regions.length);
    expect(restored!.offers.every((offer) => offer.status === 'open')).toBe(true);
    expect(restored!.spentMissionAgents).toBe(0);
    expect(restored!.turn).toBe(campaign.turn);
    expect(restored!.treasury).toBe(campaign.treasury);
  });

  test('rejects structurally invalid offer fields', () => {
    const campaign = createCampaign(7);
    const badOffer = { ...campaign, offers: [{ ...campaign.offers[0], status: 'weird' }] };
    expect(deserializeCampaign(JSON.stringify({ version: 2, campaign: badOffer }))).toBeNull();
    const noOffers = { ...campaign, offers: 'nope' };
    expect(deserializeCampaign(JSON.stringify({ version: 2, campaign: noOffers }))).toBeNull();
  });

  test('rejects structurally invalid campaign values', () => {
    const campaign = createCampaign(7);
    expect(deserializeCampaign(JSON.stringify({ version: 1, campaign: { ...campaign, turn: 'one' } }))).toBeNull();
    expect(deserializeCampaign(JSON.stringify({ version: 1, campaign: { ...campaign, regions: [] } }))).toBeNull();
    expect(deserializeCampaign(JSON.stringify({ version: 1, campaign: { ...campaign, outcome: 'victory' } }))).toBeNull();
    expect(deserializeCampaign(JSON.stringify({ version: 1, campaign: { ...campaign, assignments: [] } }))).toBeNull();
  });

  test('round-trips a version-3 roster without reseeding it', () => {
    const campaign = createCampaign(41);
    const wounded = { ...campaign, roster: campaign.roster.map((soldier, i) =>
      i === 0 ? { ...soldier, hp: 5, kills: 6, rank: 1 as const } : soldier,
    ) };
    const restored = deserializeCampaign(serializeCampaign(wounded));
    expect(restored).toEqual(wounded);
    expect(restored!.roster[0]).toEqual({ id: 's1', name: 'Cole', hp: 5, maxHp: 12, kills: 6, rank: 1, alive: true, weapon: 'rifle' });
  });

  test('migrates a version-2 save by seeding a fresh roster without losing progress', () => {
    const campaign = createCampaign(42);
    const parsed: { version: number; campaign: Record<string, unknown> } = JSON.parse(serializeCampaign(campaign));
    parsed.version = 2;
    delete parsed.campaign.roster;
    delete parsed.campaign.recruitCount;
    const restored = deserializeCampaign(JSON.stringify(parsed));
    expect(restored).not.toBeNull();
    expect(restored!.roster).toEqual([
      { id: 's1', name: 'Cole', hp: 12, maxHp: 12, kills: 0, rank: 0, alive: true, weapon: 'rifle' },
      { id: 's2', name: 'Diaz', hp: 12, maxHp: 12, kills: 0, rank: 0, alive: true, weapon: 'rifle' },
      { id: 's3', name: 'Okafor', hp: 12, maxHp: 12, kills: 0, rank: 0, alive: true, weapon: 'shotgun' },
      { id: 's4', name: 'Reyes', hp: 12, maxHp: 12, kills: 0, rank: 0, alive: true, weapon: 'rifle' },
    ]);
    expect(restored!.recruitCount).toBe(0);
    expect(restored!.treasury).toBe(campaign.treasury);
    expect(restored!.turn).toBe(campaign.turn);
  });

  test('rejects malformed rosters: duplicate ids, bad weapon/rank, non-integer kills, HP bounds, alive/HP mismatch', () => {
    const seed = createCampaign(43);
    const wrap = (roster: unknown) => JSON.stringify({ version: 3, campaign: { ...seed, roster } });

    const duplicate = seed.roster.map((soldier) => ({ ...soldier, id: 's1' }));
    expect(deserializeCampaign(wrap(duplicate))).toBeNull();

    expect(deserializeCampaign(wrap(seed.roster.map((s) => ({ ...s, weapon: 'laser' }))))).toBeNull();
    expect(deserializeCampaign(wrap(seed.roster.map((s) => ({ ...s, rank: 2 }))))).toBeNull();
    expect(deserializeCampaign(wrap(seed.roster.map((s, i) => (i === 0 ? { ...s, kills: 1.5 } : s))))).toBeNull();
    expect(deserializeCampaign(wrap(seed.roster.map((s, i) => (i === 0 ? { ...s, kills: -1 } : s))))).toBeNull();
    expect(deserializeCampaign(wrap(seed.roster.map((s, i) => (i === 0 ? { ...s, hp: 13 } : s))))).toBeNull();
    expect(deserializeCampaign(wrap(seed.roster.map((s, i) => (i === 0 ? { ...s, alive: true, hp: 0 } : s))))).toBeNull();
    expect(deserializeCampaign(wrap(seed.roster.map((s, i) => (i === 0 ? { ...s, alive: false, hp: 5 } : s))))).toBeNull();
    expect(deserializeCampaign(wrap(seed.roster.slice(0, 3)))).toBeNull();
  });
});
