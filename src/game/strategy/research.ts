import type { CampaignState } from './types.ts';

export type ResearchDiscipline = 'psychology' | 'weaponry' | 'cybernetics' | 'mythology';

export interface ResearchNode {
  id: string;
  name: string;
  discipline: ResearchDiscipline;
  cost: number;
  requires: string[];
  grants: string[];
}

export const RESEARCH_BASE_POINTS = 12;
export const NEURAL_LACE_RESEARCH_BONUS = 4;
export const RESEARCH_INCOME_DIVISOR = 4;
export const AURICHALCUM_MULTIPLIER = 1.5;

export const RESEARCH: Readonly<Record<string, ResearchNode>> = {
  'psychology-1': {
    id: 'psychology-1', name: 'Mass Persuasion', discipline: 'psychology', cost: 18,
    requires: [], grants: ['mass-persuasion'],
  },
  'psychology-2': {
    id: 'psychology-2', name: 'Manufactured Consent', discipline: 'psychology', cost: 28,
    requires: ['psychology-1'], grants: ['manufactured-consent'],
  },
  'weaponry-1': {
    id: 'weaponry-1', name: 'Private Armies', discipline: 'weaponry', cost: 18,
    requires: [], grants: ['coup'],
  },
  'weaponry-2': {
    id: 'weaponry-2', name: 'Plasma Small Arms', discipline: 'weaponry', cost: 30,
    requires: ['weaponry-1', 'alien-artefact'], grants: ['plasma-small-arms'],
  },
  'cybernetics-1': {
    id: 'cybernetics-1', name: 'Surveillance Net', discipline: 'cybernetics', cost: 18,
    requires: [], grants: ['exact-meters'],
  },
  'cybernetics-2': {
    id: 'cybernetics-2', name: 'Neural Lace', discipline: 'cybernetics', cost: 16,
    requires: ['cybernetics-1'], grants: ['bonus-agent'],
  },
  'cybernetics-3': {
    id: 'cybernetics-3', name: 'AGI', discipline: 'cybernetics', cost: 24,
    requires: ['cybernetics-2', 'mythology-3', 'aurichalcum'], grants: ['agi'],
  },
  'mythology-1': {
    id: 'mythology-1', name: 'Lost Archives', discipline: 'mythology', cost: 16,
    requires: [], grants: ['reveal-atlantis'],
  },
  'mythology-2': {
    id: 'mythology-2', name: 'Atlantis Expedition', discipline: 'mythology', cost: 24,
    requires: ['mythology-1'], grants: ['unlock-atlantis'],
  },
  'mythology-3': {
    id: 'mythology-3', name: 'Aurichalcum Electronics', discipline: 'mythology', cost: 16,
    requires: ['mythology-2'], grants: ['aurichalcum-electronics'],
  },
} as const;

export function completedResearchGrants(state: CampaignState): string[] {
  return state.completedResearch.flatMap((nodeId) => RESEARCH[nodeId]?.grants ?? []);
}

export function hasResearchGrant(state: CampaignState, grant: string): boolean {
  return completedResearchGrants(state).includes(grant);
}

function hasRequirement(state: CampaignState, requirement: string): boolean {
  return state.completedResearch.includes(requirement) || state.items.includes(requirement);
}

export function isResearchAvailable(state: CampaignState, nodeId: string): boolean {
  const node = RESEARCH[nodeId];
  return Boolean(
    node
    && !state.activeResearch
    && !state.completedResearch.includes(nodeId)
    && node.requires.every((requirement) => hasRequirement(state, requirement)),
  );
}

export function chooseResearch(state: CampaignState, nodeId: string): CampaignState {
  if (!isResearchAvailable(state, nodeId)) return state;
  return { ...state, activeResearch: nodeId, researchPoints: 0 };
}

export function researchProgress(state: CampaignState): number {
  const heldIncome = state.regions
    .filter((region) => region.held || Object.values(region.meters).some((meter) => meter >= 100))
    .reduce((sum, region) => sum + region.wealth, 0);
  const points = RESEARCH_BASE_POINTS
    + Math.floor(heldIncome / RESEARCH_INCOME_DIVISOR)
    + (state.completedResearch.includes('cybernetics-2') ? NEURAL_LACE_RESEARCH_BONUS : 0);
  return state.completedResearch.includes('mythology-3')
    ? Math.floor(points * AURICHALCUM_MULTIPLIER)
    : points;
}

export function advanceResearch(state: CampaignState): CampaignState {
  if (!state.activeResearch) return state;
  const node = RESEARCH[state.activeResearch];
  if (!node) return { ...state, activeResearch: null, researchPoints: 0 };
  const researchPoints = state.researchPoints + researchProgress(state);
  if (researchPoints < node.cost) return { ...state, researchPoints };
  return {
    ...state,
    activeResearch: null,
    researchPoints: 0,
    completedResearch: [...state.completedResearch, node.id],
  };
}

export function grantItem(state: CampaignState, itemId: string): CampaignState {
  if (state.items.includes(itemId)) return state;
  return { ...state, items: [...state.items, itemId] };
}
