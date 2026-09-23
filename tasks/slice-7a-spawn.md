# Slice 7a-spawn — missions arise from your strategy

Branch: `slice/7a-spawn`. Owner: Orpheus. Reviewer: the critic. Conductor-approved 23 Sep (Athena, 6 revisions applied verbatim).
Depends on 7b (merged). Replaces the "one offer per region per turn" rule from 7a.

## Why (designer, 23 Sep)

"I don't think there should be missions immediately in all regions. Missions should spawn
based on the strategy, and only one or two active." And the offers panel covers the map.

## Acceptance criteria

### Rules (`src/game/strategy/missions.ts`, pure, tested)

1. **No offers at campaign start.** `createCampaign` seeds an empty `offers` list. The two
   story missions keep their existing unlock rules.
2. **Spawning at end of turn.** After actions resolve in `endTurn`, retain the outgoing turn's
   assignments for spawn eligibility and use the resulting region state. Expire old offers
   first, then visit eligible acted regions in `REGIONS` order. Continue from the seed already
   advanced by action resolution, rolling `nextRandom` once per eligible region; spawn when
   `value < 0.45` and store the final seed. Do not roll for held regions, regions with an open
   offer, or after reaching the two-open-offer cap. Append new offers to surviving offers; do
   not regenerate survivors. The cap applies to generated offers only, not story missions. Map
   each new offer from its assigned action's primary path:
   Subvert → assassination (a rival's puppet) when the successful spawn roll is below 0.225,
   otherwise recover (leaked files); no additional roll or per-region history;
   Force → clash (the garrison's counter-strike); Enlighten → recover (aid technology).
3. **Pressure spawns.** After expiry, if the outgoing turn had no assignments and no generated
   offer is open, spawn one clash offer with frozen `path: 'force'` in the unheld region with
   the highest resulting Force meter (ties: `REGIONS` order). If no eligible region remains, do
   nothing. This fallback uses no random roll and ensures an offer after an otherwise empty
   idle turn; it does not guarantee a spawn when assigned actions fail their rolls.
4. **Expiry and saves.** `spawnTurn` is the resulting campaign turn on which the offer first
   appears; store `expiresTurn = spawnTurn + 3`. At an END TURN transition, remove open offers
   whose `expiresTurn <= resultingTurn`, before spawning replacements. Example: an offer
   appearing on turn 2 is available on turns 2, 3 and 4, and disappears on entry to turn 5.
   Preserve surviving offers' identity, type, path and seed. Never expire launched offers;
   retain the existing launched → won/lost settlement, exactly-once rewards and roster
   settlement. Terminal won/lost records may be pruned at END TURN.

   Show expiry text ("The window in Europe has closed") in the same dismissible turn-feedback
   strip as spawn notices; combine notices when necessary. Derive feedback from the
   before/after transition rather than adding a persistent campaign log.

   Keep save version 3 with explicit backwards-compatible normalisation. For legacy v2/v3
   saves whose offers lack expiry, discard their old open offers, preserve launched/won/lost
   records and give those records `expiresTurn = campaign.turn + 3`. Preserve spent agents and
   all existing campaign/roster progress. V1 migration starts with no offers; existing roster
   migrations remain unchanged. Validate supplied expiry values as positive integers.
   New-format v3 round-trips must preserve offers and expiry without rerolling.
5. **Rewards unchanged** (+35 on the offer's path, resistance −5, treasury −20 on loss, the
   existing exposure table). The offer's `path` is its spawning action's primary path,
   frozen; pressure offers use Force.
6. Tests: no offers at start; spawn only from acted regions with the 45 percent roll being
   seed-deterministic; the mapping per path; the cap of 2; no duplicate per region; held
   regions excluded; pressure spawn when idle; expiry after 3 turns with the notice; launched
   offers unaffected by expiry; save v3 round-trip with `expiresTurn`; the campaign
   random-policy harness still terminates. Also test surviving offers across turns, expiry
   before replacement spawning, the exact expiry boundary, deterministic seed advancement,
   pressure tie-breaking and Force rewards, legacy v1/v2/v3 loading, invalid expiry rejection,
   and launched-offer settlement after its expiry boundary. Run `bun run playtest --campaign
   200` and include its summary in the AGENTS.md worker report; no balance retuning is
   required.

### Renderer (`src/render/WorldScene.ts`)

7. **Panel relocation.** The MISSIONS content moves into the right-hand HUD under the
   Exposure bar, as a compact list: story missions (when unlocked) and open offers, each on
   two lines ("EUROPE · RECOVER · +35 SUBVERT" and "expires in N turns · 1 agent"), with a
   LAUNCH button that sits on its own line so text never runs under it. The map area shows
   only a small gold mission glyph on regions with an open offer. Remove the floating panel
   and offer pagination, but preserve all 7b squad display, KIA, recruitment and launch-gating
   behaviour. Use mutually exclusive ACTIONS / MISSIONS / SQUAD tabs in the right-hand HUD
   below Exposure, with END TURN remaining accessible. Selecting a region opens ACTIONS. Keep
   all tab content inside the HUD at 1280x720. Mission labels may wrap; LAUNCH stays on its
   own line. Story entries retain their existing costs and retry/completion behaviour: do not
   label them with generated-offer expiry or a one-agent cost. No persistent panel may cover
   region cards.
8. **Spawn feedback.** When an offer spawns at end of turn, the first-turn-guide strip area
   shows a one-line notice for that turn ("New mission: assassination in North America"),
   dismissible, and the region glyph pulses for that turn.
9. The `?` help text and the first-turn guide mention that missions come from your actions.
10. `bun test`, `bun run build` green. Screenshots in `docs/screens/7a-spawn/`: the world
    screen on turn 1 with no offers and the HUD list empty, and after an END TURN with one
    spawned offer and its notice, through the real flow. Confirm every region card is fully
    visible. Also capture the HUD with two open offers and both story missions available, the
    selected-region action controls, and the SQUAD tab with a KIA and RECRUIT control. Verify
    readable labels, reachable controls and no overlap at 1280x720.

## Out of scope

Overwatch and grenades (7c), squad changes (7b handles them), mission generation itself,
story missions, art.
