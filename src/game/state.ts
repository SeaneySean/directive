import { previewShot } from './combat.ts';
import { inBounds, isWalkable, parseMap, same } from './map.ts';
import { reachable } from './pathfinding.ts';
import { rollPercent } from './rng.ts';
import type { GameState, Reinforcements, Scenario, Team, Unit, Vec } from './types.ts';

// All functions here are pure: they take a state and return a new one.

export function createGame(scenario: Scenario, seed = 1): GameState {
  const reinforcements: Reinforcements | undefined = scenario.reinforcements
    ? {
        fromRound: scenario.reinforcements.fromRound,
        every: scenario.reinforcements.every,
        max: scenario.reinforcements.max,
        spawns: scenario.reinforcements.spawns.map((s) => ({ ...s })),
        unit: { ...scenario.reinforcements.unit, weapon: { ...scenario.reinforcements.unit.weapon } },
      }
    : undefined;
  return {
    grid: parseMap(scenario.rows),
    units: scenario.units.map((u) => ({ ...u, pos: { ...u.pos }, weapon: { ...u.weapon } })),
    turn: 'squad',
    round: 1,
    selectedId: null,
    seed,
    log: [{ round: 1, text: `Mission: ${scenario.name}` }],
    outcome: 'playing',
    objective: scenario.objective
      ? { tile: { ...scenario.objective.tile }, holdRounds: scenario.objective.holdRounds }
      : undefined,
    objectiveHoldRounds: 0,
    reinforcements,
    reinforcementsSpawned: 0,
  };
}

export function unitById(state: GameState, id: string): Unit {
  const u = state.units.find((x) => x.id === id);
  if (!u) throw new Error(`no unit ${id}`);
  return u;
}

export function unitAt(state: GameState, p: Vec): Unit | undefined {
  return state.units.find((u) => u.alive && same(u.pos, p));
}

export function livingUnits(state: GameState, team: Team): Unit[] {
  return state.units.filter((u) => u.alive && u.team === team);
}

export function selectedUnit(state: GameState): Unit | null {
  return state.selectedId ? unitById(state, state.selectedId) : null;
}

/** A unit may act when it is alive, on the active team, and has AP. */
export function canAct(state: GameState, unit: Unit): boolean {
  return state.outcome === 'playing' && unit.alive && unit.team === state.turn && unit.ap > 0;
}

export function selectUnit(state: GameState, id: string | null): GameState {
  if (id !== null) {
    const u = unitById(state, id);
    if (!u.alive || u.team !== state.turn) return state;
  }
  return { ...state, selectedId: id };
}

function log(state: GameState, text: string): GameState {
  return { ...state, log: [...state.log, { round: state.round, text }] };
}

function replaceUnit(state: GameState, unit: Unit): GameState {
  return { ...state, units: state.units.map((u) => (u.id === unit.id ? unit : u)) };
}

/** Move costs one AP and may cover up to unit.move tiles. */
export function moveUnit(state: GameState, unitId: string, to: Vec): GameState {
  const unit = unitById(state, unitId);
  if (!canAct(state, unit)) return state;
  const reach = reachable(state.grid, state.units, unit.pos, unit.move);
  const node = reach.get(`${to.x},${to.y}`);
  if (!node || node.dist === 0) return state;
  const moved = { ...unit, pos: { ...to }, ap: unit.ap - 1 };
  return replaceUnit(state, moved);
}

export interface ShotResult {
  state: GameState;
  hit: boolean;
  chance: number;
  roll: number;
  damage: number;
  killed: boolean;
}

