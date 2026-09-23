# Slice 6c-tactics — make the objective matter

Branch: `slice/6c-tactics`. Owner: Orpheus. Reviewer: the critic.
Depends on 6b (merged). This is the focused balance follow-up authorised by the criterion 5
amendment on 20 Sep, plus two carried nits from 6b.

## Why (designer playtest, 23 Sep)

"Four rounds, lost no soldiers, didn't actually move from the starting position." The guards
walk into the squad's rifles (range 8 versus their 7), so a player can camp the start line and
win by attrition; the objective tile never matters. The designer also saw the cover bonus apply
when the crate was not between shooter and target, and asked for bigger maps.

## Acceptance criteria

### Rules (`src/game/`, pure, tested)

1. **Cover is directional.** In `los.ts` `inCover`, a cover tile adjacent to the target only
   counts when it lies within 60 degrees of the direction to the shooter: with `d` the unit
   vector from target to the cover tile and `s` the unit vector from target to shooter, require
   `d · s >= 0.5`. Tests: crate directly between shooter and target counts; crate beside the
   target (perpendicular) does not; crate behind the target does not; a diagonal shooter at
   45 degrees still counts.
2. **Guards hold position.** Add `stance?: 'hold' | 'advance'` to `Unit` (default `advance`,
   which is today's behaviour). A `hold` unit never moves unless (a) it has no shot this turn
   and a reachable tile within 2 steps gives it a shot from cover, or (b) an enemy is within 2
   tiles of it, in which case it may shoot or step to cover but not chase. All mission guards
   and guardians get `stance: 'hold'`; Farmstead aliens stay `advance`. `decide` in `ai.ts`
   honours the stance; `runTeamTurn` unchanged. Tests for both branches and for the default.
3. **Reinforcements.** Add to `Scenario`: `reinforcements?: { fromRound: number; every: number;
   max: number; spawns: Vec[]; unit: Omit<Unit, 'id' | 'pos'> }`. In `endTurn`, when the alien
   turn begins on round `fromRound` and every `every` rounds after, spawn one reinforcement at
   the first free spawn tile, up to `max`, with ids `r1`, `r2`, ... and log "Alarm: reinforcements
   arrive." Spawned units count for the kill-all win. Hangar: from round 4, every 2 rounds,
   max 4, spawning along the far wall. Atlantis: from round 5, every 2, max 3. Tests: spawn
   timing, cap, free-tile skipping, kill-all still counts spawned units.
4. **Bigger maps.** Hangar becomes 20x20, Atlantis 22x22, same design language as now (open
   floor, scattered cover clusters, covered start line), objective on the far third, guards
   holding cover near it. Squad still starts along the near edge. Keep 4 guards at 14 HP and 4
   guardians at 16 HP; keep the fixed accuracy 60, damage 4.
5. **Harness.** Add a `camperPolicy` to the harness only: never moves, shoots when it can.
   `bun run playtest 1000 "<mission>"` prints baseline, smart and camper lines. Gate: the
   camper must LOSE at least 80 percent of both missions (that is the playtest finding turned
   into a number). Smart-policy and baseline rates stay diagnostic. Record all six lines.

### Renderer (`src/render/`)

6. **Auto-fit board.** Tile size derives from the map: `TILE_W = floor(min(920 / (w + h) * 2,
   60))` rounded to an even number, `TILE_H = TILE_W / 2`; `BOARD_ORIGIN` centres the diamond
   in the 1000x720 board area. Sprites, crates, walls and pillars scale with the tile; unit
   height stays about 1.6 tiles. The 16x16 Farmstead still renders at 60x30. Picking
   (`screenToGrid`) uses the derived sizes. `iso.ts` exports a function that computes the
   sizes rather than constants; keep the old names as defaults for tests.
7. **Reinforcement feedback.** When a reinforcement spawns, flash its tile red and show the
   alarm line in the hint area for that enemy turn.
8. **Briefing scrim** (6b nit): a translucent dark band behind the briefing text block so the
   first lines read against the backdrop. **Portrait HP digits** (6b nit): the value sits
   right of the bar, never over it.
9. `bun test`, `bun run build` green. Re-shoot `docs/screens/6c/`: both boards at the new size
   with a reinforcement visible, the briefing with scrim, a portrait card. Drive the flow with
   Playwright through the real LAUNCH and GO buttons as in 6b's fix pass.

## Out of scope

New weapons, fog, sound, mobile layout, the world layer, research, events. No new npm
dependencies. Do not change guard accuracy or damage.
