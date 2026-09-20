import type { Scenario, Unit, Weapon } from './types.ts';

const RIFLE: Weapon = { name: 'Rifle', range: 8, accuracy: 75, damage: 4 };
const GUARD_RIFLE: Weapon = { name: 'Rifle', range: 8, accuracy: 75, damage: 5 };
const SHOTGUN: Weapon = { name: 'Shotgun', range: 4, accuracy: 90, damage: 6 };
const PLASMA: Weapon = { name: 'Plasma', range: 6, accuracy: 65, damage: 4 };
const CLAWS: Weapon = { name: 'Claws', range: 1, accuracy: 85, damage: 5 };
const GUARDIAN_WEAPON: Weapon = { name: 'Trident', range: 6, accuracy: 68, damage: 4 };

function soldier(id: string, name: string, x: number, y: number, weapon: Weapon): Unit {
  return { id, name, team: 'squad', pos: { x, y }, hp: 10, maxHp: 10, ap: 2, maxAp: 2, move: 4, weapon, alive: true };
}

function alien(id: string, name: string, x: number, y: number, weapon: Weapon, hp = 8): Unit {
  return { id, name, team: 'alien', pos: { x, y }, hp, maxHp: hp, ap: 2, maxAp: 2, move: 4, weapon, alive: true };
}

/** 16x16. '.' floor, '#' wall, 'c' cover. Squad lands bottom-left. */
export const FARMSTEAD: Scenario = {
  name: 'Farmstead',
  rows: [
    '################',
    '#......#.......#',
    '#.c....#..c....#',
    '#......#.......#',
    '#....###.......#',
    '#.........c....#',
    '#..c...........#',
    '#.......####...#',
    '#.......#......#',
    '#..c....#..c...#',
    '#.......#......#',
    '#..............#',
    '#....c.....c...#',
    '#..............#',
    '#..............#',
    '################',
  ],
  units: [
    soldier('s1', 'Cole', 1, 14, RIFLE),
    soldier('s2', 'Diaz', 3, 14, RIFLE),
    soldier('s3', 'Okafor', 2, 13, SHOTGUN),
    soldier('s4', 'Reyes', 4, 13, RIFLE),
    alien('a1', 'Sectoid', 13, 1, PLASMA),
    alien('a2', 'Sectoid', 14, 2, PLASMA),
    alien('a3', 'Sectoid', 9, 2, PLASMA),
    alien('a4', 'Sectoid', 12, 5, PLASMA),
    alien('a5', 'Floater', 14, 9, PLASMA, 10),
    alien('a6', 'Chryssalid', 10, 12, CLAWS, 12),
    alien('a7', 'Sectoid', 3, 2, PLASMA),
  ],
};

const MISSION_SQUAD: Unit[] = [
  soldier('s1', 'Cole', 1, 14, RIFLE),
  soldier('s2', 'Diaz', 3, 14, RIFLE),
  soldier('s3', 'Okafor', 2, 13, SHOTGUN),
  soldier('s4', 'Reyes', 4, 13, RIFLE),
];

export const AREA51_HANGAR: Scenario = {
  name: 'Area 51 Hangar',
  rows: [
    '################',
    '#..............#',
    '#..cc......cc..#',
    '#..............#',
    '#......cc......#',
    '#..............#',
    '#..cc......cc..#',
    '#..............#',
    '#......cc......#',
    '#..............#',
    '#..cc......cc..#',
    '#..............#',
    '#......cc......#',
    '#..............#',
    '#..............#',
    '################',
  ],
  units: [
    ...MISSION_SQUAD,
    alien('g1', 'Guard', 13, 2, GUARD_RIFLE, 9),
    alien('g2', 'Guard', 10, 4, GUARD_RIFLE, 9),
    alien('g3', 'Guard', 13, 7, GUARD_RIFLE, 9),
    alien('g4', 'Guard', 9, 10, GUARD_RIFLE, 9),
  ],
  objective: { tile: { x: 14, y: 1 }, holdRounds: 2 },
};

export const ATLANTIS_RUINS: Scenario = {
  name: 'Atlantis Ruins',
  rows: [
    '################',
    '#..............#',
    '#.c...c...c....#',
    '#..............#',
    '#....c.....c...#',
    '#..............#',
    '#.c.....c......#',
    '#...........c..#',
    '#....c.........#',
    '#.........c....#',
    '#..c........c..#',
    '#......c.......#',
    '#..........c...#',
    '#..............#',
    '#..............#',
    '################',
  ],
  units: [
    ...MISSION_SQUAD,
    alien('u1', 'Guardian Alpha', 13, 2, GUARDIAN_WEAPON, 10),
    alien('u2', 'Guardian Beta', 10, 4, GUARDIAN_WEAPON, 10),
    alien('u3', 'Guardian Gamma', 13, 8, GUARDIAN_WEAPON, 10),
    alien('u4', 'Guardian Delta', 9, 11, GUARDIAN_WEAPON, 10),
    alien('u5', 'Guardian Prime', 13, 12, GUARDIAN_WEAPON, 12),
  ],
  objective: { tile: { x: 14, y: 1 }, holdRounds: 2 },
};

export const SCENARIOS: Scenario[] = [FARMSTEAD, AREA51_HANGAR, ATLANTIS_RUINS];
