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
    expect(deserializeCampaign(JSON.stringify({ version: 3, campaign: createCampaign(1) }))).toBeNull();
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
});
