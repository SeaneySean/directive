export const TILE_W = 60;
export const TILE_H = 30;

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface GridPoint {
  x: number;
  y: number;
}

/** Project a grid coordinate to the centre of its isometric floor diamond. */
export function gridToScreen(point: GridPoint, origin: ScreenPoint): ScreenPoint {
  return {
    x: origin.x + (point.x - point.y) * (TILE_W / 2),
    y: origin.y + (point.x + point.y) * (TILE_H / 2),
  };
}

/** Resolve a screen point to the isometric diamond beneath it. */
export function screenToGrid(point: ScreenPoint, origin: ScreenPoint): GridPoint | null {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const x = Math.round(dx / TILE_W + dy / TILE_H);
  const y = Math.round(dy / TILE_H - dx / TILE_W);
  const centre = gridToScreen({ x, y }, origin);
  const inside = Math.abs(point.x - centre.x) / (TILE_W / 2) + Math.abs(point.y - centre.y) / (TILE_H / 2) <= 1;
  return inside ? { x, y } : null;
}

export function tileDepth(point: GridPoint, layer = 0): number {
  return (point.x + point.y) * 10 + point.x / 100 + layer;
}
