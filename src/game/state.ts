import { previewShot } from './combat.ts';
import { inBounds, isWalkable, parseMap, same } from './map.ts';
import { reachable } from './pathfinding.ts';
import { rollPercent } from './rng.ts';
import type { GameState, Reinforcements, Scenario, ScenarioObjective, Team, Unit, Vec } from './types.ts';

// All functions here are pure: they take a state and return a new one.

/** Deep copy an objective so games never share mutable objective fields. */
function cloneObjective(objective: ScenarioObjective): ScenarioObjective {
  switch (objective.kind) {
    case 'hold':
      return { kind: 'hold', tile: { ...objective.tile }, holdRounds: objective.holdRounds };
    case 'recover':
      return { kind: 'recover', tile: { ...objective.tile }, extraction: objective.extraction.map((e) => ({ ...e })) };
    case 'assassinate':
      return { kind: 'assassinate', targetId: objective.targetId, exits: objective.exits.map((e) => ({ ...e })) };
    case 'clash':
      return { kind: 'clash' };
  }
}

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
    objective: scenario.objective ? cloneObjective(scenario.objective) : undefined,
    objectiveHoldRounds: 0,
    reinforcements,
    reinforcementsSpawned: 0,
    carrierId: null,
    killsBy: {},
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
  if (killed) {
    // A living hostile died: credit the killing blow to the attacker.
    next = { ...next, killsBy: { ...next.killsBy, [attacker.id]: (next.killsBy[attacker.id] ?? 0) + 1 } };
  }
  const verb = killed ? 'kills' : hit ? `hits for ${damage}` : 'misses';
  next = log(next, `${attacker.name} ${verb} ${target.name} (${preview.chance}%)`);
  if (killed && next.carrierId === targetId) {
    // The carrier dropped the item where it fell; any squad unit may reclaim it.
    next = { ...next, carrierId: null };
    if (next.objective?.kind === 'recover') {
      next = { ...next, objective: { ...next.objective, tile: { ...target.pos } } };
      next = log(next, 'The item drops where the carrier fell.');
    }
  }
  next = checkOutcome(next);
  return { state: next, hit, chance: preview.chance, roll, damage, killed };
}

export function checkOutcome(state: GameState): GameState {
  if (state.outcome !== 'playing') return state;

  // Assassination: the target falling ends the mission immediately, even with
  // other hostiles still on the field.
  if (state.objective?.kind === 'assassinate') {
    const targetId = state.objective.targetId;
    const target = state.units.find((u) => u.id === targetId);
    if (target && !target.alive) return log({ ...state, outcome: 'won' }, 'Target down.');
  }

  if (livingUnits(state, 'squad').length === 0) return log({ ...state, outcome: 'lost' }, 'Squad lost.');

  // Recover: killing every enemy does not win; play continues until extraction.
  if (state.objective?.kind === 'recover') return state;

  if (livingUnits(state, 'alien').length === 0) return log({ ...state, outcome: 'won' }, 'Area secured.');
  return state;
}

/**
 * Hostile ends an alien turn on an assassination exit: the target slipped away.
 * Runs at the end of the alien turn (before handing control back to the squad).
 */
function targetEscaped(state: GameState): boolean {
  const objective = state.objective;
  if (!objective || objective.kind !== 'assassinate') return false;
  const target = state.units.find((u) => u.id === objective.targetId);
  if (!target || !target.alive) return false;
  return objective.exits.some((e) => same(e, target.pos));
}

/** Living squad unit acting as the recover carrier, or undefined. */
function carrier(state: GameState): Unit | undefined {
  if (!state.carrierId) return undefined;
  return state.units.find((u) => u.id === state.carrierId && u.alive);
}

/** Handle objective rules that resolve when the squad ends its turn. */
function resolveSquadObjective(state: GameState): GameState {
  const objective = state.objective;
  if (!objective) return state;

  if (objective.kind === 'hold') {
    const holding = livingUnits(state, 'squad').some((unit) => same(unit.pos, objective.tile));
    const objectiveHoldRounds = holding ? state.objectiveHoldRounds + 1 : 0;
    if (objectiveHoldRounds >= objective.holdRounds) {
      return log({ ...state, objectiveHoldRounds, outcome: 'won' }, 'Objective secured.');
    }
    return { ...state, objectiveHoldRounds };
  }

  if (objective.kind === 'recover') {
    const holder = carrier(state);
    if (holder) {
      // Held: win when the living carrier ends a squad turn on an extraction tile.
      if (objective.extraction.some((e) => same(e, holder.pos))) {
        return log({ ...state, outcome: 'won' }, 'Item extracted.');
      }
      return state;
    }
    // On the ground: a living squad unit ending its turn on the item picks it up.
    const picker = livingUnits(state, 'squad').find((u) => same(u.pos, objective.tile));
    if (!picker) return state;
    const next = log({ ...state, carrierId: picker.id }, `${picker.name} recovers the item.`);
    // Pickup on an extraction tile is not possible (item sits on the far third),
    // but if it were, extraction is only evaluated on a later turn.
    return next;
  }

  // assassinate and clash need no squad-end-of-turn objective logic.
  return state;
}

/** Hand the turn to the other team and refill their AP. */
export function endTurn(state: GameState): GameState {
  if (state.outcome !== 'playing') return state;

  if (state.turn === 'squad' && state.objective) {
    state = resolveSquadObjective(state);
    if (state.outcome !== 'playing') return state;
  }

  if (state.turn === 'alien' && targetEscaped(state)) {
    return log({ ...state, outcome: 'lost' }, 'Target escaped.');
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
