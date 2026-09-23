import type { MissionType } from '../types.ts';

export const PATHS = ['subvert', 'force', 'enlighten'] as const;

export type InfluencePath = (typeof PATHS)[number];
export type CampaignOutcome = 'playing' | 'won' | 'lost';
export type EndingId = 'exposed' | 'machine-ascends' | 'quiet-throne' | 'pax-illuminata' | 'long-dawn';
export type MissionStatus = 'in-progress' | 'completed' | 'failed';

export type MissionOfferStatus = 'open' | 'launched' | 'won' | 'lost';

/** Base squad loadout, chosen per soldier; not a shop. */
export type WeaponId = 'rifle' | 'shotgun';

/** Squad rank: 0 = "Agent", 1 = "Operative" (achieved at five career kills). */
export type Rank = 0 | 1;

/**
 * A persistent squad member carried on the campaign between missions. Killed
 * soldiers stay in the roster (retaining their identity until replaced) so the
 * roster always has four slots.
 */
export interface Soldier {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  kills: number;
  rank: Rank;
  alive: boolean;
  weapon: WeaponId;
}

/** A per-region, per-turn generated mission, frozen until the next campaign turn. */
export interface MissionOffer {
  /** Turn-scoped identity: `${regionId}:${turn}`, stable within a turn. */
  id: string;
  regionId: string;
  type: MissionType;
  path: InfluencePath;
  seed: number;
  status: MissionOfferStatus;
}

export interface MissionProgress {
  status: MissionStatus;
  retryTurn?: number;
}

export interface InfluenceMeters {
  subvert: number;
  force: number;
  enlighten: number;
}

export interface RegionDefinition {
  id: string;
  name: string;
  resistance: number;
  wealth: number;
}

export interface RegionState extends RegionDefinition {
  meters: InfluenceMeters;
  held: boolean;
}

export interface ActionDefinition {
  id: string;
  name: string;
  path: InfluencePath;
  cost: number;
  effects: Partial<Record<InfluencePath, number>>;
  exposure: number;
  resistanceDelta?: number;
  minimum?: Partial<Record<InfluencePath, number>>;
  requires?: string;
}

export interface CampaignState {
  seed: number;
  turn: number;
  treasury: number;
  exposure: number;
  agents: number;
  regions: RegionState[];
  assignments: Record<string, string>;
  activeResearch: string | null;
  researchPoints: number;
  completedResearch: string[];
  items: string[];
  flags: string[];
  firedEvents: string[];
  unlockedMissions: string[];
  missions: Record<string, MissionProgress>;
  /** One frozen generated mission per region, regenerated each campaign turn. */
  offers: MissionOffer[];
  /** Agents consumed by launched generated missions this turn (0..agents). */
  spentMissionAgents: number;
  /** The four persistent squad members, in roster order (KIA entries retained). */
  roster: Soldier[];
  /** Number of recruits hired so far; drives deterministic recruit ids/names. */
  recruitCount: number;
  bonusAgents: number;
  outcome: CampaignOutcome;
  endingId: EndingId | null;
}
