import { describe, expect, test } from 'bun:test';
import { radar } from './radar.ts';
import { createGame, endTurn } from './state.ts';
import type { DistrictMetadata, Scenario, Unit } from './types.ts';

const squadAt = (id: string, x: number, y: number): Unit => ({
  id, name: id, team: 'squad', pos: { x, y }, hp: 12, maxHp: 12, ap: 2, maxAp: 2,
  move: 4, weapon: { name: 'Rifle', range: 8, accuracy: 75, damage: 4 }, alive: true,
});
const alienAt = (id: string, x: number, y: number, stance: 'hold' | 'advance' | 'smart' | 'flee' = 'hold'): Unit => ({
  id, name: 'Guard', team: 'alien', pos: { x, y }, hp: 14, maxHp: 14, ap: 2, maxAp: 2,
  move: 4, weapon: { name: 'Rifle', range: 7, accuracy: 60, damage: 4 }, alive: true, stance,
});

const rows = (w = 12, h = 12) => [
  '#'.repeat(w),
  ...Array.from({ length: h - 2 }, () => `#${'.'.repeat(w - 2)}#`),
  '#'.repeat(w),
];

function scenario(unitList: Unit[], objective?: Scenario['objective'], district?: DistrictMetadata): Scenario {
  const s: Scenario = { name: 't', rows: rows(), units: unitList, objective };
  if (district) s.district = district;
  return s;
}

const district = (search: { x: number; y: number }): DistrictMetadata => ({
  surfaces: [], buildings: [], props: [], searchMarker: search,
});

describe('radar', () => {
  test('hold marks the hold tile', () => {
    const state = createGame(scenario([squadAt('s1', 3, 3)], { kind: 'hold', tile: { x: 9, y: 2 }, holdRounds: 2 }));
    expect(radar(state).objective).toEqual([{ x: 9, y: 2 }]);
    expect(radar(state).targetLastKnown).toBeNull();
    expect(radar(state).targetBearing).toBeNull();
  });

  test('recover marks the ground item, then the carrier plus extraction', () => {
    const obj = { kind: 'recover' as const, tile: { x: 9, y: 2 }, extraction: [{ x: 1, y: 10 }, { x: 2, y: 10 }] };
    const state = createGame(scenario([squadAt('s1', 3, 3), alienAt('a1', 9, 9)], obj));
    expect(radar(state).objective).toEqual([{ x: 9, y: 2 }]);

    // s1 ends its turn on the item: it becomes the carrier.
    const carried = endTurn({ ...state, units: state.units.map((u) => (u.id === 's1' ? { ...u, pos: { x: 9, y: 2 } } : u)) });
    expect(carried.carrierId).toBe('s1');
    const marker = radar(carried).objective;
    expect(marker).toContainEqual({ x: 9, y: 2 });
    expect(marker).toContainEqual({ x: 1, y: 10 });
    expect(marker).toContainEqual({ x: 2, y: 10 });
  });

  test('assassination target last-known falls back to the district search marker', () => {
    const state = createGame(scenario(
      [squadAt('s1', 3, 3), alienAt('t1', 9, 9, 'flee')],
      { kind: 'assassinate', targetId: 't1', exits: [{ x: 9, y: 1 }] },
      district({ x: 6, y: 6 }),
    ));
    // (9,9) is 6 tiles from (3,3) and (6,6) is the marker; the target is visible
    // so its last-known is its actual tile, not the marker.
    const r = radar(state);
    expect(r.searchMarker).toEqual({ x: 6, y: 6 });
    expect(r.targetLastKnown).toEqual({ x: 9, y: 9 });
    expect(r.targetBearing).not.toBeNull();
  });

  test('clash uses the nearest stored contact, ties broken by id', () => {
    const state = createGame(scenario(
      [squadAt('s1', 5, 5), alienAt('o1', 6, 5, 'smart')],
      { kind: 'clash' },
    ));
    // The operative at (6,5) is visible: its stored contact drives the marker.
    const marker = radar(state).objective;
    expect(marker).toEqual([{ x: 6, y: 5 }]);
  });

  test('clash before any contact falls back to the north-third centre', () => {
    const state = createGame(scenario([squadAt('s1', 5, 11)], { kind: 'clash' }));
    // Squad at the bottom sees the bottom; no enemies -> north-third centre.
    const marker = radar(state).objective;
    expect(marker).toEqual([{ x: 6, y: 2 }]); // 12-wide board: centre x=6, third=4 -> y=2
  });

  test('no objective returns no objective marker', () => {
    const state = createGame(scenario([squadAt('s1', 3, 3), alienAt('a1', 9, 9)]));
    expect(radar(state).objective).toEqual([]);
  });

  test('an empty squad produces no NaN bearing or centroid ranking', () => {
    const state = createGame(scenario([alienAt('a1', 9, 9)], { kind: 'assassinate' as const, targetId: 'x', exits: [] }));
    // Force the squad dead.
    const dead = { ...state, units: state.units.filter((u) => u.team !== 'squad') };
    const r = radar(dead);
    expect(r.squad).toEqual([]);
    expect(r.targetBearing).toBeNull();
    expect(Number.isNaN(r.targetBearing ?? 0)).toBe(false);
  });
});