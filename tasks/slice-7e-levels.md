# Slice 7e — real levels: big maps, fog of war, radar, city districts

Owner: Orpheus. Reviewer: the critic. Replaces 7c (overwatch and grenades), cut on 26 Sep.
Conductor-approved 26 Sep (Athena, 9 revisions applied verbatim).
Depends on 7a-spawn. Verify its implementation is merged into the worker's base before starting; it is not merged at 31f5432. Two parts, two worker runs.

**Part 1, branch `slice/7e-rules`:** criteria 1 to 5 (map size, visibility rules, hidden
enemies, district generator, harness). Pure rules and tests, with bun test and bun run build green before Part 1 merges. Keep district generation and fog-dependent gameplay opt-in for tests/harness until Part 2 activates them together in the campaign; existing battle rendering must remain playable between merges. Preserve existing public exports.
**Part 2, branch `slice/7e-render`:** criteria 6 to 10 (camera, fog rendering, radar, city
tileset, screenshots). After Part 1 merges. If Part 2 runs long, cut whole-building roofs
first (keep textured walls, roads, props and readable open interiors) and protect fog, radar,
camera and the completion playtest.

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
   not). Initialise explored and enemy-sighting memory in createGame. Refresh them after every successful move, shot/death, reinforcement arrival and turn transition; explored only grows. knownEnemies(state) returns living enemies on currently visible tiles. Store last-seen enemy positions as copied values in GameState, updating only while visible. shoot must reject a squad attack on an unknown enemy without spending AP or advancing RNG. Preserve previewShot's existing geometry/combat API and add a state-aware squad preview for callers needing visibility checks. All squad AI target selection and tactical scoring use known enemies; enemy AI retains omniscience, subject to the assassination activation rule below. Tests cover initial reveal, visible blocking wall faces, hidden tiles behind walls, enemy movement through sight, sight loss after a squad death, immutable memory, and rejected hidden shots.
   The existing LOS already exposes the blocking wall itself while hiding tiles behind it
   (`src/game/los.ts`); preserve that.
3. **Radar data.** A pure `radar(state)` returns: the explored bitmap, squad positions, known
   enemy positions, the objective marker, and for assassination the target's **last known
   tile** (updated whenever the target is visible; initially the tile of its spawn district's
   centre, not its exact tile) plus a bearing from the squad's centroid. For recover, mark the ground item until pickup, then the carrier and extraction tiles; for hold, mark the hold tile; without an objective, return no objective marker. For clash, choose the nearest stored enemy contact by distance from the living squad centroid to its stored position, ties by enemy ID; before any contact, use the north-third centre. Never rank contacts using hidden current positions. Clear a contact when its stored tile is visible and that enemy is absent, or its death is observed. Apply this stale-contact rule to assassination too, retaining the initial district marker as a search-area hint. radar is a read-only projection, not a memory updater, and handles an empty squad without NaN values.
4. **District generator.** `src/game/mapgen.ts` gains a `district` layout used for all
   generated missions: a road grid of 1-tile roads every 7 to 9 tiles; blocks filled with
   buildings with rectangular outer footprints 3x3 to 6x5, wall perimeters, one or two 1-tile floor doorways, and floor interiors. Part 1 adds optional, pure-data district metadata to Scenario and copies it into GameState: row-major surface tags distinguishing road, pavement, plaza and interior; building IDs, footprints and doorway tiles; and the initial radar search marker. Keep collision in the existing floor/wall/cover grid. No texture keys or Phaser types in game data. Hand-authored scenarios may omit the metadata. Test deterministic generation and independent state copies; plazas (empty blocks) with 2 to 4 cover props; a few single cover
   props on pavements. All floor tiles (roads, pavements, interiors through doorways) connected;
   Tests over 200 seeds per type, cycling influence paths, flood-fill using the actual four-neighbour walkability rules after props are placed, ignoring unit occupancy. Assert every floor tile is connected, including all unit spawns, objectives, exits, extraction, doorways and reinforcement spawns. Preserve distinct unit spawns and floor-only special tiles; replace obsolete scattered-cover-cluster assertions with district structure assertions.
   Assassination target spawns inside a building in the far third, outside initial squad visibility, with bodyguards beside, not occupying, its doorways; exits are walkable tiles on the far edge. For generated district assassinations only, latch an alarm when the target first becomes squad-visible; until then it waits. Once alerted, retain its existing one-AP, three-tile flee behaviour and escape resolution. Preserve and adapt the existing unopposed interception regression across its seeds and paths using visibility-aware squadPolicy; adjust layout/exit placement if necessary, not visibility or weapon rules. A target escaping before any sighting is a failure, not acceptable balance; recover item inside a
   building; clash operatives spread across the far half, some inside buildings. Squad spawns
   on the near edge on pavement behind props. Reinforcements spawn from far-edge road tiles.
5. **Harness.** `bun run playtest --missions 300` runs on the district maps with the smart
   squad using only known enemies; report per-type lines and stalls. Zero stalls required.
   Update squadPolicy, its squadGoal/objectiveMove helpers and the squad branch of advanceSmart so shooting, pursuit and cover scoring use only known enemies or stored radar information; retain omniscient enemy behaviour. Preserve recover pickup/extraction priorities. With no known enemy, approach the radar search marker by a walkable route; if it is blocked terrain, already searched or exhausted, visit reachable unexplored frontiers in deterministic order rather than waiting indefinitely. Test unseen target movement does not change squad pursuit, a stale/blocked marker does not stall exploration, and squad advanceSmart explores with no visible enemy. Keep the existing harness turn limit, report runtime and per-type outcomes, and retain the interception regression: zero stalls alone is insufficient.

### Renderer (`src/render/`)

6. **Camera.** The board is larger than the viewport. The camera centres on the selected unit
   when selection changes, pans with mouse drag on empty ground, edge scrolling, and WASD or
   arrow keys, clamped to the board bounds. District boards use readable fixed-size tiles rather than boardLayout's auto-fit scaling. Picking and unit hitboxes use camera-transformed world coordinates. Keep the HUD, radar, tooltips and debrief screen-fixed; clip board rendering and input to the board viewport. Distinguish a drag from a click before issuing a move. Hidden enemies must not leak through unitFromPointer, unitAt fallbacks, hover HP, target labels or reinforcement flashes. Board objective markers obey fog; authorised radar hints may remain visible through it. Roofs must not reveal unexplored footprints, and visible interior units and reachable tiles must remain readable.
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
