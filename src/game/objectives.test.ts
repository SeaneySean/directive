import { describe, expect, test } from 'bun:test';
import { createGame, endTurn, livingUnits, moveUnit, shoot } from './state.ts';
import type { Scenario, Unit } from './types.ts';

const squadUnit = (id: string, x: number, y: number): Unit => ({
  id, name: id, team: 'squad', pos: { x, y }, hp: 12, maxHp: 12, ap: 2, maxAp: 2,
  move: 4, weapon: { name: 'Rifle', range: 8, accuracy: 75, damage: 4 }, alive: true,
});

const alienUnit = (id: string, x: number, y: number, damage = 20, range = 4): Unit => ({
  id, name: 'Guard', team: 'alien', pos: { x, y }, hp: 4, maxHp: 4, ap: 2, maxAp: 2,
  move: 4, weapon: { name: 'Rifle', range, accuracy: 95, damage }, alive: true, stance: 'hold',
});

/** 9x7 open floor, interior x 1..7, y 1..5. */
const rows = ['#########', '#.......#', '#.......#', '#.......#', '#.......#', '#.......#', '#########'];

describe('recover objective', () => {
  const recover = (): Scenario => ({
    name: 'recover',
    rows,
    units: [squadUnit('s1', 4, 1), squadUnit('s2', 3, 3), alienUnit('a1', 7, 5)],
    objective: { kind: 'recover', tile: { x: 4, y: 1 }, extraction: [{ x: 4, y: 5 }, { x: 5, y: 5 }] },
  });

  test('a squad unit ending its turn on the item becomes the carrier', () => {
    const state = endTurn(createGame(recover()));
    expect(state.carrierId).toBe('s1');
    expect(state.outcome).toBe('playing');
    expect(state.log.some((entry) => entry.text.includes('recovers the item'))).toBe(true);
  });

  test('the living carrier ends a turn on extraction to win', () => {
    let state = endTurn(createGame(recover())); // s1 picks up
    state = endTurn(state); // alien turn
    state = moveUnit(state, 's1', { x: 4, y: 5 }); // s1 walks south to extraction
    state = endTurn(state);
    expect(state.outcome).toBe('won');
    expect(state.log.some((entry) => entry.text.includes('Item extracted'))).toBe(true);
  });

  test('killing every enemy still does not win a recover mission', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const state = createGame(recover(), seed);
      const result = shoot(state, 's1', 'a1');
      if (result?.killed) {
        expect(livingUnits(result.state, 'alien')).toHaveLength(0);
        expect(result.state.outcome).toBe('playing');
        return;
      }
    }
    throw new Error('no seed landed a killing blow');
  });

  test('the carrier dying drops the item where it fell', () => {
    for (let seed = 1; seed <= 300; seed++) {
      let state = endTurn(createGame(recover(), seed)); // s1 (4,1) is carrier
      const result = shoot(state, 'a1', 's1');
      if (result?.killed) {
        expect(result.state.carrierId).toBeNull();
        expect(result.state.objective).toMatchObject({ kind: 'recover', tile: { x: 4, y: 1 } });
        return;
      }
    }
    throw new Error('no seed landed a killing blow');
  });

  test('another squad unit can reclaim the dropped item', () => {
    for (let seed = 1; seed <= 300; seed++) {
      let state = endTurn(createGame(recover(), seed));
      const result = shoot(state, 'a1', 's1');
      if (!result?.killed) continue;
      // s2 at (3,3) walks to the dropped item at (4,1) and picks it up.
      let next = endTurn(result.state); // alien -> squad
      next = moveUnit(next, 's2', { x: 4, y: 1 });
      next = endTurn(next);
      expect(next.carrierId).toBe('s2');
      expect(next.outcome).toBe('playing');
      return;
    }
    throw new Error('no seed landed a killing blow');
  });
});

describe('assassinate objective', () => {
  const assassinate = (): Scenario => ({
    name: 'assassinate',
    rows,
    units: [squadUnit('s1', 1, 1), alienUnit('t1', 7, 1, 4, 8), alienUnit('g1', 6, 5)],
    objective: { kind: 'assassinate', targetId: 't1', exits: [{ x: 7, y: 1 }] },
  });

  test('the target dying wins even with a bodyguard still alive', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const state = createGame(assassinate(), seed);
      const result = shoot(state, 's1', 't1');
      if (result?.killed) {
        expect(result.state.outcome).toBe('won');
        expect(result.state.log.some((entry) => entry.text.includes('Target down'))).toBe(true);
        expect(livingUnits(result.state, 'alien').some((unit) => unit.id === 'g1' && unit.alive)).toBe(true);
        return;
      }
    }
    throw new Error('no seed landed a killing blow on the target');
  });

  test('the target ending an alien turn on an exit loses the mission', () => {
    let state = createGame(assassinate());
    state = endTurn(state); // squad -> alien
    state = endTurn(state); // alien turn ends with the target (7,1) on its exit
    expect(state.outcome).toBe('lost');
    expect(state.log.some((entry) => entry.text.includes('Target escaped'))).toBe(true);
  });

  test('killing only a bodyguard leaves the mission playing', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const state = createGame(assassinate(), seed);
      const result = shoot(state, 's1', 'g1');
      if (result?.killed) {
        expect(result.state.outcome).toBe('playing');
        expect(livingUnits(result.state, 'alien').map((unit) => unit.id)).toEqual(['t1']);
        return;
      }
    }
    throw new Error('no seed landed a killing blow on the bodyguard');
  });
});

describe('clash objective', () => {
  test('clash is won by eliminating every hostile', () => {
    const scenario: Scenario = {
      name: 'clash',
      rows,
      units: [squadUnit('s1', 1, 1), alienUnit('o1', 7, 5)],
      objective: { kind: 'clash' },
    };
    for (let seed = 1; seed <= 300; seed++) {
      const state = createGame(scenario, seed);
      const result = shoot(state, 's1', 'o1');
      if (result?.killed) {
        expect(result.state.outcome).toBe('won');
        expect(result.state.log.some((entry) => entry.text.includes('Area secured'))).toBe(true);
        return;
      }
    }
    throw new Error('no seed landed a killing blow');
  });
});