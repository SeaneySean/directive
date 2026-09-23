# Slice 7a — missions everywhere

Owner: Orpheus. Reviewer: the critic. Conductor-approved 23 Sep (Athena, 8 revisions applied;
Athena judged the whole too large for one worker run, so it is split).
Depends on 6c-tactics (merged). Implements item 1 of DESIGN.md "Comp cut v2".

**Part 1, branch `slice/7a-rules`:** criteria 1, 2 and 4 (objective types, smart stance, map
generator, missions harness). Pure rules and tests only; no campaign or renderer changes.
**Part 2, branch `slice/7a-campaign`, after Part 1 merges:** criteria 3, 5, 6 and 7 (campaign
offers, rewards, saves, world and battle UI, screenshots).

## Why

The designer's verdict after four playtests: the combat layer must be the main game, as in
Syndicate and UFO. Today combat happens twice per campaign on hand-built maps with one
objective type. After this slice every region offers a mission every turn, on a generated map,
in one of three types, and winning missions is the strongest way to take the world.

## Acceptance criteria

### Rules (`src/game/`, pure, tested)

1. **Objective types.** Extend `ScenarioObjective` to a discriminated union:
   - `{ kind: 'hold', tile, holdRounds }` (today's behaviour, unchanged, used by the two
     story missions).
   - `{ kind: 'recover', tile, extraction: Vec[] }`: when a living squad unit ends the
     player's turn on `tile`, that unit becomes the carrier (`carrierId` on state; if the
     carrier dies the item drops on its tile and any squad unit can pick it up the same way).
     Win only when the living carrier ends a player turn on an extraction tile. Killing all enemies does not win a recover mission; play continues until extraction or squad loss. Keep kill-all victory for hold, assassinate and clash, including the existing story missions.
   - `{ kind: 'assassinate', targetId, exits: Vec[] }`: win when the unit with `targetId`
     dies. Lose when that unit ends an alien turn on an exit tile. The target uses a new
     `stance: 'flee'`: it moves toward the nearest exit by shortest path every turn and only
     shoots if it cannot move; bodyguards use `hold`. Kill-all also wins.
   - `{ kind: 'clash' }`: no tile; win by kill-all. Add `advanceSmart` in `src/game/ai.ts`, reusing the lowest-HP targeting and directional-cover logic of the existing `squadPolicy` already in that file. It is a team-neutral combat policy: take a legal shot at the lowest-HP enemy, otherwise close distance while preferring directional cover. Dispatch stance `'smart'` to it from `decide`, without recursive fallback. Preserve the exported `squadPolicy` and make its objective movement handle hold, recover pickup and extraction, assassination interception, and clash. Enemy smart units must not pursue the player's recovery objective.
   `endTurn`, `shoot` and `checkOutcome` implement these; the log narrates pickup, extraction,
   target down, target escaped. Tests for every transition, including carrier death and drop.
2. **Map generator.** `src/game/mapgen.ts`: `generateMission(type, path, seed)` returns a
   `Scenario`. Size 18x18 to 22x22 from the seed. Walls form the outer border, with at most two short interior wall stubs. All references to north, south, east and west edges mean the adjacent inner walkable row or column, not the wall border. Cover placed in 6 to 10 clusters of 1 to 3 tiles with a minimum 3-tile
   gap between clusters and never on spawn, objective, exit or extraction tiles. Squad spawns
   along the south edge behind a cover line; enemies on the north third. Objective and target
   placement per type: recover item tile on the north third, extraction = the squad's south
   edge tiles; assassination target on the north edge with exits on the east and west edges
   of the north half; clash enemies spread across the north half. Enemy roster is determined by objective type, using existing guard stats, weapons and art: recover has four holding guards; assassinate has one marked fleeing guard and three holding bodyguards; clash has four smart operatives. No additional heavy-guard variant or path-specific roster. Path determines the campaign reward and Exposure modifier. Recover and assassinate use the existing reinforcement scheduler with `fromRound: 6`, `every: 3`, `max: 2`, spawning one advancing guard per scheduled arrival from reserved northern floor tiles. Deterministic
   for a seed; Tests cover 200 seeds per type and assert terrain connectivity, ignoring temporary unit occupancy, from every squad spawn to the relevant item, target spawn, exit and extraction tiles; distinct unit spawns; floor-only special tiles; and cover spacing. Extraction tiles may coincide with squad spawns as specified. Define the cluster gap as at least three intervening floor tiles; the squad cover line is separate from the scattered clusters and must leave a route north. Validate that assassination layouts permit interception before the target escapes; connectivity alone is insufficient. Include one manually played assassination through the real launch flow.
