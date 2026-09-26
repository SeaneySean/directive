import { nextRandom } from './rng.ts';
import type { InfluencePath } from './strategy/types.ts';
import type {
  DistrictMetadata,
  MissionType,
  Reinforcements,
  Scenario,
  ScenarioObjective,
  SurfaceTag,
  Unit,
  Vec,
  Weapon,
} from './types.ts';

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

/** The assassination target: one 3-tile move per turn, guard statistics. */
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

/**
 * A contiguous (adjacent-x) run of `run` tiles from an x-ascending row, nearest
 * `centreX`. Deterministic: ties resolved toward the smaller x. The squad spawns
 * as one such run so the opening view is centred and no soldier starts off-screen.
 */
function closestRunOf(sortedRow: Vec[], run: number, centreX: number): Vec[] {
  let bestStart = -1;
  let bestDist = Infinity;
  for (let s = 0; s + run <= sortedRow.length; s++) {
    let contiguous = true;
    for (let i = 1; i < run; i++) {
      if (sortedRow[s + i]!.x !== sortedRow[s + i - 1]!.x + 1) {
        contiguous = false;
        break;
      }
    }
    if (!contiguous) continue;
    const midX = (sortedRow[s]!.x + sortedRow[s + run - 1]!.x) / 2;
    const dist = Math.abs(midX - centreX);
    if (dist < bestDist || (dist === bestDist && sortedRow[s]!.x < sortedRow[bestStart]!.x)) {
      bestDist = dist;
      bestStart = s;
    }
  }
  return bestStart < 0 ? [] : sortedRow.slice(bestStart, bestStart + run);
}

/** Road lanes at `spacing` intervals, plus both borders. Always 1-tile roads, never adjacent to a border. */
function roadLines(limit: number, spacing: number): number[] {
  const lines = new Set<number>([0, limit - 1]);
  // Stop short of the border so the final block keeps at least one sidewalk row.
  for (let p = spacing; p < limit - 2; p += spacing) lines.add(p);
  return [...lines].sort((a, b) => a - b);
}

/** A building footprint plus its recorded interior so units/objectives can use it. */
interface BuildingRec {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 1-tile floor doorways through the perimeter. */
  doorways: Vec[];
  /** Walkable interior tiles, excluding doorways. */
  floors: Vec[];
}

