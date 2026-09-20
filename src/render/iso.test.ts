import { describe, expect, test } from 'bun:test';
import { gridToScreen, screenToGrid, tileDepth, TILE_H, TILE_W } from './iso.ts';

const origin = { x: 490, y: 78 };

describe('isometric projection', () => {
  test('uses a two-to-one diamond', () => {
    expect(TILE_W).toBe(TILE_H * 2);
  });

  test('round-trips every tile centre on the battle map', () => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const tile = { x, y };
        expect(screenToGrid(gridToScreen(tile, origin), origin)).toEqual(tile);
      }
    }
  });

  test('resolves points across neighbouring diamonds', () => {
    const centre = gridToScreen({ x: 4, y: 7 }, origin);
    expect(screenToGrid({ x: centre.x + TILE_W / 4, y: centre.y }, origin)).toEqual({ x: 4, y: 7 });
    expect(screenToGrid({ x: centre.x + TILE_W / 2, y: centre.y + TILE_H / 2 }, origin)).toEqual({ x: 5, y: 7 });
  });

  test('draws later diagonals above earlier diagonals', () => {
    expect(tileDepth({ x: 5, y: 5 })).toBeGreaterThan(tileDepth({ x: 4, y: 5 }));
  });
});
