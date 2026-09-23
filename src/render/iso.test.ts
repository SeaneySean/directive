import { describe, expect, test } from 'bun:test';
import { boardLayout, gridToScreen, screenToGrid, tileDepth, TILE_H, TILE_W } from './iso.ts';

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

describe('board auto-fit', () => {
  test('preserves 60x30 tiles and the classic origin for the 16x16 Farmstead', () => {
    const layout = boardLayout(16, 16);
    expect(layout.tileW).toBe(60);
    expect(layout.tileH).toBe(30);
    expect(layout.origin).toEqual({ x: 490, y: 78 });
  });

  test('fits a 20x20 board at 46x23 tiles', () => {
    const layout = boardLayout(20, 20);
    expect(layout.tileW).toBe(46);
    expect(layout.tileH).toBe(23);
  });

  test('fits a 22x22 board at 40x20 tiles', () => {
    const layout = boardLayout(22, 22);
    expect(layout.tileW).toBe(40);
    expect(layout.tileH).toBe(20);
  });

  test('round-trips every tile at all three sizes', () => {
    for (const size of [16, 20, 22]) {
      const { tileW, tileH, origin: o } = boardLayout(size, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const tile = { x, y };
          const screen = gridToScreen(tile, o, tileW, tileH);
          expect(screenToGrid(screen, o, tileW, tileH)).toEqual(tile);
        }
      }
    }
  });

  test('keeps every tile diamond inside the board area', () => {
    for (const size of [16, 20, 22]) {
      const { tileW, tileH, origin: o } = boardLayout(size, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const centre = gridToScreen({ x, y }, o, tileW, tileH);
          expect(centre.x - tileW / 2).toBeGreaterThanOrEqual(0);
          expect(centre.x + tileW / 2).toBeLessThanOrEqual(1000);
          expect(centre.y - tileH / 2).toBeGreaterThanOrEqual(0);
          expect(centre.y + tileH / 2).toBeLessThanOrEqual(720);
        }
      }
    }
  });
});
