import { REGIONS } from './data.ts';
import { generateOffers } from './missions.ts';
import { freshRoster } from './roster.ts';
import type { CampaignState, MissionOffer, MissionProgress, RegionState, Soldier } from './types.ts';

export const SAVE_VERSION = 3;

interface SaveEnvelope {
  version: number;
  campaign: CampaignState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Non-negative integer (career kills, recruit counter). */
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
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

function isOffer(value: unknown): value is MissionOffer {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.regionId === 'string'
    && ['recover', 'assassinate', 'clash'].includes(String(value.type))
    && ['subvert', 'force', 'enlighten'].includes(String(value.path))
    && isNumber(value.seed)
    && ['open', 'launched', 'won', 'lost'].includes(String(value.status));
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

/** Validates a single roster soldier: ids, values, HP bounds and alive/HP. */
function isSoldier(value: unknown): value is Soldier {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || typeof value.name !== 'string') return false;
  if (!isNumber(value.hp) || !isNumber(value.maxHp)) return false;
  if (!isCount(value.kills)) return false;
  if (value.rank !== 0 && value.rank !== 1) return false;
  if (typeof value.alive !== 'boolean') return false;
  if (value.weapon !== 'rifle' && value.weapon !== 'shotgun') return false;
  if (value.hp < 0 || value.maxHp <= 0 || value.hp > value.maxHp) return false;
  // alive/HP consistency: living soldiers have positive HP, KIA have none.
  if (value.alive !== value.hp > 0) return false;
  return true;
}

/** Four uniquely-identified roster slots. */
function isRoster(value: unknown): value is Soldier[] {
  if (!Array.isArray(value) || value.length !== 4) return false;
  if (!value.every(isSoldier)) return false;
  return new Set(value.map((soldier) => soldier.id)).size === 4;
}

/** Validates every pre-v2 field (offers and spentMissionAgents checked separately). */
function isCampaignStateCore(value: unknown): value is CampaignState {
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

/** Every field added since v1, save the roster (offers, spent agents). */
function isCampaignStateV2(value: unknown): value is CampaignState {
  return isCampaignStateCore(value)
    && isNumber(value.spentMissionAgents)
    && Array.isArray(value.offers)
    && value.offers.every(isOffer);
}

/** A full current (v3) campaign: v2 fields plus a valid roster and recruit count. */
function isCampaignState(value: unknown): value is CampaignState {
  return isCampaignStateV2(value)
    && isRoster(value.roster)
    && isCount(value.recruitCount);
}

/** A version-2 save predates the roster; seed a fresh one without touching progress. */
function migrateFromV2(campaign: CampaignState): CampaignState {
  return { ...campaign, roster: freshRoster(), recruitCount: 0 };
}

/** A version-1 save predates offers and spent agents too; backfill both, then the roster. */
function migrateFromV1(campaign: CampaignState): CampaignState {
  return migrateFromV2({
    ...campaign,
    offers: generateOffers(campaign),
    spentMissionAgents: 0,
  });
}

export function serializeCampaign(campaign: CampaignState): string {
  const envelope: SaveEnvelope = { version: SAVE_VERSION, campaign };
  return JSON.stringify(envelope);
}

export function deserializeCampaign(raw: string | null): CampaignState | null {
  if (!raw) return null;
  try {
    const envelope: unknown = JSON.parse(raw);
    if (!isRecord(envelope) || typeof envelope.version !== 'number') return null;
    if (envelope.version === SAVE_VERSION) {
      if (!isCampaignState(envelope.campaign)) return null;
      return structuredClone(envelope.campaign);
    }
    if (envelope.version === 2) {
      if (!isCampaignStateV2(envelope.campaign)) return null;
      return migrateFromV2(structuredClone(envelope.campaign));
    }
    if (envelope.version === 1) {
      if (!isCampaignStateCore(envelope.campaign)) return null;
      return migrateFromV1(structuredClone(envelope.campaign));
    }
    return null;
  } catch {
    return null;
  }
}