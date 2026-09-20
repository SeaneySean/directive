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
  soldier('s1', 'Cole', 2, 13, RIFLE),
  soldier('s2', 'Diaz', 5, 13, RIFLE),
  soldier('s3', 'Okafor', 8, 13, SHOTGUN),
  soldier('s4', 'Reyes', 11, 13, RIFLE),
];

export const AREA51_HANGAR: Scenario = {
  name: 'Area 51 Hangar',
  // Open hangar floor. Crate clusters give cover to stand beside; the objective
  // sits under the craft at the far end, flanked by crates, four moves away.
  rows: [
    '################',
    '#..............#',
    '#..cc......cc..#',
    '#......c.......#',
    '#....c....c....#',
    '#..............#',
    '#..cc......cc..#',
    '#.......c......#',
    '#..cc......cc..#',
    '#..............#',
    '#.....c..c.....#',
    '#..............#',
    '#.c..c..c..c...#',
    '#..............#',
    '#..............#',
    '################',
  ],
  units: [
    ...MISSION_SQUAD,
    alien('g1', 'Guard', 4, 3, GUARD_RIFLE, 12),
    alien('g2', 'Guard', 11, 3, GUARD_RIFLE, 12),
    alien('g3', 'Guard', 8, 6, GUARD_RIFLE, 12),
  ],
  objective: { tile: { x: 8, y: 3 }, holdRounds: 2 },
};

export const ATLANTIS_RUINS: Scenario = {
  name: 'Atlantis Ruins',
  // Broken colonnade. Pillars scattered for cover; the formula altar at the far end.
  rows: [
    '################',
    '#..............#',
    '#.c...c..c...c.#',
    '#..............#',
    '#....c....c....#',
    '#..............#',
    '#.c..........c.#',
    '#......c.c.....#',
    '#..c........c..#',
    '#..............#',
    '#.....c..c.....#',
    '#..............#',
    '#.c..c..c..c...#',
    '#..............#',
    '#..............#',
    '################',
  ],
  units: [
    ...MISSION_SQUAD,
    alien('u1', 'Guardian Alpha', 3, 3, GUARDIAN_WEAPON, 14),
    alien('u2', 'Guardian Beta', 12, 3, GUARDIAN_WEAPON, 14),
    alien('u3', 'Guardian Gamma', 6, 6, GUARDIAN_WEAPON, 14),
    alien('u4', 'Guardian Delta', 10, 6, GUARDIAN_WEAPON, 14),
  ],
  objective: { tile: { x: 8, y: 3 }, holdRounds: 2 },
};

export const SCENARIOS: Scenario[] = [FARMSTEAD, AREA51_HANGAR, ATLANTIS_RUINS];
