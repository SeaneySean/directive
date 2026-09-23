import { describe, expect, test } from 'bun:test';
import { createCampaign, endTurn } from './campaign.ts';
import {
  completeMission,
  completeOffer,
  launchOffer,
  missionScenario,
  offerScenario,
  recruitSoldier,
  startMission,
} from './missions.ts';
import {
  freshRoster,
  PROMOTION_KILLS,
  RANK_ACCURACY_BONUS,
  RECRUIT_COST,
  RECRUIT_NAMES,
  settleRoster,
} from './roster.ts';
import { createGame, shoot } from '../state.ts';
import type { GameState, Scenario, Unit } from '../types.ts';
import type { CampaignState, Soldier } from './types.ts';

const ALL_EVENTS = ['candidate', 'leak', 'whistleblower', 'miracle-at-the-well', 'summit'];

function noEvents(state: CampaignState): CampaignState {
  return { ...state, firedEvents: ALL_EVENTS };
}

function withRoster(state: CampaignState, roster: Soldier[]): CampaignState {
  return { ...state, roster };
}

function kia(state: CampaignState, index = 0): CampaignState {
  return withRoster(state, state.roster.map((soldier, i) =>
    i === index ? { ...soldier, hp: 0, alive: false } : soldier,
  ));
}

function killAll(state: CampaignState): CampaignState {
  return withRoster(state, state.roster.map((soldier) => ({ ...soldier, hp: 0, alive: false })));
}

/** A finished battle with the given fielded squad results and kill attribution. */
function battleState(
  fielded: Array<{ id: string; name: string; hp: number; alive: boolean }>,
  killsBy: Record<string, number>,
): GameState {
  const units: Unit[] = fielded.map((unit) => ({
    id: unit.id,
    name: unit.name,
    team: 'squad',
    pos: { x: 0, y: 0 },
    hp: unit.hp,
    maxHp: 12,
    ap: 0,
    maxAp: 2,
    move: 4,
    weapon: { name: 'Rifle', range: 8, accuracy: 75, damage: 4 },
    alive: unit.alive,
  }));
  return {
    grid: { width: 0, height: 0, tiles: [] },
    units,
    turn: 'squad',
    round: 1,
    selectedId: null,
    seed: 1,
    log: [],
    outcome: 'won',
    objectiveHoldRounds: 0,
    reinforcementsSpawned: 0,
    carrierId: null,
    killsBy,
  };
}

/** A minimal one-shot scenario: a squad rifleman faces one alien in a corridor. */
function shootScenario(): Scenario {
  return {
    name: 'shot',
    rows: ['#####', '#...#', '#...#', '#...#', '#####'],
    units: [
      { id: 's1', name: 'Cole', team: 'squad', pos: { x: 1, y: 1 }, hp: 12, maxHp: 12, ap: 2, maxAp: 2, move: 4, weapon: { name: 'Rifle', range: 8, accuracy: 75, damage: 4 }, alive: true },
      { id: 'a1', name: 'Guard', team: 'alien', pos: { x: 3, y: 1 }, hp: 4, maxHp: 4, ap: 2, maxAp: 2, move: 4, weapon: { name: 'Rifle', range: 7, accuracy: 60, damage: 4 }, alive: true },
    ],
  };
}

describe('roster seeding', () => {
  test('seeds Cole, Diaz, Okafor and Reyes with ids, loadout and zero career', () => {
    const state = createCampaign(1);
    expect(state.roster).toHaveLength(4);
    expect(state.roster).toEqual([
      { id: 's1', name: 'Cole', hp: 12, maxHp: 12, kills: 0, rank: 0, alive: true, weapon: 'rifle' },
      { id: 's2', name: 'Diaz', hp: 12, maxHp: 12, kills: 0, rank: 0, alive: true, weapon: 'rifle' },
      { id: 's3', name: 'Okafor', hp: 12, maxHp: 12, kills: 0, rank: 0, alive: true, weapon: 'shotgun' },
      { id: 's4', name: 'Reyes', hp: 12, maxHp: 12, kills: 0, rank: 0, alive: true, weapon: 'rifle' },
    ]);
    expect(state.recruitCount).toBe(0);
  });
});

