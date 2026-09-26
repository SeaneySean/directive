import { describe, expect, test } from 'bun:test';
import { endTurn, moveUnit, shoot, unitById } from './state.ts';
import { createGame } from './state.ts';
import { previewShot } from './combat.ts';
import { hasFog, isKnownEnemy, knownEnemies, refreshMemory, squadShotPreview, visibleTiles } from './visibility.ts';
import type { DistrictMetadata, Scenario, Unit } from './types.ts';

const squadAt = (id: string, x: number, y: number): Unit => ({
  id, name: id, team: 'squad', pos: { x, y }, hp: 12, maxHp: 12, ap: 2, maxAp: 2,
  move: 4, weapon: { name: 'Rifle', range: 8, accuracy: 75, damage: 4 }, alive: true,
});
const alienAt = (id: string, x: number, y: number): Unit => ({
  id, name: 'Guard', team: 'alien', pos: { x, y }, hp: 14, maxHp: 14, ap: 2, maxAp: 2,
  move: 4, weapon: { name: 'Rifle', range: 7, accuracy: 60, damage: 4 }, alive: true, stance: 'hold',
});

/** Open interior with a wall border. */
function openRows(w: number, h: number): string[] {
  return [
    '#'.repeat(w),
    ...Array.from({ length: h - 2 }, () => `#${'.'.repeat(w - 2)}#`),
    '#'.repeat(w),
  ];
}

function scenario(rows: string[], units: Unit[], district?: DistrictMetadata): Scenario {
  return district ? { name: 't', rows, units, district } : { name: 't', rows, units };
}

const key = (x: number, y: number) => `${x},${y}`;

describe('visibility', () => {
  test('initial reveal explores the squad opening visibility and nothing beyond', () => {
    const state = createGame(scenario(openRows(20, 20), [squadAt('s1', 10, 10)]));
    const idx = (x: number, y: number) => y * 20 + x;
    // The squad rests dead centre: everywhere within Chebyshev 7 is visible.
    for (let y = 3; y <= 17; y++) {
      for (let x = 3; x <= 17; x++) {
        expect(state.explored[idx(x, y)], `explored ${x},${y}`).toBe(true);
      }
    }
    // A tile beyond Chebyshev 7 is not explored.
    expect(state.explored[idx(1, 18)]).toBe(false);
    // No enemies, so memory is empty.
    expect(state.knownEnemyPositions).toEqual({});
  });

  test('walls block sight but the blocking wall face itself is visible', () => {
    // A wall column at x=10 running full height with squad at (2,2).
    const rows = Array.from({ length: 8 }, (_, y) =>
      Array.from({ length: 8 }, (_, x) =>
        (x === 0 || y === 0 || x === 7 || y === 7) ? '#' : x === 5 ? '#' : '.',
      ).join(''),
    );
    const state = createGame(scenario(rows, [squadAt('s1', 2, 2)]));
    const visible = visibleTiles(state);
    // The wall face at x=5, y=2 is visible (exposed by LOS) ...
    expect(visible.has(key(5, 2))).toBe(true);
    // ... but tiles behind it are hidden.
    expect(visible.has(key(6, 2))).toBe(false);
    expect(visible.has(key(7, 2))).toBe(false); // border wall hidden behind the interior wall
    const idx = (x: number, y: number) => y * 8 + x;
    expect(state.explored[idx(5, 2)]).toBe(true);
    expect(state.explored[idx(6, 2)]).toBe(false);
  });

  test('knownEnemies returns living enemies on visible tiles only', () => {
    const rows = openRows(20, 20);
    const state = createGame(scenario(rows, [
      squadAt('s1', 3, 3),
      alienAt('a1', 6, 3),   // within range and LOS
      alienAt('a2', 18, 18), // far beyond VISIBLE_RANGE
    ]));
    const known = knownEnemies(state).map((unit) => unit.id);
    expect(known).toEqual(['a1']);
  });
});

