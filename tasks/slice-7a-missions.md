# Slice 7a — missions everywhere

Branch: `slice/7a-missions`. Owner: Orpheus. Reviewer: the critic.
Depends on 6c-tactics (merged). Implements item 1 of DESIGN.md "Comp cut v2".

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
     Win when the carrier ends a player turn on any extraction tile. Kill-all also wins.
   - `{ kind: 'assassinate', targetId, exits: Vec[] }`: win when the unit with `targetId`
     dies. Lose when that unit ends an alien turn on an exit tile. The target uses a new
     `stance: 'flee'`: it moves toward the nearest exit by shortest path every turn and only
     shoots if it cannot move; bodyguards use `hold`. Kill-all also wins.
   - `{ kind: 'clash' }`: no tile; win by kill-all. The enemy squad uses the harness's smart
     squad policy moved into `src/game/ai.ts` as `advanceSmart` (stance `'smart'`), which
     prefers covered tiles, focuses the lowest-HP target, and closes distance when it has no
     shot.
   `endTurn`, `shoot` and `checkOutcome` implement these; the log narrates pickup, extraction,
   target down, target escaped. Tests for every transition, including carrier death and drop.
2. **Map generator.** `src/game/mapgen.ts`: `generateMission(type, path, seed)` returns a
   `Scenario`. Size 18x18 to 22x22 from the seed. Walls only as a border plus at most two short
   interior wall stubs. Cover placed in 6 to 10 clusters of 1 to 3 tiles with a minimum 3-tile
   gap between clusters and never on spawn, objective, exit or extraction tiles. Squad spawns
   along the south edge behind a cover line; enemies on the north third. Objective and target
   placement per type: recover item tile on the north third, extraction = the squad's south
   edge tiles; assassination target on the north edge with exits on the east and west edges
   of the north half; clash enemies spread across the north half. Enemy roster by path:
   Subvert missions face 3 guards (hold) + 1 heavy-armed guard (hold, 16 HP); Force missions
   face 4 guards (advance); Enlighten missions face a rival cabal of 4 (smart) in every type.
   Reinforcements: recover and assassinate missions get 2 from round 6 every 3. Deterministic
   for a seed; tests assert connectivity (every squad spawn can path to every objective, exit
   and extraction tile), cover spacing, and no overlaps, over 200 seeds.
3. **Campaign offers.** In `src/game/strategy/missions.ts`: each campaign turn, every region
   not held gets one generated offer `{ regionId, type, path, seed }` where `path` is the
   region's currently highest meter (ties: Subvert), type cycles per region per turn. Offers
   are stored on `CampaignState.offers`, regenerated in `endTurn`, and launching one consumes
   one agent for that turn (so missions compete with actions). Rewards: win gives +35 to the
   region's `path` meter and −5 Resistance; loss deducts 20 treasury. Exposure: recover +4,
   assassinate +8, clash +2; Enlighten-path missions cost half. Tests.
4. **Playtest harness.** `bun run playtest --missions 300` runs 100 generated missions of each
   type with the smart squad and prints won/lost/stalled per type; camper stays out of this
   slice. Diagnostic only, but any stall is a bug to fix (no mission may fail to terminate).

### Renderer (`src/render/`)

5. **World screen.** The MISSIONS panel lists the two story missions and, per region, its
   offer as "REGION · TYPE · +35 PATH", with LAUNCH. Region cards show a small mission glyph
   when an offer is open. Briefing shows type-specific objective text, enemies, exits or
   extraction, and reward.
6. **Battle screen.** Extraction tiles glow green at the south edge; exits glow red; the
   assassination target has a gold ring and "TARGET" label; the carrier shows a small gold
   crate icon over its head; the hint line explains each objective in one sentence. All
   drawn through the shared layout so they scale with the map.
7. `bun test`, `bun run build` green. Screenshots in `docs/screens/7a/` of one mission of each
   type reached through the real world → briefing → GO flow, plus the offers panel.

## Out of scope

Squad persistence (7b), overwatch and grenades (7c), new art, sound, mobile. Do not change
the two story missions' maps or stats. No new npm dependencies.