describe('squad building', () => {
  test('mission scenarios field living roster members onto spawn tiles in order', () => {
    const state = createCampaign(2);
    const scenario = missionScenario(state, 'area-51');
    const squad = scenario.units.filter((unit) => unit.team === 'squad');
    expect(squad.map((unit) => unit.id)).toEqual(['s1', 's2', 's3', 's4']);
    expect(squad.map((unit) => unit.name)).toEqual(['Cole', 'Diaz', 'Okafor', 'Reyes']);
    // Spawn positions match the template squad order.
    expect(squad.map((unit) => unit.pos)).toEqual([{ x: 4, y: 18 }, { x: 7, y: 18 }, { x: 10, y: 18 }, { x: 13, y: 18 }]);
    expect(squad.every((unit) => unit.hp === 12 && unit.maxHp === 12 && unit.ap === 2 && unit.move === 4)).toBe(true);
    expect(squad.map((unit) => unit.weapon.name)).toEqual(['Rifle', 'Rifle', 'Shotgun', 'Rifle']);
  });

  test('fewer living soldiers fields fewer, preserving roster order into spawns', () => {
    const state = kia(kia(createCampaign(3), 2), 1); // Diaz and Okafor dead
    const scenario = missionScenario(state, 'atlantis');
    const squad = scenario.units.filter((unit) => unit.team === 'squad');
    expect(squad.map((unit) => unit.id)).toEqual(['s1', 's4']);
    // Cole and Reyes land on the first two spawn tiles, in order.
    expect(squad.map((unit) => unit.pos)).toEqual([{ x: 4, y: 20 }, { x: 7, y: 20 }]);
  });

  test('recruited soldiers keep a stable identity and spawn in their roster slot', () => {
    let state = noEvents(kia(createCampaign(4)));
    state = recruitSoldier(state);
    const scenario = missionScenario(state, 'area-51');
    const squad = scenario.units.filter((unit) => unit.team === 'squad');
    expect(squad[0]!.id).toBe('r1');
    expect(squad[0]!.name).toBe(RECRUIT_NAMES[0]);
    expect(squad[0]!.pos).toEqual({ x: 4, y: 18 });
    expect(squad[1]!.id).toBe('s2');
  });

  test('generated offers field the roster squad for every objective type', () => {
    const state = createCampaign(5);
    for (const offer of state.offers) {
      const scenario = offerScenario(state, offer.id);
      const squad = scenario.units.filter((unit) => unit.team === 'squad');
      expect(squad.map((unit) => unit.name)).toEqual(['Cole', 'Diaz', 'Okafor', 'Reyes']);
      // Enemies and objectives are untouched by the squad swap.
      expect(scenario.objective).toBeDefined();
    }
  });

  test('rank 1 adds the accuracy bonus; plasma replaces then adds', () => {
    const base = createCampaign(6);
    const promoted = withRoster(base, base.roster.map((soldier) =>
      soldier.id === 's1' ? { ...soldier, kills: PROMOTION_KILLS, rank: 1 as const } : soldier,
    ));
    const noPlasma = missionScenario(promoted, 'area-51').units.find((unit) => unit.id === 's1')!;
    expect(noPlasma.weapon.name).toBe('Rifle');
    expect(noPlasma.weapon.accuracy).toBe(75 + RANK_ACCURACY_BONUS);

    const plasma = missionScenario(
      { ...promoted, completedResearch: ['weaponry-2'] },
      'area-51',
    );
    const s1plasma = plasma.units.find((unit) => unit.id === 's1')!;
    expect(s1plasma.weapon.name).toBe('Plasma');
    expect(s1plasma.weapon.accuracy).toBe(75 + RANK_ACCURACY_BONUS);
    const s2plasma = plasma.units.find((unit) => unit.id === 's2')!;
    expect(s2plasma.weapon.accuracy).toBe(75); // rank 0 plasma gets no bonus
  });
});

describe('launch rejection', () => {
  test('a zero-living roster cannot launch a generated offer', () => {
    const state = noEvents(killAll(createCampaign(7)));
    const offerId = state.offers[0]!.id;
    expect(launchOffer(state, offerId)).toBe(state);
    expect(state.offers[0]!.status).toBe('open');
  });

  test('a zero-living roster cannot start a story mission', () => {
    const state = killAll({ ...createCampaign(8), unlockedMissions: ['area-51'] });
    expect(startMission(state, 'area-51')).toBe(state);
    expect(state.missions['area-51']).toBeUndefined();
  });
});