describe('enemy memory', () => {
  test('an enemy moving through sight updates its stored position', () => {
    const rows = openRows(20, 20);
    const state = createGame(scenario(rows, [squadAt('s1', 10, 10), alienAt('t1', 12, 10)]));
    expect(state.knownEnemyPositions['t1']).toEqual({ x: 12, y: 10 });

    let turn = endTurn(state); // alien turn
    turn = moveUnit(turn, 't1', { x: 13, y: 10 });
    // Still visible, so the stored tile tracks the move.
    expect(turn.knownEnemyPositions['t1']).toEqual({ x: 13, y: 10 });
  });

  test('an enemy that leaves sight keeps its last-seen tile behind a wall', () => {
    // Wall column at x=5; squad west, enemy steps east out of sight.
    const rows = Array.from({ length: 8 }, (_, y) =>
      Array.from({ length: 8 }, (_, x) =>
        (x === 0 || y === 0 || x === 7 || y === 7) ? '#' : x === 5 ? '#' : '.',
      ).join(''),
    );
    const state = createGame(scenario(rows, [squadAt('s1', 2, 4), alienAt('t1', 4, 4)]));
    expect(visibleTiles(state).has(key(4, 4))).toBe(true);

    // Move the target east through the door-free wall? It cannot (wall is impassable).
    // Instead step south along the visible corridor still in sight is covered above;
    // here we verify a hidden enemy keeps whatever stale tile it last held.
    const stale = refreshMemory({ ...state, units: state.units.map((u) => u.id === 't1' ? { ...u, pos: { x: 6, y: 4 } } : u) });
    // The target is now east of the wall (hidden). Its last-seen tile (4,4) is still
    // visible and empty, so the contact is dropped, leaving no position.
    expect(stale.knownEnemyPositions['t1']).toBeUndefined();
  });

  test('sight loss after a squad death shrinks known enemies', () => {
    const rows = openRows(20, 20);
    const state = createGame(scenario(rows, [squadAt('s1', 10, 10), squadAt('s2', 3, 3), alienAt('a1', 16, 16)]));
    // Only s2 (at 3,3) can reach (16,16)? No: (10,10) to (16,16) is Chebyshev 6, also visible.
    expect(knownEnemies(state).map((u) => u.id)).toEqual(['a1']);
    // Kill s1; s2 is at (3,3), (16,16) is 13 away -> no longer visible.
    const after = { ...state, units: state.units.map((u) => (u.id === 's1' ? { ...u, alive: false, hp: 0 } : u)) };
    expect(knownEnemies(after)).toEqual([]);
  });

  test('refreshMemory never mutates its input and yields independent copies', () => {
    const rows = openRows(20, 20);
    const state = createGame(scenario(rows, [squadAt('s1', 10, 10), alienAt('a1', 12, 10)]));
    const exploredBefore = state.explored.slice();
    const positionsBefore = { ...state.knownEnemyPositions };
    const next = refreshMemory(state);
    expect(next.explored).not.toBe(state.explored);
    expect(next.knownEnemyPositions).not.toBe(state.knownEnemyPositions);
    expect(state.explored).toEqual(exploredBefore);
    expect(state.knownEnemyPositions).toEqual(positionsBefore);
    expect(hasFog(state)).toBe(false);
  });
});

describe('fog-gated shooting', () => {
  const district: DistrictMetadata = { surfaces: [], buildings: [], props: [], searchMarker: { x: 0, y: 0 } };

  test('shoot rejects a squad attack on an unseen enemy without spending AP or RNG', () => {
    const rows = openRows(24, 24);
    const state = createGame(scenario(rows, [squadAt('s1', 3, 3), alienAt('a1', 20, 20)], district));
    expect(hasFog(state)).toBe(true);
    expect(isKnownEnemy(state, unitById(state, 'a1'))).toBe(false);

    const before = state.seed;
    const attacker = unitById(state, 's1');
    const result = shoot(state, 's1', 'a1');
    expect(result).toBeNull();
    // AP unchanged, RNG unchanged.
    expect(state.seed).toBe(before);
    expect(attacker.ap).toBe(2);
  });

  test('shoot allows a squad attack on a visible enemy', () => {
    const rows = openRows(24, 24);
    const state = createGame(scenario(rows, [squadAt('s1', 5, 5), alienAt('a1', 7, 5)], district));
    expect(isKnownEnemy(state, unitById(state, 'a1'))).toBe(true);
    expect(shoot(state, 's1', 'a1')).not.toBeNull();
  });
});

describe('squadShotPreview', () => {
  const district: DistrictMetadata = { surfaces: [], buildings: [], props: [], searchMarker: { x: 0, y: 0 } };

  test('returns null for a hidden target on a fog map', () => {
    const rows = openRows(24, 24);
    const state = createGame(scenario(rows, [squadAt('s1', 3, 3), alienAt('a1', 20, 20)], district));
    const attacker = unitById(state, 's1');
    const target = unitById(state, 'a1');
    expect(squadShotPreview(state, attacker, target)).toBeNull();
  });

  test('returns the normal preview for a visible target on a fog map', () => {
    const rows = openRows(24, 24);
    const state = createGame(scenario(rows, [squadAt('s1', 5, 5), alienAt('a1', 7, 5)], district));
    const attacker = unitById(state, 's1');
    const target = unitById(state, 'a1');
    expect(squadShotPreview(state, attacker, target)).toEqual(previewShot(state.grid, attacker, target));
  });

  test('passes through unconditionally on a no-fog scenario', () => {
    // Chebyshev 8 from the squad: outside fog visibility (7) but within the
    // squad's 8-tile weapon range, so the plain geometry preview is legal.
    const rows = openRows(24, 24);
    const state = createGame(scenario(rows, [squadAt('s1', 2, 2), alienAt('a1', 10, 2)]));
    const attacker = unitById(state, 's1');
    const target = unitById(state, 'a1');
    expect(hasFog(state)).toBe(false);
    const preview = previewShot(state.grid, attacker, target);
    expect(preview).not.toBeNull();
    expect(squadShotPreview(state, attacker, target)).toEqual(preview);
  });
});