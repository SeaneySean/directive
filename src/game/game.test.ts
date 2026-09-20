import { describe, expect, test } from 'bun:test';
import { previewShot } from './combat.ts';
import { hasLineOfSight, inCover, line } from './los.ts';
import { distance, isWalkable, parseMap, tileAt } from './map.ts';
import { pathTo, reachable } from './pathfinding.ts';
import { nextRandom, rollPercent } from './rng.ts';
import { AREA51_HANGAR, ATLANTIS_RUINS, FARMSTEAD } from './scenarios.ts';
import { createGame, endTurn, livingUnits, moveUnit, selectUnit, shoot, unitById } from './state.ts';
import { decide, runTeamTurn, squadPolicy } from './ai.ts';
import type { Scenario, Unit } from './types.ts';

const small: Scenario = {
  name: 'test',
  rows: [
    '######',
    '#....#',
    '#.c..#',
    '#.#..#',
    '#....#',
    '######',
  ],
  units: [
    { id: 's', name: 'S', team: 'squad', pos: { x: 1, y: 1 }, hp: 10, maxHp: 10, ap: 2, maxAp: 2, move: 3, weapon: { name: 'R', range: 8, accuracy: 75, damage: 4 }, alive: true },
    { id: 'a', name: 'A', team: 'alien', pos: { x: 4, y: 4 }, hp: 4, maxHp: 4, ap: 2, maxAp: 2, move: 3, weapon: { name: 'P', range: 6, accuracy: 65, damage: 4 }, alive: true },
  ],
};

describe('map', () => {
  test('parses and reads tiles, out of bounds is wall', () => {
    const g = parseMap(small.rows);
    expect(g.width).toBe(6);
    expect(tileAt(g, { x: 2, y: 2 })).toBe('cover');
    expect(tileAt(g, { x: 2, y: 3 })).toBe('wall');
    expect(tileAt(g, { x: -1, y: 0 })).toBe('wall');
    expect(isWalkable(g, { x: 1, y: 1 })).toBe(true);
    expect(isWalkable(g, { x: 2, y: 2 })).toBe(false);
  });
  test('rejects ragged or unknown maps', () => {
    expect(() => parseMap(['##', '#'])).toThrow();
    expect(() => parseMap(['#x'])).toThrow();
  });
  test('distance is chebyshev', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 5 })).toBe(5);
  });
});

describe('rng', () => {
  test('is deterministic and in range', () => {
    const a = nextRandom(42);
    const b = nextRandom(42);
    expect(a.value).toBe(b.value);
    expect(a.seed).not.toBe(42);
    for (let s = 0, seed = 7; s < 200; s++) {
      const r = rollPercent(seed);
      seed = r.seed;
      expect(r.roll).toBeGreaterThanOrEqual(1);
      expect(r.roll).toBeLessThanOrEqual(100);
    }
  });
});

describe('pathfinding', () => {
  test('reach respects walls, cover, units and step budget', () => {
    const g = parseMap(small.rows);
    const units = small.units;
    const reach = reachable(g, units, { x: 1, y: 1 }, 3);
    expect(reach.has('1,1')).toBe(true);
    expect(reach.get('1,1')!.dist).toBe(0);
    expect(reach.has('2,2')).toBe(false); // cover
    expect(reach.has('2,3')).toBe(false); // wall
    expect(reach.has('4,4')).toBe(false); // alien stands there
    expect(reach.has('4,1')).toBe(true); // 3 steps east
    expect(reach.has('4,2')).toBe(false); // 4 steps
    const path = pathTo(reach, { x: 4, y: 1 });
    expect(path).toEqual([{ x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }]);
    expect(pathTo(reach, { x: 4, y: 2 })).toBeNull();
  });
});

