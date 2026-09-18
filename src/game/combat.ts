import { hasLineOfSight, inCover } from './los.ts';
import { distance } from './map.ts';
import type { Grid, Unit } from './types.ts';

export const COVER_PENALTY = 30;
export const FALLOFF_PER_TILE = 4;
export const MIN_HIT = 5;
export const MAX_HIT = 95;

export interface ShotPreview {
  chance: number;
  distance: number;
  cover: boolean;
}

/**
 * Hit chance for attacker shooting target, or null when the shot is not
 * possible (out of range, no line of sight, same team, dead).
 */
export function previewShot(grid: Grid, attacker: Unit, target: Unit): ShotPreview | null {
  if (!attacker.alive || !target.alive) return null;
  if (attacker.team === target.team) return null;
  const dist = distance(attacker.pos, target.pos);
  if (dist === 0 || dist > attacker.weapon.range) return null;
  if (!hasLineOfSight(grid, attacker.pos, target.pos)) return null;
  const cover = inCover(grid, target.pos, attacker.pos);
  let chance = attacker.weapon.accuracy - (dist - 1) * FALLOFF_PER_TILE;
  if (cover) chance -= COVER_PENALTY;
  chance = Math.max(MIN_HIT, Math.min(MAX_HIT, chance));
  return { chance, distance: dist, cover };
}
