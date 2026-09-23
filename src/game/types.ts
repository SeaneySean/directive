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
   * and used by reinforcements) is today's move-toward-the-enemy behaviour.
   */
  stance?: 'hold' | 'advance';
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
}

export interface ScenarioObjective {
  tile: Vec;
  holdRounds: number;
}

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
