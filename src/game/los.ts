import { neighbors4, same, tileAt } from './map.ts';
import type { Grid, Vec } from './types.ts';

/** Bresenham line from a to b, inclusive of both ends. */
export function line(a: Vec, b: Vec): Vec[] {
  const points: Vec[] = [];
  let x0 = a.x;
  let y0 = a.y;
  const dx = Math.abs(b.x - x0);
  const dy = -Math.abs(b.y - y0);
  const sx = x0 < b.x ? 1 : -1;
  const sy = y0 < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    points.push({ x: x0, y: y0 });
    if (x0 === b.x && y0 === b.y) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return points;
}

/** True if no wall sits strictly between a and b. Cover does not block sight. */
export function hasLineOfSight(grid: Grid, a: Vec, b: Vec): boolean {
  const pts = line(a, b);
  for (let i = 1; i < pts.length - 1; i++) {
    if (tileAt(grid, pts[i]!) === 'wall') return false;
  }
  return true;
}

/**
 * A target is in cover from a shooter when a cover tile is adjacent to the
 * target on the shooter's side (the cover lies between them, roughly).
 */
export function inCover(grid: Grid, target: Vec, shooter: Vec): boolean {
  if (same(target, shooter)) return false;
  const toShooter = { x: shooter.x - target.x, y: shooter.y - target.y };
  for (const n of neighbors4(target)) {
    if (tileAt(grid, n) !== 'cover') continue;
    const d = { x: n.x - target.x, y: n.y - target.y };
    const dot = d.x * toShooter.x + d.y * toShooter.y;
    if (dot > 0) return true;
  }
  return false;
}
