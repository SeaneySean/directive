import type { Grid, TileKind, Vec } from './types.ts';

const LEGEND: Record<string, TileKind> = {
  '.': 'floor',
  '#': 'wall',
  'c': 'cover',
};

/** Build a grid from ASCII rows. '.' floor, '#' wall, 'c' cover. */
export function parseMap(rows: string[]): Grid {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const tiles: TileKind[] = [];
  for (const row of rows) {
    if (row.length !== width) throw new Error('map rows must be equal length');
    for (const ch of row) {
      const kind = LEGEND[ch];
      if (!kind) throw new Error(`unknown map char '${ch}'`);
      tiles.push(kind);
    }
  }
  return { width, height, tiles };
}

export function inBounds(grid: Grid, p: Vec): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < grid.width && p.y < grid.height;
}

/** Out-of-bounds reads as wall so callers never need a bounds check. */
export function tileAt(grid: Grid, p: Vec): TileKind {
  if (!inBounds(grid, p)) return 'wall';
  return grid.tiles[p.y * grid.width + p.x]!;
}

export function isWalkable(grid: Grid, p: Vec): boolean {
  return tileAt(grid, p) === 'floor';
}

export function key(p: Vec): string {
  return `${p.x},${p.y}`;
}

export function same(a: Vec, b: Vec): boolean {
  return a.x === b.x && a.y === b.y;
}

export function neighbors4(p: Vec): Vec[] {
  return [
    { x: p.x + 1, y: p.y },
    { x: p.x - 1, y: p.y },
    { x: p.x, y: p.y + 1 },
    { x: p.x, y: p.y - 1 },
  ];
}

/** Chebyshev distance: what weapon range is measured in. */
export function distance(a: Vec, b: Vec): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function manhattan(a: Vec, b: Vec): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
