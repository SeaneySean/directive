import { previewShot } from './combat.ts';
import { hasLineOfSight, inCover } from './los.ts';
import { distance, isWalkable, key, manhattan, neighbors4, tileAt } from './map.ts';
import { reachable } from './pathfinding.ts';
import { canAct, endTurn, livingUnits, moveUnit, shoot, unitById } from './state.ts';
import type { GameState, ScenarioObjective, Team, Unit, Vec } from './types.ts';

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
  if (unit.stance === 'flee') return decideFlee(state, unit);
  if (unit.stance === 'smart') return advanceSmart(state, unitId);
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

/**
 * Objective-approach distance. Walls and cover block; friendly (same-team)
 * units block (you cannot walk through allies); enemy units do NOT block the
 * measurement — the squad advances toward the objective through hostiles and
 * shoots them when a legal shot opens up. This keeps a recover item that is
 * ringed by holding guards reachable.
 */
function pathDistanceTo(state: GameState, from: Vec, to: Vec, movingUnitId: string): number {
  const mover = state.units.find((unit) => unit.id === movingUnitId);
  const blocked = new Set(
    state.units
      .filter((unit) => unit.alive && unit.id !== movingUnitId && unit.team === mover?.team)
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

/**
 * Lowest-HP (then highest chance, then id) legal target, shared by the smart
 * squad and the smart enemy policy.
 */
function lowestHpTarget(state: GameState, unit: Unit, enemies: Unit[]): Unit | null {
  const best = enemies.flatMap((enemy) => {
    const preview = previewShot(state.grid, unit, enemy);
    return preview ? [{ enemy, chance: preview.chance }] : [];
  }).sort((left, right) =>
    left.enemy.hp - right.enemy.hp
    || right.chance - left.chance
    || left.enemy.id.localeCompare(right.enemy.id),
  )[0];
  return best?.enemy ?? null;
}

/**
 * Team-neutral combat policy used by 'smart' units (the rival cabal) and by
 * the squad on clash missions: shoot the lowest-HP legal target, otherwise
 * close distance (wall-aware path distance) while preferring directional cover
 * from the nearest enemy. Never looks at the objective, so enemy smart units
 * cannot chase the player's recovery or assassination goals.
 */
export function advanceSmart(state: GameState, unitId: string): AiStep {
  const unit = unitById(state, unitId);
  const enemies = livingUnits(state, unit.team === 'alien' ? 'squad' : 'alien');
  if (!canAct(state, unit) || enemies.length === 0) return { kind: 'wait', unitId };

  const target = lowestHpTarget(state, unit, enemies);
  if (target) return { kind: 'shoot', unitId, targetId: target.id };

  // Chase the enemy we can actually reach (wall-aware path distance), so a wall
  // stub is walked around rather than forming a deadlock.
  const nearestEnemy = [...enemies].sort((left, right) =>
    pathDistanceTo(state, unit.pos, left.pos, unit.id) - pathDistanceTo(state, unit.pos, right.pos, unit.id)
    || left.id.localeCompare(right.id),
  )[0]!;
  const currentDistance = pathDistanceTo(state, unit.pos, nearestEnemy.pos, unit.id);
  const candidates = [...reachable(state.grid, state.units, unit.pos, unit.move).values()]
    .filter((node) => node.dist > 0)
    .map((node) => ({
      pos: node.pos,
      distance: pathDistanceTo(state, node.pos, nearestEnemy.pos, unit.id),
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
    : { kind: 'wait', unitId };
}

/**
 * The assassination target: run toward the nearest exit by shortest path, and
 * only shoot when no move that advances the escape exists.
 */
function decideFlee(state: GameState, unit: Unit): AiStep {
  const unitId = unit.id;
  if (!canAct(state, unit)) return { kind: 'wait', unitId };
  const objective = state.objective;
  const exits = objective?.kind === 'assassinate' ? objective.exits : [];
  if (exits.length === 0) return { kind: 'wait', unitId };

  const nearestExit = exits
    .map((e) => ({ exit: e, dist: pathDistance(state, unit.pos, e, unit.id) }))
    .sort((left, right) => left.dist - right.dist || left.exit.y - right.exit.y || left.exit.x - right.exit.x)[0]!;

  let best: Vec | null = null;
  let bestDist = nearestExit.dist;
  for (const node of reachable(state.grid, state.units, unit.pos, unit.move).values()) {
    if (node.dist === 0) continue;
    const dist = pathDistance(state, node.pos, nearestExit.exit, unit.id);
    if (dist < bestDist) {
      bestDist = dist;
      best = node.pos;
    }
  }
  if (best) return { kind: 'move', unitId, to: best };

  // No escape progress available: fall back to a retaliatory shot.
  const target = bestTarget(state, unit, livingUnits(state, 'squad'));
  if (target) return { kind: 'shoot', unitId, targetId: target.target.id };
  return { kind: 'wait', unitId };
}

/** The tile a squad unit should advance toward, by objective kind. */
function squadGoal(state: GameState, unit: Unit, objective: ScenarioObjective): Vec | null {
  switch (objective.kind) {
    case 'hold':
      return objective.tile;
    case 'recover': {
      if (state.carrierId) {
        // Item in hand: head for the nearest extraction tile.
        let best: Vec | null = null;
        let bestDist = Infinity;
        for (const e of objective.extraction) {
          const dist = pathDistance(state, unit.pos, e, unit.id);
          if (dist < bestDist) { bestDist = dist; best = e; }
        }
        return best;
      }
      return objective.tile;
    }
    case 'assassinate': {
      const target = state.units.find((u) => u.id === objective.targetId);
      return target && target.alive ? target.pos : null;
    }
    case 'clash':
      return null;
  }
}

/** Move one step-size toward `goal`, preferring directional cover from the nearest enemy. */
function objectiveMove(state: GameState, unit: Unit, goal: Vec): AiStep {
  const enemies = livingUnits(state, unit.team === 'alien' ? 'squad' : 'alien');
  const nearestEnemy = enemies.length
    ? [...enemies].sort((left, right) =>
        manhattan(unit.pos, left.pos) - manhattan(unit.pos, right.pos)
        || left.id.localeCompare(right.id),
      )[0]!
    : null;
  const currentDistance = pathDistanceTo(state, unit.pos, goal, unit.id);
  const candidates = [...reachable(state.grid, state.units, unit.pos, unit.move).values()]
    .filter((node) => node.dist > 0)
    .map((node) => ({
      pos: node.pos,
      distance: pathDistanceTo(state, node.pos, goal, unit.id),
      covered: nearestEnemy ? inCover(state.grid, node.pos, nearestEnemy.pos) : false,
    }))
    .filter((candidate) => candidate.distance < currentDistance)
    .sort((left, right) =>
      Number(right.covered) - Number(left.covered)
      || left.distance - right.distance
      || left.pos.y - right.pos.y
      || left.pos.x - right.pos.x,
    );
  return candidates[0]
    ? { kind: 'move', unitId: unit.id, to: candidates[0].pos }
    : { kind: 'wait', unitId: unit.id };
}

/** Objective-aware squad policy used by the headless balance harness. */
export function squadPolicy(state: GameState, unitId: string): AiStep {
  const unit = unitById(state, unitId);
  const enemies = livingUnits(state, unit.team === 'alien' ? 'squad' : 'alien');
  if (!canAct(state, unit)) return { kind: 'wait', unitId };

  const objective = state.objective;

  // Clash (and no objective): pure combat, team-neutral.
  if (!objective || objective.kind === 'clash') return advanceSmart(state, unitId);

  // Any objective type: shoot the lowest-HP legal target when one exists.
  const shot = lowestHpTarget(state, unit, enemies);
  if (shot) return { kind: 'shoot', unitId, targetId: shot.id };

  // Otherwise advance toward the objective goal (hold tile, recover pickup or
  // extraction, assassination interception).
  const goal = squadGoal(state, unit, objective);
  if (!goal) return { kind: 'wait', unitId };
  return objectiveMove(state, unit, goal);
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
