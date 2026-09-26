# Slice 7e — real levels: big maps, fog of war, radar, city districts

Owner: Orpheus. Reviewer: the critic. Replaces 7c (overwatch and grenades), cut on 26 Sep.
Depends on 7a-spawn (merged). Two parts, two worker runs.

**Part 1, branch `slice/7e-rules`:** criteria 1 to 5 (map size, visibility rules, hidden
enemies, district generator, harness). Pure rules and tests.
**Part 2, branch `slice/7e-render`:** criteria 6 to 10 (camera, fog rendering, radar, city
tileset, screenshots). After Part 1 merges.

## Why (designer, 26 Sep)

"You can't play an assassination mission in what looks like a warehouse with a few crates in
it. A larger playable area. The target not immediately visible, but a pointer on a radar in one
corner. Buildings, scenery. Not the whole map visible, but it gets exposed as you move about.
Make it an actual game level."

## Acceptance criteria

### Rules (`src/game/`, pure, tested)

1. **Size.** Generated missions are 36x36 to 40x40 (seeded). The two story missions stay at
   their current sizes and layouts.
2. **Visibility.** `GameState.explored: boolean[]` (row-major, persistent for the battle) and
   a pure `visibleTiles(state): Set<string>` computed from every living squad unit: tiles
   within Chebyshev distance 7 with `hasLineOfSight` from the unit (walls block; cover does
   not). `explored` is unioned with the visible set after every squad move and at the start of
   every squad turn. Enemies are **known** only when on a visible tile; `knownEnemies(state)`
   returns them. The squad AI in the harness and the player's shot preview may only target
   known enemies; enemy AI is unchanged (it always knows where the squad is, as X-COM does).
   Tests: reveal radius, wall occlusion, persistence of explored, hidden enemy cannot be
   targeted, becomes targetable when seen.
3. **Radar data.** A pure `radar(state)` returns: the explored bitmap, squad positions, known
   enemy positions, the objective marker, and for assassination the target's **last known
   tile** (updated whenever the target is visible; initially the tile of its spawn district's
   centre, not its exact tile) plus a bearing from the squad's centroid. For recover, the
   item tile is always marked; for clash, the last known tile of the nearest enemy, initially
   the north-third centre.
4. **District generator.** `src/game/mapgen.ts` gains a `district` layout used for all
   generated missions: a road grid of 1-tile roads every 7 to 9 tiles; blocks filled with
   buildings as solid wall rectangles 3x3 to 6x5 with one or two 1-tile doorways and an
   enterable floor interior; plazas (empty blocks) with 2 to 4 cover props; a few single cover
   props on pavements. All floor tiles (roads, pavements, interiors through doorways) connected;
   tests over 200 seeds per type assert connectivity from every squad spawn to the objective,
   exits, extraction and every doorway. Assassination target spawns inside a building in the
   far third with bodyguards at its doorways; exits are on the far edge; recover item inside a
   building; clash operatives spread across the far half, some inside buildings. Squad spawns
   on the near edge on pavement behind props. Reinforcements spawn from far-edge road tiles.
5. **Harness.** `bun run playtest --missions 300` runs on the district maps with the smart
   squad using only known enemies; report per-type lines and stalls. Zero stalls required.
   Squad policy explores toward the radar marker when no known enemy is visible.

### Renderer (`src/render/`)

6. **Camera.** The board is larger than the viewport. The camera centres on the selected unit
   when selection changes, pans with mouse drag on empty ground, edge scrolling, and WASD or
   arrow keys, clamped to the board bounds. Picking and hitboxes account for the camera.
7. **Fog.** Unexplored tiles are not drawn (black). Explored-but-not-visible tiles and their
   terrain are drawn at 40 percent brightness. Enemies are drawn only when known; a known
   enemy that leaves sight leaves a faded "last seen" silhouette on its last known tile until
   it is seen again. Reachable-tile highlights only show on visible tiles.
8. **Radar.** A 200x140 panel in the bottom-left corner of the board area: explored tiles as
   dim pixels, walls lighter, squad as blue dots, known enemies red, the objective gold, the
   assassination target as a gold blip at its last known tile with a bearing arrow at the
   panel edge when it lies off the explored area. The viewport rectangle is outlined. Clicking
   the radar pans the camera there.
9. **City tileset.** Vendor Kenney's Isometric City (CC0) textures, cropped as before: road,
   pavement, building walls (two facades), roof top, doorway, and 3 props. Buildings render
   as wall blocks with their roof drawn as one top face per building; a unit inside a building
   is always drawn above the walls that would hide it (depth boost inside interiors). Interiors
   use a darker floor. Credit the pack in CREDITS.md.
10. `bun test`, `bun run build` green. Screenshots in `docs/screens/7e/` through the real
    flow: mission start with fog, after two moves with a building revealed, the radar showing
    a target bearing, the target found inside a building, and a recover extraction. Orpheus
    plays one assassination to completion on a district map and records the seed and outcome.

## Out of scope

Overwatch, grenades, sound, new unit art, changes to the story missions' maps, mobile.
No new npm dependencies.
