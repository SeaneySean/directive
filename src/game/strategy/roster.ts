import { hasResearchGrant } from './research.ts';
import type { GameState, Unit, Weapon } from '../types.ts';
import type { CampaignState, Soldier, WeaponId } from './types.ts';

// Pure roster rules for the persistent squad. No Phaser, no DOM.

/** Base squirt weapon statistics, matching the existing player weapons. */
export const BASE_WEAPONS: Readonly<Record<WeaponId, Weapon>> = {
  rifle: { name: 'Rifle', range: 8, accuracy: 75, damage: 4 },
  shotgun: { name: 'Shotgun', range: 4, accuracy: 90, damage: 6 },
};

/** Researched plasma replacement, applied before any rank accuracy bonus. */
const PLASMA: Weapon = { name: 'Plasma', range: 7, accuracy: 75, damage: 5 };

/** Accuracy added to a rank-1 ("Operative") soldier's weapon when fielding. */
export const RANK_ACCURACY_BONUS = 10;

/** Career kills at which a surviving soldier is promoted to rank 1. */
export const PROMOTION_KILLS = 5;

/** Treasury cost to replace a KIA soldier. */
export const RECRUIT_COST = 40;

/** Deterministic recruit name pool, cycled as replacements are hired. */
export const RECRUIT_NAMES: readonly string[] = [
  'Vega',
  'Novak',
  'Ito',
  'Keller',
  'Moreau',
  'Barrow',
  'Sato',
  'Lindqvist',
  'Osei',
  'Chen',
  'Volkov',
  'Hassan',
] as const;

/** The four starting soldiers, seeded with their existing tactical ids. */
export function freshRoster(): Soldier[] {
  return [
    { id: 's1', name: 'Cole', hp: 12, maxHp: 12, kills: 0, rank: 0, alive: true, weapon: 'rifle' },
    { id: 's2', name: 'Diaz', hp: 12, maxHp: 12, kills: 0, rank: 0, alive: true, weapon: 'rifle' },
    { id: 's3', name: 'Okafor', hp: 12, maxHp: 12, kills: 0, rank: 0, alive: true, weapon: 'shotgun' },
    { id: 's4', name: 'Reyes', hp: 12, maxHp: 12, kills: 0, rank: 0, alive: true, weapon: 'rifle' },
  ];
}

/** The roster's living soldiers, in roster order. */
export function livingRoster(roster: Soldier[]): Soldier[] {
  return roster.filter((soldier) => soldier.alive);
}

/** The campaign's living soldiers, in roster order. */
export function livingSoldiers(state: CampaignState): Soldier[] {
  return livingRoster(state.roster);
}

/** A soldier's field weapon: base, then plasma replacement, then rank bonus. */
function fieldWeapon(state: CampaignState, soldier: Soldier): Weapon {
  const base = hasResearchGrant(state, 'plasma-small-arms') ? PLASMA : BASE_WEAPONS[soldier.weapon];
  let weapon = { ...base };
  if (soldier.rank === 1) weapon = { ...weapon, accuracy: weapon.accuracy + RANK_ACCURACY_BONUS };
  return weapon;
}

/**
 * Build the fielded squad from living roster members, in roster order, onto the
 * template squad's spawn positions in order. Preserves soldier id, name, current
 * HP and max HP, keeps 2 AP and move 4, and applies the base weapon, the researched
 * plasma replacement and the rank accuracy bonus. Fewer living soldiers fields a
 * smaller squad. Templates are never mutated.
 */
export function buildFieldSquad(state: CampaignState, spawns: readonly Unit[]): Unit[] {
  const living = livingRoster(state.roster);
  return spawns.slice(0, living.length).map((template, index) => {
    const soldier = living[index]!;
    return {
      ...template,
      id: soldier.id,
      name: soldier.name,
      pos: { ...template.pos },
      hp: soldier.hp,
      maxHp: soldier.maxHp,
      ap: template.ap,
      maxAp: template.maxAp,
      move: template.move,
      weapon: fieldWeapon(state, soldier),
      alive: true,
    };
  });
}

/**
 * Write a finished battle's results back into the roster: match fielded squad
 * units by soldier id, copy HP/alive, add their kills by career kills, and
 * promote survivors crossing the kill threshold. Unfielded soldiers (dead or
 * never fielded) are unchanged; KIA soldiers stay dead. Pure and reusable, so
 * settlement is guarded once by the caller's mission/offer guard.
 */
export function settleRoster(state: CampaignState, battle: GameState): CampaignState {
  const roster = state.roster.map((soldier) => {
    const fielded = battle.units.find((unit) => unit.team === 'squad' && unit.id === soldier.id);
    if (!fielded) return soldier;
    const kills = soldier.kills + (battle.killsBy[soldier.id] ?? 0);
    const alive = fielded.alive;
    const rank = soldier.rank === 0 && alive && kills >= PROMOTION_KILLS ? (1 as const) : soldier.rank;
    return { ...soldier, hp: fielded.hp, alive, kills, rank };
  });
  return { ...state, roster };
}