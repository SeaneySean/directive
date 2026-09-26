import { describe, expect, test } from 'bun:test';
import { advanceSmart, runTeamTurn, squadPolicy, decide } from './ai.ts';
import { createGame } from './state.ts';
import { generateMission } from './mapgen.ts';
import type { InfluencePath } from './strategy/types.ts';
import type { DistrictMetadata, Scenario, Unit } from './types.ts';

const PATHS: InfluencePath[] = ['subvert', 'force', 'enlighten'];

const squadAt = (id: string, x: number, y: number): Unit => ({
  id, name: id, team: 'squad', pos: { x, y }, hp: 12, maxHp: 12, ap: 2, maxAp: 2,
  move: 4, weapon: { name: 'Rifle', range: 8, accuracy: 75, damage: 4 }, alive: true,
});
const alienAt = (id: string, x: number, y: number, stance: 'hold' | 'advance' | 'smart' | 'flee' = 'hold'): Unit => ({
  id, name: 'Guard', team: 'alien', pos: { x, y }, hp: 14, maxHp: 14, ap: 1, maxAp: 1,
  move: 3, weapon: { name: 'Rifle', range: 7, accuracy: 60, damage: 4 }, alive: true, stance,
});

const openRows = (w: number, h: number) => [
  '#'.repeat(w),
  ...Array.from({ length: h - 2 }, () => `#${'.'.repeat(w - 2)}#`),
  '#'.repeat(w),
];

function districtFor(width: number, height: number, searchMarker = { x: 0, y: 0 }): DistrictMetadata {
  return { surfaces: new Array(width * height).fill('road' as const), buildings: [], props: [], searchMarker };
}

describe('fog squad pursuit', () => {
  test('unseen target movement does not change squad pursuit', () => {
    const rows = openRows(14, 14);
    const scenario: Scenario = {
      name: 'fog',
      rows,
      units: [squadAt('s1', 2, 2), alienAt('t1', 12, 2, 'flee')],
      objective: { kind: 'assassinate', targetId: 't1', exits: [{ x: 12, y: 1 }] },
      district: districtFor(14, 14, { x: 7, y: 7 }),
    };
    let state = createGame(scenario);
    // The target is hidden; give it a stored last-seen tile directly south.
    state = { ...state, knownEnemyPositions: { t1: { x: 7, y: 2 } } };
    const before = squadPolicy(state, 's1');
    expect(before.kind).toBe('move');
    // Move the target (still hidden): pursuit must not change.
    const moved = { ...state, units: state.units.map((u) => (u.id === 't1' ? { ...u, pos: { x: 12, y: 4 } } : u)) };
    expect(squadPolicy(moved, 's1')).toEqual(before);
  });

  test('a blocked search marker does not stall exploration', () => {
    // A wall slab at (5,5) is the (invalid) search marker; the squad must still
    // move to explore rather than waiting.
    const rows = openRows(14, 14).map((r, y) => (y === 5 ? r.slice(0, 5) + '#' + r.slice(6) : r));
    const scenario: Scenario = {
      name: 'fog',
      rows,
      units: [squadAt('s1', 2, 2), alienAt('t1', 12, 12, 'flee')],
      objective: { kind: 'assassinate', targetId: 't1', exits: [{ x: 12, y: 1 }], },
      district: districtFor(14, 14, { x: 5, y: 5 }),
    };
    const state = createGame(scenario);
    const step = squadPolicy(state, 's1');
    expect(step.kind).toBe('move');
  });

  test('advanceSmart explores with no visible enemy on a fog map', () => {
    const scenario: Scenario = {
      name: 'clash',
      rows: openRows(16, 16),
      units: [squadAt('s1', 2, 2), alienAt('o1', 14, 14, 'smart')],
      objective: { kind: 'clash' },
      district: districtFor(16, 16),
    };
    const state = createGame(scenario);
    // (14,14) is Chebyshev 12 away: not visible.
    const step = advanceSmart(state, 's1');
    expect(step.kind).toBe('move');
  });
});

describe('assassination interception', () => {
  test('an unopposed squad runs down the target before it escapes', () => {
    for (const path of PATHS) {
      for (let seed = 1; seed <= 100; seed++) {
        const full = generateMission('assassinate', path, seed);
        const solo: Scenario = {
          ...full,
          units: full.units.filter((unit) => unit.team === 'squad' || unit.id === 't1'),
          reinforcements: undefined,
        };
        let state = createGame(solo, seed);
        for (let i = 0; i < 400 && state.outcome === 'playing'; i++) {
          state = runTeamTurn(state, state.turn, state.turn === 'squad' ? squadPolicy : decide).state;
        }
        expect(state.outcome, `assassinate ${path} seed ${seed} (target down, not escaped)`).toBe('won');
      }
    }
  }, 60000);
});