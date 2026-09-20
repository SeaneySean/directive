import { describe, expect, test } from 'bun:test';
import { ACTIONS } from './data.ts';
import { createCampaign, heldRegions } from './campaign.ts';
import {
  RESEARCH,
  advanceResearch,
  chooseResearch,
  grantItem,
  researchProgress,
} from './research.ts';
import type { CampaignState } from './types.ts';

function completeActive(state: CampaignState): CampaignState {
  const active = RESEARCH[state.activeResearch!];
  return advanceResearch({ ...state, researchPoints: active.cost });
}

describe('research tree', () => {
  test('contains the ten canonical nodes and normalised action requirements', () => {
    expect(Object.keys(RESEARCH)).toEqual([
      'psychology-1',
      'psychology-2',
      'weaponry-1',
      'weaponry-2',
      'cybernetics-1',
      'cybernetics-2',
      'cybernetics-3',
      'mythology-1',
      'mythology-2',
      'mythology-3',
    ]);
    expect(ACTIONS.coup.requires).toBe('weaponry-1');
    expect(ACTIONS['open-archives'].requires).toBe('psychology-2');
  });

  test('each discipline is reachable only in prerequisite order', () => {
    let state = createCampaign(1);
    for (const chain of [
      ['psychology-1', 'psychology-2'],
      ['weaponry-1'],
      ['cybernetics-1', 'cybernetics-2'],
      ['mythology-1', 'mythology-2'],
    ]) {
      for (const nodeId of chain) {
        const chosen = chooseResearch(state, nodeId);
        expect(chosen).not.toBe(state);
        state = completeActive(chosen);
        expect(state.completedResearch).toContain(nodeId);
      }
    }

    for (const nodeId of ['psychology-2', 'weaponry-2', 'cybernetics-2', 'cybernetics-3', 'mythology-2', 'mythology-3']) {
      const fresh = createCampaign(2);
      const outOfOrder = chooseResearch(fresh, nodeId);
      expect(outOfOrder).toBe(fresh);
      expect(outOfOrder.activeResearch).toBeNull();
    }
  });

  test('item-gated nodes stay locked until the item is granted', () => {
    let state = createCampaign(3);
    state = completeActive(chooseResearch(state, 'weaponry-1'));
    expect(chooseResearch(state, 'weaponry-2')).toBe(state);
    state = grantItem(state, 'alien-artefact');
    state = completeActive(chooseResearch(state, 'weaponry-2'));
    expect(state.completedResearch).toContain('weaponry-2');

    let agi = createCampaign(4);
    for (const nodeId of ['cybernetics-1', 'cybernetics-2', 'mythology-1', 'mythology-2', 'mythology-3']) {
      agi = completeActive(chooseResearch(agi, nodeId));
    }
    expect(chooseResearch(agi, 'cybernetics-3')).toBe(agi);
    agi = grantItem(agi, 'aurichalcum');
    agi = completeActive(chooseResearch(agi, 'cybernetics-3'));
    expect(agi.completedResearch).toContain('mythology-3');
    expect(agi.completedResearch).toContain('cybernetics-3');
  });

  test('research income uses base, held wealth, and the Aurichalcum multiplier', () => {
    const base = createCampaign(5);
    expect(researchProgress(base)).toBe(8);

    const regions = base.regions.map((region, index) => index < 2 ? { ...region, held: true } : region);
    const wealthy = { ...base, regions };
    expect(heldRegions(wealthy)).toHaveLength(2);
    expect(researchProgress(wealthy)).toBe(12);
    expect(researchProgress({ ...wealthy, completedResearch: ['mythology-3'] })).toBe(18);
  });
});
