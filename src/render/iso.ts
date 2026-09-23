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

export interface TileLayout {
  tileW: number;
  tileH: number;
  origin: ScreenPoint;
}

/** The classic 16x16 Farmstead board keeps its hand-tuned origin. */
const CLASSIC_ORIGIN: ScreenPoint = { x: 490, y: 78 };

/**
 * Derive the tile dimensions and per-board origin for a WxH grid. The 16x16
 * Farmstead keeps the 60x30 tiles and its existing origin; enlarged missions
 * auto-fit so the diamond is centred in the board area with headroom for
 * raised terrain and ~1.6-tile-tall unit sprites.
 */
export function boardLayout(width: number, height: number, areaW = 1000, areaH = 720): TileLayout {
  if (width === 16 && height === 16) {
    return { tileW: TILE_W, tileH: TILE_H, origin: { ...CLASSIC_ORIGIN } };
  }
  const tileW = 2 * Math.floor(Math.min((920 / (width + height)) * 2, 60) / 2);
  const tileH = tileW / 2;
  const spanX = (width + height - 2) * (tileW / 2) + tileW;
  const spanY = (width + height - 2) * (tileH / 2) + tileH;
  const origin: ScreenPoint = {
    x: (areaW - spanX) / 2 + (height - 1) * (tileW / 2) + tileW / 2,
    y: (areaH - spanY) / 2 + tileH / 2,
  };
  return { tileW, tileH, origin };
}

/** Project a grid coordinate to the centre of its isometric floor diamond. */
export function gridToScreen(point: GridPoint, origin: ScreenPoint, tileW = TILE_W, tileH = TILE_H): ScreenPoint {
  return {
    x: origin.x + (point.x - point.y) * (tileW / 2),
    y: origin.y + (point.x + point.y) * (tileH / 2),
  };
}

/** Resolve a screen point to the isometric diamond beneath it. */
export function screenToGrid(point: ScreenPoint, origin: ScreenPoint, tileW = TILE_W, tileH = TILE_H): GridPoint | null {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const x = Math.round(dx / tileW + dy / tileH);
  const y = Math.round(dy / tileH - dx / tileW);
  const centre = gridToScreen({ x, y }, origin, tileW, tileH);
  const inside = Math.abs(point.x - centre.x) / (tileW / 2) + Math.abs(point.y - centre.y) / (tileH / 2) <= 1;
  return inside ? { x, y } : null;
}

export function tileDepth(point: GridPoint, layer = 0): number {
  return (point.x + point.y) * 10 + point.x / 100 + layer;
}
