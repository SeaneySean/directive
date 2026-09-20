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
    expect(deserializeCampaign(JSON.stringify({ version: 2, campaign: createCampaign(1) }))).toBeNull();
  });

  test('rejects structurally invalid campaign values', () => {
    const campaign = createCampaign(7);
    expect(deserializeCampaign(JSON.stringify({ version: 1, campaign: { ...campaign, turn: 'one' } }))).toBeNull();
    expect(deserializeCampaign(JSON.stringify({ version: 1, campaign: { ...campaign, regions: [] } }))).toBeNull();
    expect(deserializeCampaign(JSON.stringify({ version: 1, campaign: { ...campaign, outcome: 'victory' } }))).toBeNull();
    expect(deserializeCampaign(JSON.stringify({ version: 1, campaign: { ...campaign, assignments: [] } }))).toBeNull();
  });
});
