import type { MissionType } from '../types.ts';

export const PATHS = ['subvert', 'force', 'enlighten'] as const;

export type InfluencePath = (typeof PATHS)[number];
export type CampaignOutcome = 'playing' | 'won' | 'lost';
export type EndingId = 'exposed' | 'machine-ascends' | 'quiet-throne' | 'pax-illuminata' | 'long-dawn';
export type MissionStatus = 'in-progress' | 'completed' | 'failed';

export type MissionOfferStatus = 'open' | 'launched' | 'won' | 'lost';

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
  bonusAgents: number;
  outcome: CampaignOutcome;
  endingId: EndingId | null;
}
