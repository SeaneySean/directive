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
}

export interface Scenario {
  name: string;
  rows: string[];
  units: Unit[];
}
