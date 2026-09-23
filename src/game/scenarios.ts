import type { Scenario, Unit, Weapon } from './types.ts';

const RIFLE: Weapon = { name: 'Rifle', range: 8, accuracy: 75, damage: 4 };
const GUARD_RIFLE: Weapon = { name: 'Rifle', range: 7, accuracy: 60, damage: 4 };
const SHOTGUN: Weapon = { name: 'Shotgun', range: 4, accuracy: 90, damage: 6 };
const PLASMA: Weapon = { name: 'Plasma', range: 6, accuracy: 65, damage: 4 };
const CLAWS: Weapon = { name: 'Claws', range: 1, accuracy: 85, damage: 5 };
const GUARDIAN_WEAPON: Weapon = { name: 'Trident', range: 6, accuracy: 60, damage: 4 };

function soldier(id: string, name: string, x: number, y: number, weapon: Weapon): Unit {
  return { id, name, team: 'squad', pos: { x, y }, hp: 12, maxHp: 12, ap: 2, maxAp: 2, move: 4, weapon, alive: true };
}

function alien(
  id: string,
  name: string,
  x: number,
  y: number,
  weapon: Weapon,
  hp = 8,
  stance?: 'hold' | 'advance',
): Unit {
  return { id, name, team: 'alien', pos: { x, y }, hp, maxHp: hp, ap: 2, maxAp: 2, move: 4, weapon, alive: true, stance };
}

function reinforcement(name: string, weapon: Weapon, hp: number): Omit<Unit, 'id' | 'pos'> {
  return { name, team: 'alien', hp, maxHp: hp, ap: 2, maxAp: 2, move: 4, weapon, alive: true, stance: 'advance' };
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

const HANGAR_SQUAD: Unit[] = [
  soldier('s1', 'Cole', 4, 18, RIFLE),
  soldier('s2', 'Diaz', 7, 18, RIFLE),
  soldier('s3', 'Okafor', 10, 18, SHOTGUN),
  soldier('s4', 'Reyes', 13, 18, RIFLE),
];

const ATLANTIS_SQUAD: Unit[] = [
  soldier('s1', 'Cole', 4, 20, RIFLE),
  soldier('s2', 'Diaz', 7, 20, RIFLE),
  soldier('s3', 'Okafor', 10, 20, SHOTGUN),
  soldier('s4', 'Reyes', 13, 20, RIFLE),
];

export const AREA51_HANGAR: Scenario = {
  name: 'Area 51 Hangar',
  // 20x20 open hangar floor. Crate clusters give cover to stand beside; the
  // objective sits under the craft on the far third, ringed by holding guards.
  rows: [
    '####################',
    '#..................#',
    '#....cc......cc....#',
    '#.......cc.........#',
    '#..c....c....c.....#',
    '#..................#',
    '#....cc......cc....#',
    '#........c.........#',
    '#..cc......cc......#',
    '#..................#',
    '#......c....c......#',
    '#..................#',
    '#..c..c....c..c....#',
    '#..................#',
    '#..................#',
    '#....c....c....c...#',
    '#..................#',
    '#...c..c..c..c.....#',
    '#..................#',
    '####################',
  ],
  units: [
    ...HANGAR_SQUAD,
    alien('g1', 'Guard', 6, 3, GUARD_RIFLE, 14, 'hold'),
    alien('g2', 'Guard', 12, 3, GUARD_RIFLE, 14, 'hold'),
    alien('g3', 'Guard', 9, 6, GUARD_RIFLE, 14, 'hold'),
  ],
  objective: { tile: { x: 9, y: 4 }, holdRounds: 2 },
  reinforcements: {
    fromRound: 6,
    every: 3,
    max: 2,
    spawns: [{ x: 3, y: 1 }, { x: 6, y: 1 }, { x: 9, y: 1 }, { x: 12, y: 1 }, { x: 15, y: 1 }],
    unit: reinforcement('Guard', GUARD_RIFLE, 14),
  },
};

export const ATLANTIS_RUINS: Scenario = {
  name: 'Atlantis Ruins',
  // 22x22 flooded colonnade. Pillars scattered for cover; the formula altar
  // sits on the far third, ringed by holding guardians.
  rows: [
    '######################',
    '#....................#',
    '#..c...c..c...c......#',
    '#....................#',
    '#.....c....c.........#',
    '#....................#',
    '#..c............c....#',
    '#........c.c.........#',
    '#...c............c...#',
    '#....................#',
    '#.......c..c.........#',
    '#....................#',
    '#..c..c....c..c......#',
    '#....................#',
    '#....................#',
    '#.....c......c.......#',
    '#....................#',
    '#...c..........c.....#',
    '#....................#',
    '#...c..c..c..c.......#',
    '#....................#',
    '######################',
  ],
  units: [
    ...ATLANTIS_SQUAD,
    alien('u1', 'Guardian Alpha', 8, 3, GUARDIAN_WEAPON, 16, 'hold'),
    alien('u2', 'Guardian Beta', 12, 3, GUARDIAN_WEAPON, 16, 'hold'),
    alien('u3', 'Guardian Gamma', 9, 2, GUARDIAN_WEAPON, 16, 'hold'),
    alien('u4', 'Guardian Delta', 10, 5, GUARDIAN_WEAPON, 16, 'hold'),
  ],
  objective: { tile: { x: 10, y: 4 }, holdRounds: 2 },
  reinforcements: {
    fromRound: 5,
    every: 2,
    max: 3,
    spawns: [{ x: 4, y: 1 }, { x: 8, y: 1 }, { x: 12, y: 1 }, { x: 16, y: 1 }],
    unit: reinforcement('Guardian', GUARDIAN_WEAPON, 16),
  },
};

export const SCENARIOS: Scenario[] = [FARMSTEAD, AREA51_HANGAR, ATLANTIS_RUINS];
