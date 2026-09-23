# Slice 7b — the squad persists

Branch: `slice/7b-squad`. Owner: Orpheus. Reviewer: the critic. Conductor-approved 23 Sep (Athena, 7 revisions applied verbatim).
Depends on 7a (merged). Implements item 2 of DESIGN.md "Comp cut v2".

## Why

In UFO and Syndicate you care about your operatives because they persist: they carry scars,
earn ranks, and die for good. Ours reset every mission. This slice makes the four soldiers a
roster the player manages between missions.

## Acceptance criteria

### Rules (`src/game/strategy/`, pure, tested)

1. **Roster on the campaign.** `CampaignState.roster: Soldier[]`, where `Soldier` is
   `{ id, name, hp, maxHp, kills, rank: 0 | 1, alive, weapon: WeaponId }`.
   Define `WeaponId` as `'rifle' | 'shotgun'`; this is the base loadout, not a shop.
   The roster has four slots, retaining KIA entries until replaced. `createCampaign`
   seeds Cole, Diaz, Okafor and Reyes with their current IDs, 12/12 HP, rank 0 and no
   kills; Okafor has the shotgun, the others rifles. Save version 3; validate unique
   soldier IDs, weapon/rank values, non-negative integer kills, HP bounds and alive/HP
   consistency. Migrate v2 by adding a fresh roster without changing existing campaign
   progress. Preserve v1 support by applying the existing offers migration followed by
   roster migration. Round-trip v3 rosters without reseeding them.
2. **Missions draw from the roster.** `offerScenario` and story `missionScenario` replace
   the template squad with living roster members, in roster order, using the existing squad
   spawn positions in order. Preserve soldier IDs, names, current HP and max HP; retain
   2 AP and move 4. Use their base weapons with existing player weapon stats, apply the
   researched plasma replacement first, then the rank accuracy bonus. Do not mutate
   templates or change enemies, objectives, reinforcements or map generation.
   Fewer living soldiers means fewer fielded soldiers. Both `launchOffer` and `startMission`
   must reject a zero-living-soldier roster without changing state or spending an agent;
   corresponding LAUNCH buttons are disabled and show "NO SQUAD".
3. **Results flow back.** Initialise `GameState.killsBy: Record<string, number>` to `{}` in
   `createGame`; it counts this battle only. In `shoot`, immutably credit one kill to the
   attacker when a living hostile is killed, including a mission-ending shot. Misses,
   non-lethal hits and invalid shots award none.
   Settle roster results through pure rules alongside the existing guarded mission
   completion: match fielded squad units by soldier ID, copy HP/alive and add their
   `killsBy` count to career kills. Apply once only, for both generated and story missions,
   on wins and losses. Unfielded soldiers remain unchanged; KIA soldiers stay dead.
   An assassination escape does not kill surviving soldiers. Keep existing rewards,
   exposure, failure costs and retry rules. `BattleScene.finishMission` must pass the
   final battle state into settlement and save the combined campaign result before
   showing the debrief.
4. **Healing.** Every campaign `endTurn` heals each living soldier by 3 HP up to max.
5. **Promotion.** One promotion only for the v2 cut: at five career kills a surviving
   soldier becomes rank 1 ("Operative"); rank 0 is "Agent". Apply during result settlement.
   Rank 1 adds 10 percentage points to weapon accuracy when building subsequent missions,
   including plasma weapons; retain the existing hit-chance clamp. No stacking across
   missions, max-HP increase or promotion healing.
6. **Replacements.** `recruitSoldier(state)` replaces the first KIA slot in roster order
   for 40 treasury. The recruit has a fresh ID distinct from the dead soldier, 12/12 HP,
   zero kills, rank 0 and a rifle; no inherited progress. Choose names deterministically
   from a fixed list of 12, cycling if exhausted. Keep four roster entries; no casualty
   archive. Return state unchanged if all four are alive, treasury is below 40, an event
   is pending, a mission is active or the campaign has ended. Recruiting does not spend
   a strategic agent. Save successful recruitment immediately.
7. Tests: roster seeding; reduced squads and zero-squad launch rejection on both mission
   paths; stable identity and spawn mapping after recruitment; shooting kill attribution
   including the winning shot; once-only write-back, career-kill accumulation across two
   missions, death and surviving an assassination loss; living-only healing capped at max
   on an accepted campaign endTurn; five-kill promotion and non-stacking accuracy with
   and without plasma; recruitment guards/cost/reset; v1 and v2 migration, v3 round-trip
   and malformed roster rejection. Cover generated missions and both story missions.
   Keep existing mission rewards, retry and agent-cost tests green.

### Renderer (`src/render/`)

8. **World screen SQUAD panel**: four slots showing portrait, name, rank, HP bar and career
   kills; dead slots show KIA. Use existing portraits and the existing initials fallback
   for recruits; no new art. One RECRUIT button replaces the first KIA slot, shows the
   40-treasury cost and is disabled whenever recruitment is disallowed. Show a warning
   when no soldiers are alive. Fit at 1280x720 without adding obstruction to region cards
   or controls; a compact panel or simple SQUAD/MISSIONS tab is sufficient. Existing
   unrelated offers-panel polish remains in 7d.
9. **Debrief** lists each soldier's result: HP change, kills this mission, promotions, KIA.
10. **Battle side panel** shows rank next to the name.
11. `bun test`, `bun run build` green. Screenshots in `docs/screens/7b/` of the squad panel
    with one KIA and a recruit, a debrief with a promotion, and a battle card with a rank,
    through the real flow.

## Out of scope

Overwatch and grenades (7c), equipment purchases, new art, sound. Do not change mission
generation or story missions beyond building the squad from the roster.
