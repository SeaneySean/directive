# Slice 7a-spawn — missions arise from your strategy

Branch: `slice/7a-spawn`. Owner: Orpheus. Reviewer: the critic.
Depends on 7b (merged). Replaces the "one offer per region per turn" rule from 7a.

## Why (designer, 23 Sep)

"I don't think there should be missions immediately in all regions. Missions should spawn
based on the strategy, and only one or two active." And the offers panel covers the map.

## Acceptance criteria

### Rules (`src/game/strategy/missions.ts`, pure, tested)

1. **No offers at campaign start.** `createCampaign` seeds an empty `offers` list. The two
   story missions keep their existing unlock rules.
2. **Spawning at end of turn.** After actions resolve in `endTurn`, for each region that had
   an action assigned this turn, roll a seeded chance (`nextRandom` from `state.seed`, advancing
   it) of 45 percent to spawn an offer in that region, mapped from the action's path:
   Subvert → assassination (a rival's puppet) or recover (leaked files), alternating per region;
   Force → clash (the garrison's counter-strike); Enlighten → recover (aid technology).
   A region with an existing open offer never gets a second. Stop rolling once two offers are
   open; the cap of open offers is 2. Regions that are held do not spawn.
3. **Pressure spawns.** If no region had an action and no offer is open, spawn one clash
   offer in the region with the highest Force meter (ties: PATHS order); the cabal is probing
   you. This guarantees at most one idle turn without a mission.
4. **Expiry.** An offer records `expiresTurn = spawnTurn + 3`. Unlaunched offers vanish at
   that turn's `endTurn` with a log line ("The window in Europe has closed"). A launched offer
   is consumed as today, win or lose.
5. **Rewards unchanged** (+35 on the offer's path, resistance −5, treasury −20 on loss, the
   existing exposure table). The offer's `path` is the action's path that spawned it, frozen.
6. Tests: no offers at start; spawn only from acted regions with the 45 percent roll being
   seed-deterministic; the mapping per path; the cap of 2; no duplicate per region; held
   regions excluded; pressure spawn when idle; expiry after 3 turns with the log line;
   launched offers unaffected by expiry; save v3 round-trip with `expiresTurn`; the campaign
   random-policy harness still terminates.

### Renderer (`src/render/WorldScene.ts`)

7. **Panel relocation.** The MISSIONS content moves into the right-hand HUD under the
   Exposure bar, as a compact list: story missions (when unlocked) and open offers, each on
   two lines ("EUROPE · RECOVER · +35 SUBVERT" and "expires in N turns · 1 agent"), with a
   LAUNCH button that sits on its own line so text never runs under it. The map area shows
   only a small gold mission glyph on regions with an open offer. Nothing overlays region
   cards any more; delete the paged floating panel.
8. **Spawn feedback.** When an offer spawns at end of turn, the first-turn-guide strip area
   shows a one-line notice for that turn ("New mission: assassination in North America"),
   dismissible, and the region glyph pulses for that turn.
9. The `?` help text and the first-turn guide mention that missions come from your actions.
10. `bun test`, `bun run build` green. Screenshots in `docs/screens/7a-spawn/`: the world
    screen on turn 1 with no offers and the HUD list empty, and after an END TURN with one
    spawned offer and its notice, through the real flow. Confirm every region card is fully
    visible.

## Out of scope

Overwatch and grenades (7c), squad changes (7b handles them), mission generation itself,
story missions, art.
