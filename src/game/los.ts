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
 * target and lies within 60 degrees of the direction to the shooter: with `d`
 * the unit vector from target to the cover tile and `s` the unit vector from
 * target to the shooter, cover counts only when `d . s >= 0.5`.
 */
export function inCover(grid: Grid, target: Vec, shooter: Vec): boolean {
  if (same(target, shooter)) return false;
  const toShooter = { x: shooter.x - target.x, y: shooter.y - target.y };
  const shooterLen = Math.hypot(toShooter.x, toShooter.y);
  if (shooterLen === 0) return false;
  const s = { x: toShooter.x / shooterLen, y: toShooter.y / shooterLen };
  for (const n of neighbors4(target)) {
    if (tileAt(grid, n) !== 'cover') continue;
    // Cardinal adjacency: d is already a unit vector.
    const d = { x: n.x - target.x, y: n.y - target.y };
    const dot = d.x * s.x + d.y * s.y;
    if (dot >= 0.5) return true;
  }
  return false;
}
