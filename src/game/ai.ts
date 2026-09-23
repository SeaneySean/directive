import { previewShot } from './combat.ts';
import { hasLineOfSight, inCover } from './los.ts';
import { distance, isWalkable, key, manhattan, neighbors4, tileAt } from './map.ts';
import { reachable } from './pathfinding.ts';
import { canAct, endTurn, livingUnits, moveUnit, shoot, unitById } from './state.ts';
import type { GameState, Team, Unit, Vec } from './types.ts';

/** Minimum hit chance the AI will accept before it prefers to reposition. */
const MIN_SHOT_CHANCE = 25;

/** A holding guard only repositions within this many walkable path steps. */
const HOLD_REPOSITION_STEPS = 2;

export interface AiStep {
  kind: 'move' | 'shoot' | 'wait';
  unitId: string;
  to?: Vec;
  targetId?: string;
}

export type AiPolicy = (state: GameState, unitId: string) => AiStep;

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

/** Legal-shot chance from an arbitrary tile, or null. */
function shotChanceFrom(state: GameState, unit: Unit, from: Vec, enemy: Unit): number | null {
  return previewShot(state.grid, { ...unit, pos: from }, enemy)?.chance ?? null;
}

/**
 * Pick a destination for a holding guard: within HOLD_REPOSITION_STEPS walkable
 * steps, with a legal shot against some enemy and directional cover from that
 * same enemy. Deterministic ordering: highest shot chance, then shortest path,
 * then y, then x.
 */
function holdDestination(state: GameState, unit: Unit, enemies: Unit[]): Vec | null {
  const reach = reachable(state.grid, state.units, unit.pos, HOLD_REPOSITION_STEPS);
  let best: { pos: Vec; chance: number; dist: number } | null = null;
  for (const node of reach.values()) {
    if (node.dist === 0) continue;
    for (const e of enemies) {
      const chance = shotChanceFrom(state, unit, node.pos, e);
      if (chance === null) continue;
      if (!inCover(state.grid, node.pos, e.pos)) continue;
      const candidate = { pos: node.pos, chance, dist: node.dist };
      if (!best || candidate.chance > best.chance
        || (candidate.chance === best.chance && candidate.dist < best.dist)
        || (candidate.chance === best.chance && candidate.dist === best.dist
          && (candidate.pos.y < best.pos.y
            || (candidate.pos.y === best.pos.y && candidate.pos.x < best.pos.x)))) {
        best = candidate;
      }
    }
  }
  return best?.pos ?? null;
}

/**
 * Holding behaviour for guards and guardians: shoot whenever a legal shot
 * exists (even below the normal repositioning threshold); otherwise move only
 * with at least 2 AP to a nearby destination that both shoots an enemy and has
 * directional cover from that enemy; otherwise wait.
 */
function decideHold(state: GameState, unit: Unit): AiStep {
  const unitId = unit.id;
  const enemies = livingUnits(state, unit.team === 'alien' ? 'squad' : 'alien');
  if (!canAct(state, unit) || enemies.length === 0) return { kind: 'wait', unitId };

  const target = bestTarget(state, unit, enemies);
  if (target) return { kind: 'shoot', unitId, targetId: target.target.id };

  if (unit.ap >= 2) {
    const destination = holdDestination(state, unit, enemies);
    if (destination) return { kind: 'move', unitId, to: destination };
  }

  return { kind: 'wait', unitId };
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
  if (unit.stance === 'hold') return decideHold(state, unit);
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

function pathDistance(state: GameState, from: Vec, to: Vec, movingUnitId: string): number {
  const blocked = new Set(
    state.units
      .filter((unit) => unit.alive && unit.id !== movingUnitId)
      .map((unit) => key(unit.pos)),
  );
  const seen = new Set([key(from)]);
  const queue: Array<{ pos: Vec; dist: number }> = [{ pos: from, dist: 0 }];
  while (queue.length) {
    const current = queue.shift()!;
    if (current.pos.x === to.x && current.pos.y === to.y) return current.dist;
    for (const next of neighbors4(current.pos)) {
      const nextKey = key(next);
      if (seen.has(nextKey) || !isWalkable(state.grid, next) || blocked.has(nextKey)) continue;
      seen.add(nextKey);
      queue.push({ pos: next, dist: current.dist + 1 });
    }
  }
  return Infinity;
}

/** Objective-aware squad policy used by the headless balance harness. */
export function squadPolicy(state: GameState, unitId: string): AiStep {
  const unit = unitById(state, unitId);
  const enemies = livingUnits(state, unit.team === 'alien' ? 'squad' : 'alien');
  if (!canAct(state, unit) || enemies.length === 0) return { kind: 'wait', unitId };

  const shots = enemies.flatMap((enemy) => {
    const preview = previewShot(state.grid, unit, enemy);
    return preview ? [{ enemy, chance: preview.chance }] : [];
  }).sort((left, right) =>
    left.enemy.hp - right.enemy.hp
    || right.chance - left.chance
    || left.enemy.id.localeCompare(right.enemy.id),
  );
  if (shots[0]) return { kind: 'shoot', unitId, targetId: shots[0].enemy.id };

  if (!state.objective) return decide(state, unitId);
  const currentDistance = pathDistance(state, unit.pos, state.objective.tile, unit.id);
  const nearestEnemy = [...enemies].sort((left, right) =>
    manhattan(unit.pos, left.pos) - manhattan(unit.pos, right.pos)
    || left.id.localeCompare(right.id),
  )[0]!;
  const candidates = [...reachable(state.grid, state.units, unit.pos, unit.move).values()]
    .filter((node) => node.dist > 0)
    .map((node) => ({
      pos: node.pos,
      distance: pathDistance(state, node.pos, state.objective!.tile, unit.id),
      covered: inCover(state.grid, node.pos, nearestEnemy.pos),
    }))
    .filter((candidate) => candidate.distance < currentDistance)
    .sort((left, right) =>
      Number(right.covered) - Number(left.covered)
      || left.distance - right.distance
      || left.pos.y - right.pos.y
      || left.pos.x - right.pos.x,
    );
  return candidates[0]
    ? { kind: 'move', unitId, to: candidates[0].pos }
    : decide(state, unitId);
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
export function runTeamTurn(
  state: GameState,
  team: Team,
  policy: AiPolicy = decide,
): { state: GameState; steps: AiStep[] } {
  const steps: AiStep[] = [];
  let s = state;
  if (s.turn !== team || s.outcome !== 'playing') return { state: s, steps };
  for (const unit of livingUnits(s, team)) {
    for (let guard = 0; guard < unit.maxAp + 1; guard++) {
      if (s.outcome !== 'playing') break;
      const step = policy(s, unit.id);
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
