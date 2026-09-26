// Fog-of-war visibility and enemy memory. Pure functions; no Phaser.

import { hasLineOfSight } from './los.ts';
import { inBounds, key } from './map.ts';
import type { ShotPreview } from './combat.ts';
import { previewShot } from './combat.ts';
import type { GameState, Unit, Vec } from './types.ts';

/** Chebyshev radius a living squad unit can see (walls block, cover does not). */
export const VISIBLE_RANGE = 7;

/**
 * True when a battle uses fog-of-war rules: generated district missions carry
 * district metadata, hand-authored story scenarios do not. Until Part 2 wires
 * the fog renderer, this keeps existing story battles fully playable while the
 * district gameplay is opt-in.
 */
export function hasFog(state: GameState): boolean {
  return state.district !== undefined;
}

export function tileIndex(state: GameState, p: Vec): number {
  return p.y * state.grid.width + p.x;
}

/**
 * Every tile currently visible to at least one living squad unit: within
 * Chebyshev distance `VISIBLE_RANGE` and with `hasLineOfSight` (walls block,
 * cover does not). Returns tile keys.
 */
export function visibleTiles(state: GameState): Set<string> {
  const out = new Set<string>();
  for (const unit of state.units) {
    if (unit.team !== 'squad' || !unit.alive) continue;
    for (let dy = -VISIBLE_RANGE; dy <= VISIBLE_RANGE; dy++) {
      for (let dx = -VISIBLE_RANGE; dx <= VISIBLE_RANGE; dx++) {
        const p = { x: unit.pos.x + dx, y: unit.pos.y + dy };
        if (!inBounds(state.grid, p)) continue;
        if (hasLineOfSight(state.grid, unit.pos, p)) out.add(key(p));
      }
    }
  }
  return out;
}

/** Living enemies standing on currently-visible tiles. */
export function knownEnemies(state: GameState): Unit[] {
  const visible = visibleTiles(state);
  return state.units.filter((unit) => unit.alive && unit.team === 'alien' && visible.has(key(unit.pos)));
}

/** True when `unit` is a known enemy (currently visible to some living squad unit). */
export function isKnownEnemy(state: GameState, unit: Unit): boolean {
  if (unit.team !== 'alien' || !unit.alive) return false;
  return visibleTiles(state).has(key(unit.pos));
}

/**
 * State-aware squad shot preview. Combines `previewShot`'s geometry/combat API
 * with fog: a squad attacker may only shoot an enemy it can currently see, so a
 * hidden target returns null while a visible target falls through to the normal
 * preview. Hand-authored (no-fog) scenarios pass through unconditionally, and
 * enemy attackers are never visibility-gated.
 */
export function squadShotPreview(state: GameState, attacker: Unit, target: Unit): ShotPreview | null {
  if (attacker.team === 'squad' && hasFog(state) && !isKnownEnemy(state, target)) return null;
  return previewShot(state.grid, attacker, target);
}

/**
 * Refresh explored (grow-only) and enemy last-known positions. Runs after every
 * successful move, shot, reinforcement arrival and turn transition.
 *
 * Enemy memory: an enemy seen now stores its current tile; a hidden enemy keeps
 * its stale last-seen tile unless that tile is currently visible and empty (we
 * look and it is gone), in which case the contact is dropped. Dead enemies are
 * dropped. A district assassination latches `assassinationAlerted` the first
 * turn its target is visible.
 */
export function refreshMemory(state: GameState): GameState {
  const visible = visibleTiles(state);

  const explored = state.explored.slice();
  for (let y = 0; y < state.grid.height; y++) {
    for (let x = 0; x < state.grid.width; x++) {
      const idx = y * state.grid.width + x;
      if (!explored[idx] && visible.has(`${x},${y}`)) explored[idx] = true;
    }
  }

  const positions: Record<string, Vec> = {};
  for (const unit of state.units) {
    if (unit.team !== 'alien' || !unit.alive) continue;
    const here = key(unit.pos);
    if (visible.has(here)) {
      positions[unit.id] = { ...unit.pos };
    } else {
      const prev = state.knownEnemyPositions[unit.id];
      if (prev && visible.has(key(prev))) continue; // seen tile now empty -> forget
      if (prev) positions[unit.id] = { ...prev };
    }
  }

  let alerted = state.assassinationAlerted;
  const objective = state.objective;
  if (!alerted && objective?.kind === 'assassinate') {
    const targetId = objective.targetId;
    const target = state.units.find((unit) => unit.id === targetId);
    if (target && target.alive && visible.has(key(target.pos))) alerted = true;
  }

  return { ...state, explored, knownEnemyPositions: positions, assassinationAlerted: alerted };
}