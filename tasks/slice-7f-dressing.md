# Slice 7f — the district looks like a city, and soldiers walk

Branch: `slice/7f-dressing`. Owner: Orpheus. Reviewer: the critic. Depends on 7e (merged).
Conductor-approved 26 Sep (Athena, 9 revisions applied verbatim).
One worker run plus critic fixes only. 7f must be mergeable by the end of 27 Sep; 28–29 Sep are reserved for 7d (art wiring, polish debt, Loom and Skool post). Apply the cuts below before adding another implementation pass. Report changed files, assumptions, cuts taken and verification evidence.

## Why (designer, 26 Sep, after playing a district recover: won, 3 soldiers lost, 9 rounds)

"It still doesn't feel like a level, but is improving. I think it's the look. Also we haven't
animated the sprites in any way, so in most games the characters move, in this they jump."

The bones are there (roads, blocks, buildings, doorways, fog, radar). What is missing is
variety and clutter: every building is the same one-storey white box, roads are bare grey,
pavements are empty, and every district looks like the same district. And units teleport.

## Acceptance criteria

### Rules (`src/game/mapgen.ts`, pure, tested)

1. **Building variety metadata.** Each district building gains seeded `storeys: 1 | 2 | 3`, `facade: 0 | 1 | 2` and `landmark: boolean`. Maps with four or more buildings contain at least two facades and all three heights. Recover and assassination have exactly one landmark: the building containing the initial item/target position, always three storeys. Rival cabal has no landmark. Assign cosmetic metadata after gameplay generation, without consuming its RNG stream or changing collision, spawns or objectives. Test deterministic metadata and these invariants across the existing 200-seed sweep for all three mission types.
2. **Street furniture: dress existing cover, do not add collision.** Record `{ pos, kind }` for every existing district cover tile, using only `lamp`, `tree` and `crate`. Assign kinds deterministically after gameplay generation. Each map must show all three kinds, including a lamp on existing pavement cover. Preserve the existing cover positions, clustered squad spawns, doorway clearance and reserved tiles exactly; no density quota, road occupancy or new placement algorithm. Test one metadata entry per cover tile, no duplicate positions, valid kinds and unchanged connectivity across the existing seed sweep.
3. **Recover difficulty: deferred.** Keep four holding guards and reinforcement settings unchanged. One human win with three casualties does not establish that recover needs easing. This slice changes presentation only; record the next human recover result (win/loss, casualties, rounds and movement/readability feedback) for a separate balance decision. Harness outcomes are diagnostic, not a difficulty target.

### Renderer (`src/render/`)

4. **Building variety.** Render metadata as three visibly distinct facade treatments and one, two or three stacked wall levels with a roof on top. Reuse the current wall/roof art with tinting; compatible Kenney assets are optional, not a prerequisite. No new art pipeline or multi-floor gameplay. Keep the existing interior-visibility treatment: visible interior units, selection markers and doorways remain readable and clickable at every height. Roofs and upper walls must not expose unexplored building footprints or hidden units. Verify tall-building occlusion and camera-edge culling at the normal gameplay zoom. A distinct landmark roof colour is optional.
5. **Road and pavement.** Add centre-line markings aligned with road direction on straight runs, and a contrasting kerb only along road/pavement boundaries. Do not repeat kerbs around every pavement tile or run markings through junctions. Existing textures plus simple renderer overlays are acceptable; collision and fog behaviour remain unchanged.
6. **Prop textures by kind.** Give `lamp`, `tree` and `crate` distinct, recognisable silhouettes at normal gameplay zoom, using existing assets or simple renderer-drawn fallbacks. Each remains a single-tile cover prop with its base anchored to that tile. No cars, bins, hedges, multi-tile sprites or asset-pack search beyond locally available files. Vendored assets must live in the repository; no runtime dependence on `/tmp/kenney`.
7. **Walking, not jumping: player district moves only.** Before changing state, obtain the route with the existing `pathTo(this.reach, destination)`; do not implement another pathfinder or interpolate straight through obstacles. Validate with `moveUnit` once, then animate a single presentation of the soldier through every route tile at approximately 110 ms per tile. Keep the source presentation and fog until completion; publish the returned state and run `afterAction` exactly once afterwards. Invalid moves do not animate or spend AP. Hold the existing camera position during movement; no camera-follow work. A small bob and horizontal facing change are optional; smooth translation is mandatory. While moving, block selection, movement, shooting, END TURN, keyboard actions and camera manipulation; do not redraw away the animated object. On completion, restore interaction and redraw from authoritative state. Scene shutdown must cancel animation and callbacks. No enemy tween, recoil or AI action-replay system in 7f; retain existing enemy-turn and shot feedback. Story missions retain their current movement behaviour.
8. Keep the two story missions rendering exactly as before (they have no district metadata).
9. `bun test` and `bun run build` green; report `bun run playtest --missions 300` per-type outcomes with zero stalls. Save evidence in `docs/screens/7f/`, reached through NEW GAME → END TURN → MISSIONS → LAUNCH → GO, without injecting battle state or disabling fog. Record the mission type, seed and reproduction steps. Capture a start view showing road/kerb treatment and dressed cover, then explored views collectively showing all three building heights and at least two facades; they need not all be visible at mission start. Include a short recording of a player route around an obstacle through a doorway, with a mid-walk frame and final position/AP. Critic must verify that repeated clicks and END TURN during movement cause no extra action, input resumes afterwards, fog does not reveal early, and a visible unit inside a tall building remains selectable. Smoke-test both story missions. Credit every newly vendored pack in `CREDITS.md`; no missing-texture or browser-console errors.

## If late, cut in this order

Cars, recoil, enemy tween and recover retuning are cut now, not attempted first. If late, cut landmark roof colour → bob/facing → optional replacement art (use existing textures, tints and drawn props). Never cut: readable height/facade variation, road/kerb distinction, dressing existing cover, the player's path tween, fog/input correctness or verification. If those cannot pass by the 27 Sep cutoff, report the blocker to the conductor rather than borrowing 7d's shipping time or silently relaxing the gate.

## Out of scope

Civilians, walk-cycle sprite sheets, sound, weather, story-mission maps, new npm dependencies.