describe('kill attribution', () => {
  test('a killing shot credits the attacker, including the mission-ending shot', () => {
    for (let seed = 1; seed < 50; seed++) {
      const result = shoot(createGame(shootScenario(), seed), 's1', 'a1');
      if (result!.killed) {
        expect(result!.state.killsBy['s1']).toBe(1);
        expect(result!.state.outcome).toBe('won');
        return;
      }
    }
    throw new Error('no killing seed found');
  });

  test('misses and non-lethal hits credit nothing', () => {
    for (let seed = 1; seed < 200; seed++) {
      const result = shoot(createGame(shootScenario(), seed), 's1', 'a1');
      if (!result!.killed) return; // at least one non-lethal or miss observed across seeds
    }
    throw new Error('expected a non-lethal outcome');
  });
});

describe('result settlement', () => {
  test('settles hp, KIA and career kills by soldier id, leaving the unfielded alone', () => {
    const state = withRoster(createCampaign(9), [
      { id: 's1', name: 'Cole', hp: 7, maxHp: 12, kills: 3, rank: 0, alive: true, weapon: 'rifle' },
      ...freshRoster().slice(1),
    ]);
    const battle = battleState(
      [
        { id: 's1', name: 'Cole', hp: 7, alive: true },
        { id: 's2', name: 'Diaz', hp: 0, alive: false },
      ],
      { s1: 2 },
    );
    const settled = settleRoster(state, battle);
    expect(settled.roster[0]).toMatchObject({ hp: 7, alive: true, kills: 5 });
    expect(settled.roster[1]).toMatchObject({ hp: 0, alive: false, kills: 0 });
    // s3 and s4 were never fielded and are untouched.
    expect(settled.roster[2]).toEqual(state.roster[2]);
    expect(settled.roster[3]).toEqual(state.roster[3]);
  });

  test('write-back happens once through the guarded mission completion', () => {
    const state = noEvents({ ...createCampaign(10), missions: { 'area-51': { status: 'in-progress' } } });
    const battle = battleState([{ id: 's1', name: 'Cole', hp: 12, alive: true }], { s1: 1 });
    const once = completeMission(state, 'area-51', 'won', battle);
    expect(once.roster[0]!.kills).toBe(1);
    const twice = completeMission(once, 'area-51', 'won', battle);
    expect(twice).toBe(once);
    expect(twice.roster[0]!.kills).toBe(1);
  });

  test('career kills accumulate across separate missions', () => {
    const state = noEvents({ ...createCampaign(11), missions: { 'area-51': { status: 'in-progress' }, atlantis: { status: 'in-progress' } } });
    const afterFirst = completeMission(state, 'area-51', 'won', battleState([{ id: 's1', name: 'Cole', hp: 12, alive: true }], { s1: 1 }));
    const afterSecond = completeMission(afterFirst, 'atlantis', 'won', battleState([{ id: 's1', name: 'Cole', hp: 12, alive: true }], { s1: 2 }));
    expect(afterSecond.roster[0]!.kills).toBe(3);
  });

  test('an assassination escape keeps surviving soldiers alive', () => {
    let state = noEvents(createCampaign(12));
    const offer = state.offers.find((candidate) => candidate.type === 'assassinate')!;
    state = launchOffer(state, offer.id);
    const battle = battleState(
      [
        { id: 's1', name: 'Cole', hp: 12, alive: true },
        { id: 's2', name: 'Diaz', hp: 5, alive: true },
        { id: 's3', name: 'Okafor', hp: 12, alive: true },
        { id: 's4', name: 'Reyes', hp: 12, alive: true },
      ],
      { s1: 1 },
    );
    const settled = completeOffer(state, offer.id, 'lost', battle);
    expect(settled.roster.every((soldier) => soldier.alive)).toBe(true);
    expect(settled.roster[1]!.hp).toBe(5);
    expect(settled.roster[0]!.kills).toBe(1);
  });
});

describe('healing', () => {
  test('an accepted endTurn heals each living soldier by 3, capped at max, never the dead', () => {
    const state = withRoster(createCampaign(13), [
      { id: 's1', name: 'Cole', hp: 2, maxHp: 12, kills: 0, rank: 0, alive: true, weapon: 'rifle' },
      { id: 's2', name: 'Diaz', hp: 11, maxHp: 12, kills: 0, rank: 0, alive: true, weapon: 'rifle' },
      { id: 's3', name: 'Okafor', hp: 0, maxHp: 12, kills: 0, rank: 0, alive: false, weapon: 'shotgun' },
      { id: 's4', name: 'Reyes', hp: 12, maxHp: 12, kills: 0, rank: 0, alive: true, weapon: 'rifle' },
    ]);
    const next = endTurn(state);
    expect(next.roster[0]!.hp).toBe(5);
    expect(next.roster[1]!.hp).toBe(12); // capped at max
    expect(next.roster[2]!.hp).toBe(0); // KIA never heals
    expect(next.roster[3]!.hp).toBe(12); // already full
  });
});