describe('line of sight and cover', () => {
  const g = parseMap(small.rows);
  test('bresenham includes both ends', () => {
    const l = line({ x: 0, y: 0 }, { x: 2, y: 1 });
    expect(l[0]).toEqual({ x: 0, y: 0 });
    expect(l[l.length - 1]).toEqual({ x: 2, y: 1 });
  });
  test('walls block, cover does not', () => {
    expect(hasLineOfSight(g, { x: 2, y: 1 }, { x: 2, y: 4 })).toBe(false); // wall at 2,3
    expect(hasLineOfSight(g, { x: 1, y: 2 }, { x: 4, y: 2 })).toBe(true); // through cover 2,2
    expect(hasLineOfSight(g, { x: 1, y: 1 }, { x: 4, y: 1 })).toBe(true);
  });
  test('cover only counts on the shooter side', () => {
    // target at 3,2 has cover tile at 2,2 to its west
    expect(inCover(g, { x: 3, y: 2 }, { x: 1, y: 2 })).toBe(true);
    expect(inCover(g, { x: 3, y: 2 }, { x: 4, y: 2 })).toBe(false);
  });
});

describe('combat', () => {
  test('preview applies falloff, cover and clamps', () => {
    const state = createGame(small);
    const s = unitById(state, 's');
    const a = unitById(state, 'a');
    const p = previewShot(state.grid, s, a)!;
    expect(p.distance).toBe(3);
    expect(p.chance).toBe(75 - 2 * 4);
    expect(p.cover).toBe(false);
    expect(previewShot(state.grid, s, s)).toBeNull();
    const far: Unit = { ...a, pos: { x: 4, y: 1 }, weapon: { ...a.weapon, range: 1 } };
    expect(previewShot(state.grid, far, s)).toBeNull();
  });
});

describe('state', () => {
  test('move costs one AP and needs reach', () => {
    let state = createGame(small);
    state = moveUnit(state, 's', { x: 3, y: 1 });
    expect(unitById(state, 's').pos).toEqual({ x: 3, y: 1 });
    expect(unitById(state, 's').ap).toBe(1);
    const same = moveUnit(state, 's', { x: 1, y: 4 }); // too far
    expect(same).toBe(state);
    state = moveUnit(state, 's', { x: 4, y: 1 });
    expect(moveUnit(state, 's', { x: 3, y: 1 })).toBe(state); // no AP
  });
  test('cannot move enemy units on your turn', () => {
    const state = createGame(small);
    expect(moveUnit(state, 'a', { x: 3, y: 4 })).toBe(state);
    expect(selectUnit(state, 'a').selectedId).toBeNull();
    expect(selectUnit(state, 's').selectedId).toBe('s');
  });
  test('shooting is seeded and can kill, ending the game', () => {
    let state = createGame(small, 3);
    // Find a seed that hits at 67%: iterate until a hit occurs.
    let result = shoot(state, 's', 'a');
    expect(result).not.toBeNull();
    expect(result!.chance).toBe(67);
    expect(unitById(result!.state, 's').ap).toBe(1);
    let seed = 1;
    let killed = false;
    for (; seed < 50 && !killed; seed++) {
      state = createGame(small, seed);
      result = shoot(state, 's', 'a');
      killed = result!.killed;
    }
    expect(killed).toBe(true);
    expect(result!.state.outcome).toBe('won');
    expect(livingUnits(result!.state, 'alien').length).toBe(0);
  });
  test('killing every enemy still wins an objective mission', () => {
    const objective = { ...small, objective: { tile: { x: 1, y: 4 }, holdRounds: 2 } };
    let result = shoot(createGame(objective, 1), 's', 'a');
    for (let seed = 2; !result?.killed && seed < 50; seed++) {
      result = shoot(createGame(objective, seed), 's', 'a');
    }
    expect(result?.killed).toBe(true);
    expect(result?.state.outcome).toBe('won');
    expect(result?.state.objectiveHoldRounds).toBe(0);
  });
  test('end turn swaps team, refills AP and counts rounds', () => {
    let state = createGame(small);
    state = moveUnit(state, 's', { x: 2, y: 1 });
    state = endTurn(state);
    expect(state.turn).toBe('alien');
    expect(state.round).toBe(1);
    state = endTurn(state);
    expect(state.turn).toBe('squad');
    expect(state.round).toBe(2);
    expect(unitById(state, 's').ap).toBe(2);
  });

  test('wins after holding an objective for consecutive player turns', () => {
    const objective: Scenario = {
      ...small,
      objective: { tile: { x: 1, y: 1 }, holdRounds: 2 },
    };
    let state = createGame(objective);
    state = endTurn(state);
    expect(state.outcome).toBe('playing');
    expect(state.objectiveHoldRounds).toBe(1);
    state = endTurn(state);
    state = endTurn(state);
    expect(state.outcome).toBe('won');
    expect(state.objectiveHoldRounds).toBe(2);
  });

  test('moving off the objective loses accumulated hold progress', () => {
    const objective: Scenario = {
      ...small,
      objective: { tile: { x: 1, y: 1 }, holdRounds: 2 },
    };
    let state = endTurn(createGame(objective));
    state = endTurn(state);
    state = moveUnit(state, 's', { x: 2, y: 1 });
    state = endTurn(state);
    expect(state.outcome).toBe('playing');
    expect(state.objectiveHoldRounds).toBe(0);
  });
});

