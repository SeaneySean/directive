import { previewShot } from './combat.ts';
import { hasLineOfSight } from './los.ts';
import { distance, manhattan, neighbors4, tileAt } from './map.ts';
import { reachable } from './pathfinding.ts';
import { canAct, endTurn, livingUnits, moveUnit, shoot, unitById } from './state.ts';
import type { GameState, Team, Unit, Vec } from './types.ts';

/** Minimum hit chance the AI will accept before it prefers to reposition. */
const MIN_SHOT_CHANCE = 25;

export interface AiStep {
  kind: 'move' | 'shoot' | 'wait';
  unitId: string;
  to?: Vec;
  targetId?: string;
}

function bestTarget(state: GameState, unit: Unit, enemies: Unit[]): { target: Unit; chance: number } | null {
  let best: { target: Unit; chance: number } | null = null;
  for (const e of enemies) {
    const p = previewShot(state.grid, unit, e);
    if (!p) continue;
    // Prefer kills, then hit chance.
    const score = p.chance + (e.hp <= unit.weapon.damage ? 20 : 0);
    if (!best || score > best.chance) best = { target: e, chance: score };
  }
  return best;
}

/** Score a destination: closer to enemies is better, cover and a shot are better. */
function scoreTile(state: GameState, unit: Unit, tile: Vec, enemies: Unit[]): number {
  let nearest = Infinity;
  let shotChance = 0;
  for (const e of enemies) {
    nearest = Math.min(nearest, manhattan(tile, e.pos));
    const dist = distance(tile, e.pos);
    if (dist >= 1 && dist <= unit.weapon.range && hasLineOfSight(state.grid, tile, e.pos)) {
      shotChance = Math.max(shotChance, unit.weapon.accuracy - (dist - 1) * 4);
    }
  }
  let score = -nearest * 3;
  if (shotChance > 0) score += shotChance / 2;
  if (neighbors4(tile).some((n) => tileAt(state.grid, n) === 'cover')) score += 12;
  return score;
}

/** Decide one action for a unit, or wait if nothing useful remains. */
export function decide(state: GameState, unitId: string): AiStep {
  const unit = unitById(state, unitId);
  const enemies = livingUnits(state, unit.team === 'alien' ? 'squad' : 'alien');
  if (!canAct(state, unit) || enemies.length === 0) return { kind: 'wait', unitId };

  const target = bestTarget(state, unit, enemies);
  if (target && target.chance >= MIN_SHOT_CHANCE) {
    return { kind: 'shoot', unitId, targetId: target.target.id };
  }

  const reach = reachable(state.grid, state.units, unit.pos, unit.move);
  let bestTile: Vec | null = null;
  let bestScore = scoreTile(state, unit, unit.pos, enemies);
  for (const node of reach.values()) {
    if (node.dist === 0) continue;
    const s = scoreTile(state, unit, node.pos, enemies);
    if (s > bestScore) {
      bestScore = s;
      bestTile = node.pos;
    }
  }
  if (bestTile) return { kind: 'move', unitId, to: bestTile };
  if (target) return { kind: 'shoot', unitId, targetId: target.target.id };
  return { kind: 'wait', unitId };
}

export function applyStep(state: GameState, step: AiStep): GameState {
  if (step.kind === 'move' && step.to) return moveUnit(state, step.unitId, step.to);
  if (step.kind === 'shoot' && step.targetId) return shoot(state, step.unitId, step.targetId)?.state ?? state;
  return state;
}

/**
 * Play a whole turn for a team, then end it. Returns the steps taken so a
 * renderer can animate them one at a time.
 */
export function runTeamTurn(state: GameState, team: Team): { state: GameState; steps: AiStep[] } {
  const steps: AiStep[] = [];
  let s = state;
  if (s.turn !== team || s.outcome !== 'playing') return { state: s, steps };
  for (const unit of livingUnits(s, team)) {
    for (let guard = 0; guard < unit.maxAp + 1; guard++) {
      if (s.outcome !== 'playing') break;
      const step = decide(s, unit.id);
      if (step.kind === 'wait') break;
      const before = s;
      s = applyStep(s, step);
      if (s === before) break;
      steps.push(step);
    }
  }
  s = endTurn(s);
  return { state: s, steps };
}
