# Slice 6c-tactics — make the objective matter

Branch: `slice/6c-tactics`. Owner: Orpheus. Reviewer: the critic. Conductor-approved 23 Sep (Athena, 7 revisions applied).
Depends on 6b (merged). This is the focused balance follow-up authorised by the criterion 5 amendment on 20 Sep, plus two carried nits from 6b. The conductor authorises hold-position AI and finite timed reinforcements as narrow exceptions to DESIGN.md's unchanged tactical rules. Preserve both existing victory routes, objective-hold timing, AP rules, weapons and campaign consequences. No player stance controls, new mission deadline, endless waves or general encounter framework. If the specified mechanics cannot meet the camper gate, report the results to the conductor rather than expanding scope or changing locked statistics.

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
   45 degrees still counts. Add a regression with target (3,3), adjacent cover (4,3), and shooter (4,6): the old positive-dot-product rule grants cover, but the new cone must reject it. Preserve cardinal adjacency, the same-position guard, the existing cover penalty and wall line-of-sight behaviour.
2. **Guards hold position.** Add `stance?: 'hold' | 'advance'` to `Unit`; omitted stance means today's `advance` behaviour. For `hold`, shoot whenever a legal shot exists, using the existing target ranking even below the normal repositioning threshold. Otherwise move only if at least 2 AP remain and a destination within 2 walkable path steps gives a legal shot against an enemy and directional cover from that same enemy; otherwise wait. Choose deterministically by highest shot chance, shortest path, then y and x. No separate close-enemy pursuit or retreat rule. Only the initial mission guards and guardians get `hold`; reinforcements explicitly get `advance`, and Farmstead stays unchanged. Implement this in `decide`; keep `runTeamTurn` unchanged. Tests cover shooting, covered repositioning, no qualifying destination, insufficient AP, the movement bound and default advance behaviour.
3. **Reinforcements.** Add to `Scenario`: `reinforcements?: { fromRound: number; every: number;
   max: number; spawns: Vec[]; unit: Omit<Unit, 'id' | 'pos'> }`. In `endTurn`, when the alien
   turn begins on round `fromRound` and every `every` rounds after, spawn one reinforcement at
   the first free spawn tile, up to `max`, with ids `r1`, `r2`, ... and log "Alarm: reinforcements
   arrive." Spawned units count for the kill-all win. Hangar: from round 4, every 2 rounds,
   max 4, spawning along the far wall. Atlantis: from round 5, every 2, max 3. Tests: spawn
   timing, cap, free-tile skipping, kill-all still counts spawned units. Copy the reinforcement configuration into GameState in createGame and track the total successfully spawned, not the number still alive; never mutate the Scenario or shared unit template. Each reinforcement uses the mission's existing enemy statistics and `stance: 'advance'`. Spawn only on the squad-to-alien transition at a scheduled round, on the first in-bounds walkable tile unoccupied by a living unit. If every spawn is blocked, skip that scheduled arrival without consuming the cap or id; try again at the next scheduled round, with no backlog. New arrivals receive full AP and act that enemy turn. Preserve current victory precedence: killing the last living enemy wins immediately even if future arrivals remain scheduled; completing the objective wins before spawning; terminal games never spawn. Add tests for these cases, unique ids after casualties, repeat calls, input immutability and independent games created from the same Scenario.
4. **Bigger maps.** Hangar becomes 20x20, Atlantis 22x22, same design language as now (open
   floor, scattered cover clusters, covered start line), objective on the far third, guards
   holding cover near it. Squad still starts along the near edge. Keep 4 guards at 14 HP and 4
   guardians at 16 HP; keep the fixed accuracy 60, damage 4.
5. **Harness.** Add a `camperPolicy` to the harness only: never moves, shoots when it can.
   `bun run playtest 1000 "<mission>"` prints baseline, smart and camper lines. Gate: the
   camper must produce `outcome === 'lost'` in at least 800 of seeds 1 through 1000 for each mission separately. Preserve the existing 400-team-turn simulation cap; games still playing are stalls, never losses. Camper target selection uses the smart policy's lowest-HP, then highest-hit-chance, then unit-id ordering, but waits whenever no legal shot exists. All enemy turns use the production `decide` policy. Record all six lines, including won, lost and stalled counts; baseline and smart rates remain diagnostic. This is an automated anti-camping regression gate, not a replacement for the designer's human difficulty gate. Before merge, replay both missions through the real campaign flow, checking that advancing through cover and pursuing the objective remains viable and understandable. If the camper gate fails, return the measured results to the conductor; do not count stalls as losses or change locked statistics to force a pass.

### Renderer (`src/render/`)

6. **Auto-fit board.** Preserve 60x30 tiles for the 16x16 Farmstead. For the enlarged missions use `tileW = 2 * floor(min(920 / (w + h) * 2, 60) / 2)` and `tileH = tileW / 2`. Compute a per-board origin that centres the diamond in the 1000x720 board area, leaving room for raised terrain and sprites without clipping or overlapping the side panel. In `iso.ts`, add a pure layout function and allow both projection functions to receive the derived tile dimensions; retain TILE_W/TILE_H and existing call signatures as 60x30 defaults. Use the same layout for terrain, units, overlays, flashes, tile picking and unit hitboxes. Scale terrain and sprites proportionally; unit height remains about 1.6 tile widths. Add projection round-trip and board-bounds tests for all three map sizes, and verify edge-tile and unit picking in the browser.
7. **Reinforcement feedback and explanation.** When a reinforcement spawns, flash its tile red and show the alarm line in the hint area for that enemy turn. Detect arrivals from the state transition, not by replaying old log entries. Before GO, the mission briefing states the initial enemy count separately from the reinforcement cap, first arrival round and interval, and explains that eliminating all currently living enemies still wins immediately. Update the battle cover hint to explain that adjacent cover protects only from the shooter's direction. These text changes are in scope; no new briefing screen or tutorial system.
8. **Briefing scrim** (6b nit): a translucent dark band behind the briefing text block so the
   first lines read against the backdrop. **Portrait HP digits** (6b nit): the value sits
   right of the bar, never over it.
9. `bun test`, `bun run build` green. Re-shoot `docs/screens/6c/`: both boards at the new size
   with a reinforcement visible, the briefing with scrim, a portrait card. Drive the flow with
   Playwright through the real LAUNCH and GO buttons as in 6b's fix pass.

## Out of scope

New weapons, fog, sound, mobile layout, the world layer, research, events. No new npm
dependencies. Do not change guard accuracy or damage.