3. **Campaign offers.** In `src/game/strategy/missions.ts`: every region, including held regions, gets one generated offer per campaign turn, starting in `createCampaign`. Store `{ regionId, type, path, seed }` plus turn-scoped identity and attempt status on `CampaignState.offers`. Choose the highest-meter path, breaking ties in PATHS order (Subvert, Force, Enlighten). Cycle types in recover/assassinate/clash order using the region index and campaign turn. Freeze each offer's path and seed until the next campaign turn; opening a briefing must not reroll it. Launching consumes one agent until the next campaign turn, whether won or lost. Remaining agent capacity is total agents minus assigned actions minus launched generated missions; enforce this in both action and mission APIs and the HUD. Story missions retain their existing agent rules. Each generated offer can be attempted once per turn; repeated launch or completion calls have no effect. Reject launches during a pending event, another active mission, or a finished campaign. On first completion, win gives +35 to the offer's frozen path meter, capped at 100, and reduces Resistance by 5, floored at zero; loss deducts 20 treasury, floored at zero. Apply Exposure once on completion, for either result: recover +4, assassinate +8, clash +2, halved for Enlighten-path offers and capped at 100. Immediately update held status and campaign outcome, preserving Exposure-loss precedence. Generated missions receive the existing researched plasma upgrade. Preserve story unlocks, rewards and retries. Extend save validation and round-trip tests for offers and spent mission agents; migrate existing version-1 saves lacking these fields without losing campaign progress. Tests cover agent sharing, single-use settlement, turn reset, fifth-region victory, Exposure defeat, plasma and legacy saves.
4. **Playtest harness.** `bun run playtest --missions 300` runs 100 generated missions of each
   type with the smart squad and prints won/lost/stalled per type; camper stays out of this
   slice. Use a deterministic seed set covering all three paths within each type. Report any game still playing after the existing 400 team-turn harness limit as stalled, with its type, path and seed. Acceptance requires zero stalls in this sample; fix generator or policy defects rather than silently declaring timeout wins or losses. This is not a guarantee of termination against a player who waits indefinitely, nor a substitute for the manual playtest.

### Renderer (`src/render/`)

5. **World screen.** The MISSIONS panel lists the two story missions and, per region, its
   offer as "REGION · TYPE · +35 PATH", with LAUNCH. Region cards show a small mission glyph
   when an offer is open. Briefing shows type-specific objective text, enemies, exits or extraction, agent cost, Exposure and reward. Use a scrollable or paged offers panel that remains readable at 1280×720 alongside the story missions. Update `strategy/text.ts` help and first-turn guidance to introduce regional missions, and update BattleScene's objective hints and debrief to show actual influence, Resistance, Exposure and treasury changes. Remove hard-coded hold/kill-all copy from generated-mission briefings; retain it where valid for story missions. Generated losses consume the current offer rather than promising a retry of that same mission next turn.
6. **Battle screen.** Extraction tiles glow green at the south edge; exits glow red; the
   assassination target has a gold ring and "TARGET" label; the carrier shows a small gold
   crate icon over its head; the hint line explains each objective in one sentence. All
   drawn through the shared layout so they scale with the map.
7. `bun test`, `bun run build` green. Screenshots in `docs/screens/7a/` of one mission of each
   type reached through the real world → briefing → GO flow, plus the offers panel.

## Out of scope

Squad persistence (7b), overwatch and grenades (7c), new art, sound, mobile. Do not change
the two story missions' maps or stats. No new npm dependencies.