describe('mission scenarios', () => {
  test('Area 51 and Atlantis use the fixed squad and enemy statistics', () => {
    expect(AREA51_HANGAR.objective).toEqual({ tile: expect.any(Object), holdRounds: 2 });
    expect(ATLANTIS_RUINS.objective).toEqual({ tile: expect.any(Object), holdRounds: 2 });
    expect(AREA51_HANGAR.units.filter((unit) => unit.team === 'alien')).toHaveLength(3);
    expect(ATLANTIS_RUINS.units.filter((unit) => unit.team === 'alien')).toHaveLength(4);
    expect([...AREA51_HANGAR.units, ...ATLANTIS_RUINS.units]
      .filter((unit) => unit.team === 'squad')
      .every((unit) => unit.hp === 12 && unit.maxHp === 12)).toBe(true);
    expect(AREA51_HANGAR.units.filter((unit) => unit.team === 'alien').every((unit) =>
      unit.weapon.name === 'Rifle'
      && unit.weapon.accuracy === 60
      && unit.weapon.damage === 4
      && unit.weapon.range === 7
    )).toBe(true);
    expect(ATLANTIS_RUINS.units.filter((unit) => unit.team === 'alien').every((unit) =>
      unit.weapon.accuracy === 60
    )).toBe(true);
  });

  test('campaign mission maps put cover behind the squad and along each objective route', () => {
    for (const scenario of [AREA51_HANGAR, ATLANTIS_RUINS]) {
      const squad = scenario.units.filter((unit) => unit.team === 'squad');
      expect(squad.every((unit) => scenario.rows[unit.pos.y - 1]?.[unit.pos.x] === 'c')).toBe(true);
      expect(scenario.objective!.tile.x).toBeGreaterThanOrEqual(6);
      expect(scenario.objective!.tile.x).toBeLessThanOrEqual(11);
      expect(scenario.objective!.tile.y).toBeLessThan(8);
    }
  });
});

