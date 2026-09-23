import { nextRandom } from './rng.ts';
import type { InfluencePath } from './strategy/types.ts';
import type { MissionType, Reinforcements, Scenario, ScenarioObjective, Unit, Vec, Weapon } from './types.ts';

export type { MissionType };

const RIFLE: Weapon = { name: 'Rifle', range: 8, accuracy: 75, damage: 4 };
const SHOTGUN: Weapon = { name: 'Shotgun', range: 4, accuracy: 90, damage: 6 };
const GUARD_RIFLE: Weapon = { name: 'Rifle', range: 7, accuracy: 60, damage: 4 };
const GUARD_HP = 14;

/** Path mixes into the seeding so each (type, path) pair maps differently. */
const PATH_SEED: Record<InfluencePath, number> = { subvert: 0, force: 0x9e3779b9, enlighten: 0x517cc1b7 };

function makeRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    const r = nextRandom(s);
    s = r.seed;
    return r.value;
  };
}

function soldier(id: string, name: string, x: number, y: number, weapon: Weapon): Unit {
  return { id, name, team: 'squad', pos: { x, y }, hp: 12, maxHp: 12, ap: 2, maxAp: 2, move: 4, weapon, alive: true };
}

function guard(id: string, x: number, y: number, stance: 'hold' | 'advance' | 'smart' | 'flee'): Unit {
  return {
    id,
    name: 'Guard',
    team: 'alien',
    pos: { x, y },
    hp: GUARD_HP,
    maxHp: GUARD_HP,
    ap: 2,
    maxAp: 2,
    move: 4,
    weapon: GUARD_RIFLE,
    alive: true,
    stance,
  };
}

/**
 * The marked assassination target flees one cautious move per turn rather than
 * spending both actions: a panicked, non-combatant VIP, not a fighting guard.
 * One 3-tile move per turn keeps its escape slow enough that a determined squad
 * can still run it down before a mid-map exit. Otherwise it keeps guard
 * statistics (HP, rifle, art).
 */
function fleeingTarget(id: string, x: number, y: number): Unit {
  const unit = guard(id, x, y, 'flee');
  unit.ap = 1;
  unit.maxAp = 1;
  unit.move = 3;
  return unit;
}

function keyOf(p: Vec): string {
  return `${p.x},${p.y}`;
}

/** Every floor cell within the given inclusive bounds. */
function floorTiles(grid: string[][], minY: number, maxY: number, minX: number, maxX: number): Vec[] {
  const out: Vec[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (grid[y]![x] === '.') out.push({ x, y });
    }
  }
  return out;
}

/** Draw `n` distinct tiles at random from `pool`. Deterministic for the RNG. */
function pickDistinct(pool: Vec[], n: number, randInt: (bound: number) => number): Vec[] {
  const remaining = [...pool];
  const out: Vec[] = [];
  for (let i = 0; i < n && remaining.length > 0; i++) {
    const idx = randInt(remaining.length);
    out.push(remaining[idx]!);
    remaining.splice(idx, 1);
  }
  return out;
}

