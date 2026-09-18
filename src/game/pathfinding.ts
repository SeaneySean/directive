import { isWalkable, key, neighbors4 } from './map.ts';
import type { Grid, Unit, Vec } from './types.ts';

export interface ReachNode {
  pos: Vec;
  dist: number;
  prev: string | null;
}

/** Map from tile key to node, for every tile reachable within maxSteps. */
export type Reach = Map<string, ReachNode>;

/**
 * Breadth-first reach within maxSteps, 4-directional. Living units block
 * movement, but the origin is always included (dist 0).
 */
export function reachable(grid: Grid, units: Unit[], from: Vec, maxSteps: number): Reach {
  const blocked = new Set<string>();
  for (const u of units) if (u.alive) blocked.add(key(u.pos));

  const reach: Reach = new Map();
  const start = key(from);
  reach.set(start, { pos: from, dist: 0, prev: null });
  const queue: Vec[] = [from];

  while (queue.length) {
    const cur = queue.shift()!;
    const curKey = key(cur);
    const curDist = reach.get(curKey)!.dist;
    if (curDist >= maxSteps) continue;
    for (const n of neighbors4(cur)) {
      const k = key(n);
      if (reach.has(k)) continue;
      if (!isWalkable(grid, n) || blocked.has(k)) continue;
      reach.set(k, { pos: n, dist: curDist + 1, prev: curKey });
      queue.push(n);
    }
  }
  reach.delete(start);
  reach.set(start, { pos: from, dist: 0, prev: null });
  return reach;
}

/** Tile sequence from origin (exclusive) to target (inclusive), or null. */
export function pathTo(reach: Reach, target: Vec): Vec[] | null {
  let k: string | null = key(target);
  if (!reach.has(k)) return null;
  const path: Vec[] = [];
  while (k) {
    const node: ReachNode = reach.get(k)!;
    if (node.prev === null) break;
    path.push(node.pos);
    k = node.prev;
  }
  return path.reverse();
}