/** Shoot costs one AP. Returns null if the shot is not allowed. */
export function shoot(state: GameState, attackerId: string, targetId: string): ShotResult | null {
  const attacker = unitById(state, attackerId);
  const target = unitById(state, targetId);
  if (!canAct(state, attacker)) return null;
  const preview = previewShot(state.grid, attacker, target);
  if (!preview) return null;

  const { roll, seed } = rollPercent(state.seed);
  const hit = roll <= preview.chance;
  const damage = hit ? attacker.weapon.damage : 0;
  const hp = Math.max(0, target.hp - damage);
  const killed = hit && hp === 0;

  let next: GameState = { ...state, seed };
  next = replaceUnit(next, { ...attacker, ap: attacker.ap - 1 });
  next = replaceUnit(next, { ...target, hp, alive: !killed && target.alive });
  const verb = killed ? 'kills' : hit ? `hits for ${damage}` : 'misses';
  next = log(next, `${attacker.name} ${verb} ${target.name} (${preview.chance}%)`);
  next = checkOutcome(next);
  return { state: next, hit, chance: preview.chance, roll, damage, killed };
}

export function checkOutcome(state: GameState): GameState {
  if (state.outcome !== 'playing') return state;
  if (livingUnits(state, 'alien').length === 0) return log({ ...state, outcome: 'won' }, 'Area secured.');
  if (livingUnits(state, 'squad').length === 0) return log({ ...state, outcome: 'lost' }, 'Squad lost.');
  return state;
}

/** Hand the turn to the other team and refill their AP. */
export function endTurn(state: GameState): GameState {
  if (state.outcome !== 'playing') return state;
  if (state.turn === 'squad' && state.objective) {
    const holding = livingUnits(state, 'squad').some((unit) => same(unit.pos, state.objective!.tile));
    const objectiveHoldRounds = holding ? state.objectiveHoldRounds + 1 : 0;
    if (objectiveHoldRounds >= state.objective.holdRounds) {
      return log({ ...state, objectiveHoldRounds, outcome: 'won' }, 'Objective secured.');
    }
    state = { ...state, objectiveHoldRounds };
  }
  const nextTeam: Team = state.turn === 'squad' ? 'alien' : 'squad';
  const round = nextTeam === 'squad' ? state.round + 1 : state.round;
  const units = state.units.map((u) => (u.team === nextTeam && u.alive ? { ...u, ap: u.maxAp } : u));
  let next: GameState = { ...state, units, turn: nextTeam, round, selectedId: null };
  // Reinforcements arrive on the squad-to-alien transition at a scheduled round.
  if (nextTeam === 'alien') next = maybeSpawnReinforcement(next);
  return log(next, nextTeam === 'squad' ? `Round ${round}: your move.` : 'Enemy turn.');
}

/** True when the alien turn beginning at `round` is a scheduled arrival. */
function isReinforcementRound(state: GameState, round: number): boolean {
  const r = state.reinforcements;
  if (!r) return false;
  if (round < r.fromRound) return false;
  if ((round - r.fromRound) % r.every !== 0) return false;
  return state.reinforcementsSpawned < r.max;
}

/** First in-bounds walkable spawn tile unoccupied by a living unit, or null. */
function freeSpawnTile(state: GameState): Vec | null {
  const spawns = state.reinforcements!.spawns;
  for (const tile of spawns) {
    if (!inBounds(state.grid, tile)) continue;
    if (!isWalkable(state.grid, tile)) continue;
    if (state.units.some((unit) => unit.alive && same(unit.pos, tile))) continue;
    return { ...tile };
  }
  return null;
}

function maybeSpawnReinforcement(state: GameState): GameState {
  if (!isReinforcementRound(state, state.round)) return state;
  const tile = freeSpawnTile(state);
  // All spawns blocked: skip this arrival without consuming cap or id; the next
  // scheduled round retries with no backlog.
  if (!tile) return state;
  const template = state.reinforcements!.unit;
  const id = `r${state.reinforcementsSpawned + 1}`;
  const unit: Unit = { ...template, id, pos: tile, ap: template.maxAp };
  return log(
    { ...state, units: [...state.units, unit], reinforcementsSpawned: state.reinforcementsSpawned + 1 },
    'Alarm: reinforcements arrive.',
  );
}