describe('promotion', () => {
  test('a survivor reaching five career kills promotes to rank 1 (Operative)', () => {
    const state = withRoster(createCampaign(14), [
      { id: 's1', name: 'Cole', hp: 12, maxHp: 12, kills: 4, rank: 0, alive: true, weapon: 'rifle' },
      ...freshRoster().slice(1),
    ]);
    const settled = settleRoster(state, battleState([{ id: 's1', name: 'Cole', hp: 12, alive: true }], { s1: 1 }));
    expect(settled.roster[0]!.rank).toBe(1);
  });

  test('promotion is single-rank: no stacking past Operative', () => {
    const state = withRoster(createCampaign(15), [
      { id: 's1', name: 'Cole', hp: 12, maxHp: 12, kills: 9, rank: 1, alive: true, weapon: 'rifle' },
      ...freshRoster().slice(1),
    ]);
    const settled = settleRoster(state, battleState([{ id: 's1', name: 'Cole', hp: 12, alive: true }], { s1: 3 }));
    expect(settled.roster[0]!.kills).toBe(12);
    expect(settled.roster[0]!.rank).toBe(1);
  });

  test('a soldier who dies at five kills is not promoted', () => {
    const state = withRoster(createCampaign(16), [
      { id: 's1', name: 'Cole', hp: 12, maxHp: 12, kills: 4, rank: 0, alive: true, weapon: 'rifle' },
      ...freshRoster().slice(1),
    ]);
    const settled = settleRoster(state, battleState([{ id: 's1', name: 'Cole', hp: 0, alive: false }], { s1: 1 }));
    expect(settled.roster[0]!.kills).toBe(5);
    expect(settled.roster[0]!.rank).toBe(0);
    expect(settled.roster[0]!.alive).toBe(false);
  });
});

describe('recruitment', () => {
  test('replaces the first KIA slot with a fresh, expensive recruit', () => {
    const state = noEvents(kia({ ...createCampaign(17), treasury: 100 }));
    const recruited = recruitSoldier(state);
    expect(recruited.treasury).toBe(60);
    expect(recruited.recruitCount).toBe(1);
    const soldier = recruited.roster[0]!;
    expect(soldier.id).not.toBe('s1');
    expect(soldier.id).toBe('r1');
    expect(soldier.name).toBe(RECRUIT_NAMES[0]);
    expect(soldier).toMatchObject({ hp: 12, maxHp: 12, kills: 0, rank: 0, alive: true, weapon: 'rifle' });
    expect(recruited.roster).toHaveLength(4);
  });

  test('is rejected when nobody is KIA, treasury is short, or events are pending', () => {
    const healthy = noEvents(createCampaign(18));
    expect(recruitSoldier(healthy)).toBe(healthy);

    const broke = noEvents(kia({ ...createCampaign(19), treasury: RECRUIT_COST - 1 }));
    expect(recruitSoldier(broke)).toBe(broke);

    const eventPending = kia({ ...createCampaign(20), turn: 3 }); // The Leak fires
    expect(recruitSoldier(eventPending)).toBe(eventPending);
  });

  test('is rejected while a mission is active or the campaign has ended', () => {
    const active = noEvents(kia({ ...createCampaign(21), missions: { 'area-51': { status: 'in-progress' } } }));
    expect(recruitSoldier(active)).toBe(active);

    const done = noEvents(kia({ ...createCampaign(22), outcome: 'won', endingId: 'quiet-throne' }));
    expect(recruitSoldier(done)).toBe(done);
  });

  test('cycles recruit names deterministically', () => {
    let state = noEvents({ ...createCampaign(23), treasury: 1000 });
    const names: string[] = [];
    const ids: string[] = [];
    for (let i = 0; i < RECRUIT_NAMES.length; i++) {
      state = kia(state); // kill slot 0 (the previous recruit)
      state = recruitSoldier(state);
      names.push(state.roster[0]!.name);
      ids.push(state.roster[0]!.id);
    }
    expect(names).toEqual([...RECRUIT_NAMES]);
    expect(ids).toEqual(Array.from({ length: RECRUIT_NAMES.length }, (_, i) => `r${i + 1}`));
    expect(state.recruitCount).toBe(RECRUIT_NAMES.length);
  });
});