describe('ai', () => {
  test('shoots when it has a good shot, otherwise closes distance', () => {
    let state = createGame(small);
    state = endTurn(state);
    const step = decide(state, 'a');
    expect(step.kind).toBe('shoot'); // 65 - 2*4 = 57 >= 25
    const blocked: Scenario = { ...small, units: small.units.map((u) => (u.id === 'a' ? { ...u, pos: { x: 3, y: 4 } } : u)) };
    let s2 = endTurn(createGame(blocked));
    // alien at 3,4 sees soldier at 1,1 diagonally through 2,3 wall? line passes (2,2)/(2,3)
    const st = decide(s2, 'a');
    expect(['shoot', 'move']).toContain(st.kind);
    const run = runTeamTurn(s2, 'alien');
    expect(run.state.turn).toBe('squad');
    expect(run.steps.length).toBeGreaterThan(0);
  });
  test('full scenario plays to a conclusion with both sides on AI', () => {
    let state = createGame(FARMSTEAD, 11);
    for (let i = 0; i < 200 && state.outcome === 'playing'; i++) {
      state = runTeamTurn(state, state.turn).state;
    }
    expect(state.outcome).not.toBe('playing');
  });

  test('smart squad shoots lowest HP, then higher chance, then unit id', () => {
    const scenario: Scenario = {
      name: 'targets',
      rows: ['#######', '#.....#', '#.....#', '#.....#', '#######'],
      units: [
        { ...small.units[0]!, id: 's', pos: { x: 1, y: 2 } },
        { ...small.units[1]!, id: 'z', pos: { x: 4, y: 2 }, hp: 3, maxHp: 8 },
        { ...small.units[1]!, id: 'a', pos: { x: 3, y: 1 }, hp: 3, maxHp: 8 },
        { ...small.units[1]!, id: 'low', pos: { x: 2, y: 3 }, hp: 2, maxHp: 8 },
      ],
    };
    let state = createGame(scenario);
    expect(squadPolicy(state, 's')).toMatchObject({ kind: 'shoot', targetId: 'low' });
    state = { ...state, units: state.units.map((unit) => unit.id === 'low' ? { ...unit, alive: false } : unit) };
    expect(squadPolicy(state, 's')).toMatchObject({ kind: 'shoot', targetId: 'a' });
    state = { ...state, units: state.units.map((unit) => unit.id === 'z' ? { ...unit, pos: { x: 3, y: 3 } } : unit) };
    expect(squadPolicy(state, 's')).toMatchObject({ kind: 'shoot', targetId: 'a' });
  });

  test('smart squad movement reduces path distance to the objective', () => {
    const scenario: Scenario = {
      name: 'objective',
      rows: ['########', '#......#', '#.####.#', '#......#', '########'],
      units: [
        { ...small.units[0]!, id: 's', pos: { x: 1, y: 3 }, weapon: { ...small.units[0]!.weapon, range: 1 } },
        { ...small.units[1]!, id: 'a', pos: { x: 6, y: 1 }, weapon: { ...small.units[1]!.weapon, range: 1 } },
      ],
      objective: { tile: { x: 5, y: 1 }, holdRounds: 2 },
    };
    expect(squadPolicy(createGame(scenario), 's')).toEqual({ kind: 'move', unitId: 's', to: { x: 2, y: 1 } });
  });

  test('smart squad prefers directional cover from the nearest enemy at equal objective distance', () => {
    const scenario: Scenario = {
      name: 'cover',
      rows: ['#######', '#.....#', '#..c..#', '#.....#', '#.....#', '#######'],
      units: [
        { ...small.units[0]!, id: 's', pos: { x: 1, y: 3 }, move: 3, weapon: { ...small.units[0]!.weapon, range: 1 } },
        { ...small.units[1]!, id: 'a', pos: { x: 3, y: 1 }, weapon: { ...small.units[1]!.weapon, range: 1 } },
      ],
      objective: { tile: { x: 5, y: 3 }, holdRounds: 2 },
    };
    expect(squadPolicy(createGame(scenario), 's')).toEqual({ kind: 'move', unitId: 's', to: { x: 3, y: 3 } });
  });

  test('runTeamTurn accepts a policy without changing its default', () => {
    const state = createGame(small);
    expect(runTeamTurn(state, 'squad')).toEqual(runTeamTurn(state, 'squad', decide));
    const waited = runTeamTurn(state, 'squad', (_state, unitId) => ({ kind: 'wait', unitId }));
    expect(waited.steps).toEqual([]);
    expect(waited.state.turn).toBe('alien');
  });
});
