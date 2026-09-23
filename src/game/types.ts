// Pure game types. Nothing in src/game/ may import Phaser.

export type Team = 'squad' | 'alien';

export interface Vec {
  x: number;
  y: number;
}

export type TileKind = 'floor' | 'wall' | 'cover';

export interface Grid {
  width: number;
  height: number;
  /** Row-major: tiles[y * width + x] */
  tiles: TileKind[];
}

export interface Weapon {
  name: string;
  /** Max shooting distance in tiles (Chebyshev). */
  range: number;
  /** Base hit chance in percent at point blank. */
  accuracy: number;
  damage: number;
}

export interface Unit {
  id: string;
  name: string;
  team: Team;
  pos: Vec;
  hp: number;
  maxHp: number;
  ap: number;
  maxAp: number;
  /** Tiles a unit may walk per move action (one AP). */
  move: number;
  weapon: Weapon;
  alive: boolean;
  /**
   * Guard behaviour. 'hold' (defenders) shoots whenever a legal shot exists
   * and only repositions to a nearby covered firing spot; 'advance' (default,
   * and used by reinforcements) is today's move-toward-the-enemy behaviour;
   * 'smart' is the team-neutral combat policy (lowest-HP shot, then close
   * distance preferring cover); 'flee' runs toward the nearest exit and only
   * shoots when it cannot move (the assassination target).
   */
  stance?: 'hold' | 'advance' | 'smart' | 'flee';
}

export type Outcome = 'playing' | 'won' | 'lost';

export interface LogEntry {
  round: number;
  text: string;
}

export interface GameState {
  grid: Grid;
  units: Unit[];
  turn: Team;
  round: number;
  selectedId: string | null;
  /** Deterministic RNG state. Advances on every roll. */
  seed: number;
  log: LogEntry[];
  outcome: Outcome;
  objective?: ScenarioObjective;
  objectiveHoldRounds: number;
  /** Deep copy of the scenario's reinforcement schedule, or undefined. */
  reinforcements?: Reinforcements;
  /** Total reinforcements successfully spawned so far (not the number alive). */
  reinforcementsSpawned: number;
  /** Living unit id carrying the recovered item, or null when not carried. */
  carrierId: string | null;
}

export type ObjectiveKind = 'hold' | 'recover' | 'assassinate' | 'clash';

/** The three generated-mission kinds, shared by the map generator and campaign. */
export type MissionType = 'recover' | 'assassinate' | 'clash';

/**
 * A mission objective, discriminated by `kind`.
 * - `hold`: stand on `tile` for `holdRounds` consecutive squad turns (story missions).
 * - `recover`: end a squad turn on `tile` to pick up the item, then end a squad
 *   turn on an `extraction` tile with the living carrier. Kill-all does not win.
 * - `assassinate`: win when `targetId` dies (or kill-all); lose when that unit
 *   ends an alien turn on an `exits` tile.
 * - `clash`: no tile; win by kill-all.
 */
export type ScenarioObjective =
  | { kind: 'hold'; tile: Vec; holdRounds: number }
  | { kind: 'recover'; tile: Vec; extraction: Vec[] }
  | { kind: 'assassinate'; targetId: string; exits: Vec[] }
  | { kind: 'clash' };

export interface Reinforcements {
  fromRound: number;
  every: number;
  max: number;
  spawns: Vec[];
  unit: Omit<Unit, 'id' | 'pos'>;
}

export interface Scenario {
  name: string;
  rows: string[];
  units: Unit[];
  objective?: ScenarioObjective;
  reinforcements?: Reinforcements;
}