const chebyshev = (a: Vec, b: Vec) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export function generateMission(type: MissionType, path: InfluencePath, seed: number): Scenario {
  const rng = makeRng((seed ^ PATH_SEED[path]) | 0);
  const randInt = (bound: number) => Math.floor(rng() * bound);

  const width = 18 + randInt(5);
  const height = 18 + randInt(5);
  const innerBottom = height - 2;
  const innerRight = width - 2;
  const northThirdMax = Math.max(2, Math.floor(innerBottom / 3));
  const northHalfMax = Math.floor(innerBottom / 2);

  // Interior grid; border walls come in the serialisation step below.
  const grid: string[][] = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => (x === 0 || y === 0 || x === innerRight + 1 || y === innerBottom + 1 ? '#' : '.')),
  );

  // At most two short, floating interior wall stubs. They never touch a border,
  // so they cannot disconnect the floor.
  const stubCount = randInt(3);
  for (let i = 0; i < stubCount; i++) {
    const horizontal = randInt(2) === 0;
    const len = 3 + randInt(2);
    if (horizontal) {
      const y = 3 + randInt(Math.max(1, height - 6));
      const x = 3 + randInt(Math.max(1, width - 5 - len));
      for (let k = 0; k < len && x + k < innerRight; k++) grid[y]![x + k] = '#';
    } else {
      const x = 3 + randInt(Math.max(1, width - 6));
      const y = 3 + randInt(Math.max(1, height - 5 - len));
      for (let k = 0; k < len && y + k < innerBottom; k++) grid[y + k]![x] = '#';
    }
  }

  // Squad spawns on the south inner row, spread around the horizontal centre.
  const cx = Math.floor(width / 2);
  const squadXs = [cx - 2, cx, cx + 1, cx + 3].map((x) => Math.min(innerRight, Math.max(1, x)));
  const squadY = innerBottom;
  const squadPositions = squadXs.map((x) => ({ x, y: squadY }));

  const used = new Set<string>(squadPositions.map(keyOf));

  // --- Objective, exits and enemy positions per type ---
  let objective: ScenarioObjective;
  let aliens: Unit[];

  if (type === 'recover') {
    // Item near the horizontal centre of the north third.
    const centreCandidates = floorTiles(grid, 2, northThirdMax, Math.max(1, cx - 4), Math.min(innerRight, cx + 4));
    const itemCandidates = centreCandidates.length
      ? centreCandidates
      : floorTiles(grid, 2, northThirdMax, 1, innerRight);
    const item = pickDistinct(itemCandidates, 1, randInt)[0]!;
    used.add(keyOf(item));

    const guardPool = floorTiles(grid, 1, northThirdMax, 1, innerRight).filter((p) => !used.has(keyOf(p)));
    const guardPositions = pickDistinct(guardPool, 4, randInt);
    aliens = guardPositions.map((pos, i) => guard(`g${i + 1}`, pos.x, pos.y, 'hold'));
    objective = { kind: 'recover', tile: item, extraction: squadPositions.map((p) => ({ ...p })) };
  } else if (type === 'assassinate') {
    const target = { x: cx, y: 1 };
    used.add(keyOf(target));
    const exitY = northHalfMax;
    const exits: Vec[] = [
      { x: 1, y: exitY },
      { x: innerRight, y: exitY },
    ];
    for (const e of exits) used.add(keyOf(e));

    const bodyguardPool = floorTiles(grid, 1, northThirdMax, 1, innerRight).filter((p) => !used.has(keyOf(p)));
    const bodyguards = pickDistinct(bodyguardPool, 3, randInt);
    aliens = [
      fleeingTarget('t1', target.x, target.y),
      ...bodyguards.map((pos, i) => guard(`g${i + 1}`, pos.x, pos.y, 'hold')),
    ];
    objective = { kind: 'assassinate', targetId: 't1', exits };
  } else {
    const operativePool = floorTiles(grid, 1, northHalfMax, 1, innerRight);
    const operatives = pickDistinct(operativePool, 4, randInt);
    aliens = operatives.map((pos, i) => guard(`o${i + 1}`, pos.x, pos.y, 'smart'));
    objective = { kind: 'clash' };
  }

  for (const a of aliens) used.add(keyOf(a.pos));

  // Reinforcement spawns are reserved northern floor tiles, kept clear of cover.
  let reinforcements: Reinforcements | undefined;
  if (type !== 'clash') {
    const spawnPool = floorTiles(grid, 1, Math.min(3, northThirdMax), 1, innerRight).filter((p) => !used.has(keyOf(p)));
    const spawns = pickDistinct(spawnPool, 5, randInt);
    for (const s of spawns) used.add(keyOf(s));
    reinforcements = {
      fromRound: 6,
      every: 3,
      max: 2,
      spawns,
      unit: { name: 'Guard', team: 'alien', hp: GUARD_HP, maxHp: GUARD_HP, ap: 2, maxAp: 2, move: 4, weapon: GUARD_RIFLE, alive: true, stance: 'advance' },
    };
  }

  // The squad cover line sits on the row directly north of the spawns, with
  // gaps at the neighbouring columns so a route north always remains.
  for (const pos of squadPositions) {
    grid[pos.y - 1]![pos.x] = 'c';
  }

  // Scattered cover clusters (6-10 of 1-3 tiles) above the cover line, never on
  // a special, spawn or reinforcement tile, and at least three floor tiles
  // apart from every other cluster.
  const clusterCount = 6 + randInt(5);
  const clusterTiles: Vec[] = [];
  const clusterRegion = (): Vec[] =>
    floorTiles(grid, 2, Math.max(3, height - 6), 1, innerRight)
      .filter((p) => !used.has(keyOf(p)) && !withinClusterGap(p, clusterTiles));

  const withinClusterGap = (p: Vec, existing: Vec[]) => existing.some((c) => chebyshev(p, c) <= 3);

  for (let i = 0; i < clusterCount; i++) {
    const region = clusterRegion();
    if (region.length === 0) continue;
    const anchor = region[randInt(region.length)]!;
    const cluster: Vec[] = [anchor];
    const size = 1 + randInt(3);
    const wanted = size;
    // Grow orthogonally into adjacent floor tiles that keep the cluster gap.
    let guardTries = 0;
    while (cluster.length < wanted && guardTries < 40) {
      guardTries++;
      const neighbours = cluster.flatMap((p) => [
        { x: p.x + 1, y: p.y },
        { x: p.x - 1, y: p.y },
        { x: p.x, y: p.y + 1 },
        { x: p.x, y: p.y - 1 },
      ]).filter((n) =>
        grid[n.y]?.[n.x] === '.'
        && !used.has(keyOf(n))
        && !cluster.some((c) => c.x === n.x && c.y === n.y)
        && !withinClusterGap(n, clusterTiles),
      );
      if (neighbours.length === 0) break;
      cluster.push(neighbours[randInt(neighbours.length)]!);
    }
    for (const c of cluster) {
      grid[c.y]![c.x] = 'c';
      clusterTiles.push(c);
    }
  }

  const rows = grid.map((row) => row.join(''));

  return {
    name:
      type === 'recover' ? 'Recover Technology'
      : type === 'assassinate' ? 'Assassination'
      : 'Rival Cabal',
    rows,
    units: [
      ...squadPositions.map((pos, i) => {
        const names = ['Cole', 'Diaz', 'Okafor', 'Reyes'];
        const weapons: Weapon[] = [RIFLE, RIFLE, SHOTGUN, RIFLE];
        return soldier(`s${i + 1}`, names[i]!, pos.x, pos.y, weapons[i]!);
      }),
      ...aliens,
    ],
    objective,
    reinforcements,
  };
}