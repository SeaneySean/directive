# Slice 2 — isometric renderer

Branch: `slice/2-isometric`. Owner: Orpheus. Reviewer: Cassandra.

## Goal

Replace the flat top-down drawing in `src/render/BattleScene.ts` with an isometric view using
Kenney CC0 tiles, without changing any rule in `src/game/`.

## Acceptance criteria

1. `src/game/` is untouched (git diff on that folder is empty). `bun test` still passes.
2. Map renders as an isometric diamond grid. Floor, wall and cover tiles use sprites from a
   Kenney isometric pack placed in `public/assets/` with a `CREDITS.md` naming the pack.
   Tile projection: `screenX = (x - y) * (TILE_W / 2)`, `screenY = (x + y) * (TILE_H / 2)`,
   with a `TILE_W`/`TILE_H` pair that matches the chosen pack (usually 64x32 or 128x64).
3. Units are sprites (or placeholder coloured billboards if no fitting unit art exists) sorted
   by depth so a unit behind a wall is hidden by it. Depth = `x + y` is acceptable.
4. Mouse hover and click resolve to the correct grid tile through the inverse projection.
   Reachable tiles highlight, hit-chance tooltip and shoot-on-click all keep working.
5. The board is centred in the canvas with the side panel still readable. Camera may pan
   with arrow keys or WASD; not required.
6. `bun run build` is green. `bun run dev` shows the board at a glance readable at 1280x720.

## Files expected to change

`src/render/BattleScene.ts` (or split into `src/render/iso.ts` for projection helpers plus the
scene), `src/main.ts` for canvas size, `public/assets/**`, `public/assets/CREDITS.md`.

## Out of scope

Animations, sound, camera zoom, new rules, new maps, fog of war. No new npm dependencies.

## Report format

See AGENTS.md. Include the Kenney pack name and licence line.