export function generateMission(type: MissionType, path: InfluencePath, seed: number): Scenario {
  const rng = makeRng((seed ^ PATH_SEED[path]) | 0);
  const randInt = (bound: number) => Math.floor(rng() * bound);

  const width = 36 + randInt(5);
  const height = 36 + randInt(5);

  // Collision grid ('.' floor, '#' wall, 'c' cover) and a parallel surface grid.
  const g: string[][] = Array.from({ length: height }, () => Array<string>(width).fill('.'));
  const srf: SurfaceTag[][] = Array.from({ length: height }, () => Array<SurfaceTag>(width).fill('pavement'));

  const cols = roadLines(width, 7 + randInt(3));
  const rows = roadLines(height, 7 + randInt(3));

  const isRoad = (x: number, y: number) => cols.includes(x) || rows.includes(y);

  // 1. Roads and pavements.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      srf[y]![x] = isRoad(x, y) ? 'road' : 'pavement';
    }
  }

  const buildings: BuildingRec[] = [];
  const plazas: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
  let keyBuilding: BuildingRec | undefined;

  function blockInterior(a: number, b: number): { lo: number; hi: number } | null {
    const lo = a + 1;
    const hi = b - 1;
    return lo <= hi ? { lo, hi } : null;
  }

  function placeBlock(x0: number, y0: number, x1: number, y1: number, isKey: boolean): void {
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    const isPlaza = !isKey && bw >= 3 && bh >= 3 && randInt(5) === 0;
    if (bw < 3 || bh < 3 || isPlaza) {
      // Too small for a building, or a plaza: open pavement/plaza block.
      if (isPlaza) {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) srf[y]![x] = 'plaza';
        plazas.push({ x0, y0, x1, y1 });
      }
      return;
    }

    // Leave at least one pavement sidewalk tile on every side of the building.
    const maxW = Math.min(6, bw - 2);
    const maxH = Math.min(5, bh - 2);
    if (maxW < 3 || maxH < 3) return; // cannot fit a building with sidewalk

    const footW = isKey ? maxW : 3 + randInt(maxW - 2);
    const footH = isKey ? maxH : 3 + randInt(maxH - 2);
    const bx = x0 + 1 + randInt(bw - 2 - footW + 1);
    const by = y0 + 1 + randInt(bh - 2 - footH + 1);

    for (let y = by; y < by + footH; y++) {
      for (let x = bx; x < bx + footW; x++) {
        const edge = y === by || y === by + footH - 1 || x === bx || x === bx + footW - 1;
        if (edge) g[y]![x] = '#';
        else srf[y]![x] = 'interior';
      }
    }

    // Doorways: one or two 1-tile gaps on non-corner perimeter edges.
    const perimeter: Vec[] = [];
    for (let x = bx + 1; x < bx + footW - 1; x++) {
      perimeter.push({ x, y: by }, { x, y: by + footH - 1 });
    }
    for (let y = by + 1; y < by + footH - 1; y++) {
      perimeter.push({ x: bx, y }, { x: bx + footW - 1, y });
    }
    const doorways = pickDistinct(perimeter, 1 + randInt(2), randInt);
    for (const d of doorways) {
      g[d.y]![d.x] = '.';
      srf[d.y]![d.x] = 'interior';
    }

    const floors: Vec[] = [];
    for (let y = by + 1; y < by + footH - 1; y++) {
      for (let x = bx + 1; x < bx + footW - 1; x++) {
        floors.push({ x, y });
      }
    }
    const rec: BuildingRec = { x: bx, y: by, w: footW, h: footH, doorways, floors };
    buildings.push(rec);
    if (isKey) keyBuilding = rec;
  }

  // 2. Find the "key" block nearest the deep far-third centre: it hosts the
  // assassination target / recover item, deep enough that a fleeing target has
  // runway to the far-edge exits yet still inside a building.
  const centreX = width / 2;
  const centreY = Math.max(2, Math.floor(height / 3) - 3);
  let keyBlock: { x0: number; y0: number; x1: number; y1: number } | null = null;
  let bestDist = Infinity;
  for (let ri = 0; ri + 1 < rows.length; ri++) {
    const yBand = blockInterior(rows[ri]!, rows[ri + 1]!);
    if (!yBand) continue;
    for (let ci = 0; ci + 1 < cols.length; ci++) {
      const xBand = blockInterior(cols[ci]!, cols[ci + 1]!);
      if (!xBand) continue;
      const cx = (xBand.lo + xBand.hi) / 2;
      const cy = (yBand.lo + yBand.hi) / 2;
      const d = (cx - centreX) * (cx - centreX) + (cy - centreY) * (cy - centreY);
      if (d < bestDist) {
        bestDist = d;
        keyBlock = { x0: xBand.lo, y0: yBand.lo, x1: xBand.hi, y1: yBand.hi };
      }
    }
  }

  // 3. Place blocks.
  for (let ri = 0; ri + 1 < rows.length; ri++) {
    const yBand = blockInterior(rows[ri]!, rows[ri + 1]!);
    if (!yBand) continue;
    for (let ci = 0; ci + 1 < cols.length; ci++) {
      const xBand = blockInterior(cols[ci]!, cols[ci + 1]!);
      if (!xBand) continue;
      const isKey = !!keyBlock && keyBlock.x0 === xBand.lo && keyBlock.y0 === yBand.lo;
      placeBlock(xBand.lo, yBand.lo, xBand.hi, yBand.hi, isKey);
    }
  }

  const inGrid = (p: Vec) => p.x >= 0 && p.y >= 0 && p.x < width && p.y < height;
  const walkable = (p: Vec) => inGrid(p) && g[p.y]![p.x] === '.';
  const floorsOf = (pred: (p: Vec) => boolean): Vec[] => {
    const out: Vec[] = [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (g[y]![x] === '.' && pred({ x, y })) out.push({ x, y });
    }
    return out;
  };

  const reserved = new Set<string>();
  const reserve = (p: Vec) => reserved.add(keyOf(p));

  // 3. Squad spawns on the near-edge pavement as a contiguous run of four tiles
  // nearest the horizontal centre (behind-props intent: cover is still stamped one
  // row north per spawn below).
  const squadY = rows[rows.length - 1]! - 1; // sidewalk just inside the south road
  const squadPool = [...floorsOf((p) => p.y === squadY && srf[p.y]![p.x] === 'pavement')].sort((a, b) => a.x - b.x);
  const cx = Math.floor(width / 2);
  // A contiguous run of four pavement tiles nearest the centre. Drawn via
  // pickDistinct over the run (not the whole pool) so the four RNG rolls are
  // still consumed and every downstream placement stays byte-identical.
  const squadPositions = pickDistinct(closestRunOf(squadPool, 4, cx), 4, randInt);
  if (squadPositions.length < 4) throw new Error(`no room for squad spawns (seed ${seed})`);
  for (const p of squadPositions) reserve(p);

  let objective: ScenarioObjective;
  let aliens: Unit[];
  let searchMarker: Vec = { x: Math.floor(width / 2), y: Math.max(1, Math.floor(height / 6)) };

  const farThird = Math.floor(height / 3);
  const farHalf = Math.floor(height / 2);

  if (type === 'recover') {
    const host = keyBuilding ?? buildings.find((b) => b.y < farThird);
    const item = host ? pickDistinct(host.floors, 1, randInt)[0]! : floorsOf((p) => p.y < farThird)[0]!;
    reserve(item);

    const guardPool = floorsOf((p) => p.y < farThird && !reserved.has(keyOf(p)));
    const guardPositions = pickDistinct(guardPool, 4, randInt);
    aliens = guardPositions.map((pos, i) => guard(`g${i + 1}`, pos.x, pos.y, 'hold'));
    objective = { kind: 'recover', tile: item, extraction: squadPositions.map((p) => ({ ...p })) };
    searchMarker = { ...item };
  } else if (type === 'assassinate') {
    // The target spawns on the deepest floor tile of the key building (deep in
    // the far third) with bodyguards beside it (Chebyshev 1), never on a doorway.
    if (!keyBuilding) throw new Error(`no host building for assassination (seed ${seed})`);
    const interior = keyBuilding.floors;
    const farFloors = interior.filter((f) => f.y < farThird);
    const target = [...(farFloors.length ? farFloors : interior)].sort((a, b) => b.y - a.y || b.x - a.x)[0]!;
    reserve(target);

    // Bodyguards hold the host building's doorways: distinct unoccupied floor
    // tiles Chebyshev-adjacent to a doorway tile (excluding the doorways
    // themselves); inside or outside the building is fine.
    const doorwayKeys = new Set(keyBuilding.doorways.map(keyOf));
    const guardPool: Vec[] = [];
    const seenGuards = new Set<string>();
    for (const d of keyBuilding.doorways) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const p = { x: d.x + dx, y: d.y + dy };
          const k = keyOf(p);
          if (seenGuards.has(k)) continue;
          seenGuards.add(k);
          if (!walkable(p) || doorwayKeys.has(k) || reserved.has(k)) continue;
          guardPool.push(p);
        }
      }
    }
    if (guardPool.length < 3) throw new Error(`no room for bodyguards beside the doorways (seed ${seed})`);
    const bodyguards = pickDistinct(guardPool, 3, randInt);
    for (const p of bodyguards) reserve(p);
    aliens = [
      fleeingTarget('t1', target.x, target.y),
      ...bodyguards.map((pos, i) => guard(`g${i + 1}`, pos.x, pos.y, 'hold')),
    ];
    // Exits: walkable tiles on the far (north) edge road.
    const exits = pickDistinct(floorsOf((p) => p.y === 0), 3, randInt);
    for (const e of exits) reserve(e);
    objective = { kind: 'assassinate', targetId: 't1', exits };
    searchMarker = { x: keyBuilding.x + Math.floor(keyBuilding.w / 2), y: keyBuilding.y + Math.floor(keyBuilding.h / 2) };
  } else {
    // Clash: four operatives across the far half, some inside buildings.
    const interiorPool = buildings.flatMap((b) => b.floors.filter((p) => p.y < farHalf));
    const restPool = floorsOf((p) => p.y < farHalf && srf[p.y]![p.x] !== 'road');
    const operatives = pickDistinct([...interiorPool, ...restPool.filter((p) => !interiorPool.some((q) => q.x === p.x && q.y === p.y))], 4, randInt);
    aliens = operatives.map((pos, i) => guard(`o${i + 1}`, pos.x, pos.y, 'smart'));
    objective = { kind: 'clash' };
    searchMarker = { x: Math.floor(width / 2), y: Math.max(1, Math.floor(farThird / 2)) };
  }

  for (const a of aliens) reserve(a.pos);

  // 4. Reinforcement spawns: far-edge road tiles (recover & assassinate only).
  let reinforcements: Reinforcements | undefined;
  if (type !== 'clash') {
    const spawns = pickDistinct(floorsOf((p) => p.y === 0 && srf[p.y]![p.x] === 'road' && !reserved.has(keyOf(p))), 5, randInt);
    for (const s of spawns) reserve(s);
    reinforcements = {
      fromRound: 6,
      every: 3,
      max: 2,
      spawns,
      unit: { name: 'Guard', team: 'alien', hp: GUARD_HP, maxHp: GUARD_HP, ap: 2, maxAp: 2, move: 4, weapon: GUARD_RIFLE, alive: true, stance: 'advance' },
    };
  }

  // 5. Cover props: squad cover line, plaza props, a few pavement singles.
  const forbiddenCover = new Set<string>(reserved);
  for (const b of buildings) {
    for (const d of b.doorways) {
      forbiddenCover.add(keyOf(d));
      for (const n of [{ x: d.x + 1, y: d.y }, { x: d.x - 1, y: d.y }, { x: d.x, y: d.y + 1 }, { x: d.x, y: d.y - 1 }]) {
        forbiddenCover.add(keyOf(n));
      }
    }
  }
  const coverTiles: Vec[] = [];
  const gapOk = (p: Vec, existing: Vec[]) => existing.every((c) => Math.max(Math.abs(c.x - p.x), Math.abs(c.y - p.y)) >= 4);
  const neighbours4 = (q: Vec): Vec[] => [
    { x: q.x + 1, y: q.y }, { x: q.x - 1, y: q.y }, { x: q.x, y: q.y + 1 }, { x: q.x, y: q.y - 1 },
  ];
  const isFloorTile = (q: Vec) => inGrid(q) && g[q.y]![q.x] === '.';
  /**
   * A cover prop may never enclose a floor tile: placing it must leave every
   * orthogonally adjacent floor tile with at least one other open floor
   * neighbour. Guarantees all floor tiles stay connected.
   */
  const safeToStamp = (p: Vec): boolean => {
    for (const n of neighbours4(p)) {
      if (!isFloorTile(n)) continue;
      let open = 0;
      for (const m of neighbours4(n)) {
        if (m.x === p.x && m.y === p.y) continue;
        if (isFloorTile(m)) open++;
      }
      if (open === 0) return false;
    }
    return true;
  };
  const stamp = (p: Vec): boolean => {
    if (!safeToStamp(p)) return false;
    g[p.y]![p.x] = 'c';
    coverTiles.push(p);
    return true;
  };

  // Squad prop line, directly north of each spawn (no gap: a contiguous line).
  for (const s of squadPositions) {
    const north = { x: s.x, y: s.y - 1 };
    if (walkable(north) && srf[north.y]![north.x] !== 'road' && !forbiddenCover.has(keyOf(north))) stamp(north);
  }

  // Plaza props: 2 to 4 single cover props inside each plaza, stamped safely.
  for (const plaza of plazas) {
    const tiles: Vec[] = [];
    for (let y = plaza.y0; y <= plaza.y1; y++) {
      for (let x = plaza.x0; x <= plaza.x1; x++) {
        if (!forbiddenCover.has(keyOf({ x, y }))) tiles.push({ x, y });
      }
    }
    const wanted = 2 + randInt(3);
    let placed = 0;
    for (const t of pickDistinct(tiles, tiles.length, randInt)) {
      if (placed >= wanted) break;
      if (stamp(t)) placed++;
    }
  }

  // A few single pavement props, scattered with a gap so they read as props.
  const pavementTiles = floorsOf((p) => srf[p.y]![p.x] === 'pavement' && p.y < squadY - 1);
  const singles = pickDistinct(pavementTiles, 4 + randInt(5), randInt);
  for (const t of singles) {
    if (forbiddenCover.has(keyOf(t)) || !gapOk(t, coverTiles)) continue;
    stamp(t);
  }

  const rowsOut = g.map((row) => row.join(''));
  const surfaces: SurfaceTag[] = srf.flat();

  const district: DistrictMetadata = {
    surfaces,
    buildings: buildings.map((b, i) => ({
      id: i + 1,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      doorways: b.doorways.map((d) => ({ ...d })),
    })),
    searchMarker,
  };

  return {
    name: type === 'recover' ? 'Recover Technology' : type === 'assassinate' ? 'Assassination' : 'Rival Cabal',
    rows: rowsOut,
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
    district,
  };
}