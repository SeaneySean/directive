import { deserializeCampaign, serializeCampaign } from '../game/strategy/save.ts';
import type { CampaignState } from '../game/strategy/types.ts';

export const CAMPAIGN_REGISTRY_KEY = 'campaign-state';
export const CAMPAIGN_SAVE_KEY = 'illuminatus-campaign-v1';

export function readCampaignSave(): CampaignState | null {
  try {
    return deserializeCampaign(globalThis.localStorage?.getItem(CAMPAIGN_SAVE_KEY) ?? null);
  } catch {
    return null;
  }
}

export function writeCampaignSave(state: CampaignState): void {
  try {
    globalThis.localStorage?.setItem(CAMPAIGN_SAVE_KEY, serializeCampaign(state));
  } catch {
    // Storage can be unavailable in privacy modes; the in-memory campaign still works.
  }
}

export function clearCampaignSave(): void {
  try {
    globalThis.localStorage?.removeItem(CAMPAIGN_SAVE_KEY);
  } catch {
    // Treat inaccessible storage as already clear.
  }
}
