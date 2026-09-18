import type { Scenario, Unit, Weapon } from './types.ts';

const RIFLE: Weapon = { name: 'Rifle', range: 8, accuracy: 75, damage: 4 };
const SHOTGUN: Weapon = { name: 'Shotgun', range: 4, accuracy: 90, damage: 6 };
const PLASMA: Weapon = { name: 'Plasma', range: 6, accuracy: 65, damage: 4 };
const CLAWS: Weapon = { name: 'Claws', range: 1, accuracy: 85, damage: 5 };

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
    soldier('s2', 'Diaz', 2, 14, RIFLE),
    soldier('s3', 'Okafor', 1, 13, SHOTGUN),
    soldier('s4', 'Reyes', 2, 13, RIFLE),
    alien('a1', 'Sectoid', 13, 1, PLASMA),
    alien('a2', 'Sectoid', 14, 2, PLASMA),
    alien('a3', 'Sectoid', 9, 2, PLASMA),
    alien('a4', 'Sectoid', 12, 5, PLASMA),
    alien('a5', 'Floater', 14, 9, PLASMA, 10),
    alien('a6', 'Chryssalid', 10, 12, CLAWS, 12),
    alien('a7', 'Sectoid', 3, 2, PLASMA),
  ],
};

export const SCENARIOS: Scenario[] = [FARMSTEAD];
