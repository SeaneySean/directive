export const PATHS = ['subvert', 'force', 'enlighten'] as const;

export type InfluencePath = (typeof PATHS)[number];
export type CampaignOutcome = 'playing' | 'won' | 'lost';

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
  outcome: CampaignOutcome;
}
