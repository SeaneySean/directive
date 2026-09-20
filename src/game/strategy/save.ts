import { REGIONS } from './data.ts';
import type { CampaignState, MissionProgress, RegionState } from './types.ts';

export const SAVE_VERSION = 1;

interface SaveEnvelope {
  version: typeof SAVE_VERSION;
  campaign: CampaignState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

function isMissionProgress(value: unknown): value is MissionProgress {
  if (!isRecord(value) || !['in-progress', 'completed', 'failed'].includes(String(value.status))) return false;
  return value.retryTurn === undefined || isNumber(value.retryTurn);
}

function isMissions(value: unknown): value is CampaignState['missions'] {
  return isRecord(value) && Object.values(value).every(isMissionProgress);
}

function isRegion(value: unknown, index: number): value is RegionState {
  if (!isRecord(value) || !isRecord(value.meters)) return false;
  const definition = REGIONS[index];
  return Boolean(
    definition
    && value.id === definition.id
    && value.name === definition.name
    && isNumber(value.resistance)
    && isNumber(value.wealth)
    && typeof value.held === 'boolean'
    && isNumber(value.meters.subvert)
    && isNumber(value.meters.force)
    && isNumber(value.meters.enlighten),
  );
}

function isCampaignState(value: unknown): value is CampaignState {
  if (!isRecord(value)) return false;
  const numericKeys = ['seed', 'turn', 'treasury', 'exposure', 'agents', 'researchPoints', 'bonusAgents'] as const;
  if (!numericKeys.every((key) => isNumber(value[key]))) return false;
  if (!Array.isArray(value.regions)
    || value.regions.length !== REGIONS.length
    || !value.regions.every(isRegion)) return false;
  if (!isStringRecord(value.assignments)
    || !(value.activeResearch === null || typeof value.activeResearch === 'string')) return false;
  if (!isStringArray(value.completedResearch)
    || !isStringArray(value.items)
    || !isStringArray(value.flags)
    || !isStringArray(value.firedEvents)
    || !isStringArray(value.unlockedMissions)
    || !isMissions(value.missions)) return false;
  if (!['playing', 'won', 'lost'].includes(String(value.outcome))) return false;
  return value.endingId === null || [
    'exposed',
    'machine-ascends',
    'quiet-throne',
    'pax-illuminata',
    'long-dawn',
  ].includes(String(value.endingId));
}

export function serializeCampaign(campaign: CampaignState): string {
  const envelope: SaveEnvelope = { version: SAVE_VERSION, campaign };
  return JSON.stringify(envelope);
}

export function deserializeCampaign(raw: string | null): CampaignState | null {
  if (!raw) return null;
  try {
    const envelope: unknown = JSON.parse(raw);
    if (!isRecord(envelope) || envelope.version !== SAVE_VERSION || !isCampaignState(envelope.campaign)) {
      return null;
    }
    return structuredClone(envelope.campaign);
  } catch {
    return null;
  }
}
