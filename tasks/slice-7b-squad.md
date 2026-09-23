# Slice 7b — the squad persists

Branch: `slice/7b-squad`. Owner: Orpheus. Reviewer: the critic. Conductor-approved 23 Sep (Athena, 7 revisions applied).
Depends on 7a (merged). Implements item 2 of DESIGN.md "Comp cut v2".

## Why

In UFO and Syndicate you care about your operatives because they persist: they carry scars,
earn ranks, and die for good. Ours reset every mission. This slice makes the four soldiers a
roster the player manages between missions.

## Acceptance criteria

### Rules (`src/game/strategy/`, pure, tested)

1. **Roster on the campaign.** `CampaignState.roster: Soldier[]`, where `Soldier` is
   `{ id, name, hp, maxHp, kills, rank: 0 | 1 | 2, alive, weapon: WeaponId }`. `createCampaign`
   seeds the four current soldiers (Cole, Diaz, Okafor, Reyes; Okafor with the shotgun) at full
   HP, rank 0, no kills. Save version 3 with validation and a v2 → v3 migration that seeds a
   fresh roster for old saves.
2. **Missions draw from the roster.** `offerScenario` and the story `missionScenario` build the
   squad from living roster members with their current HP, kills and rank, in roster order,
   up to four. A campaign with fewer than four living soldiers fields fewer. A campaign with no
   living soldiers cannot launch any mission (the LAUNCH buttons show "NO SQUAD").
3. **Results flow back.** On mission completion (win or loss) each fielded soldier's HP, kills
   and alive flag are written back from the battle state; kills credited per killing shot in
   `shoot` via a `killsBy: Record<string, number>` on the battle state. Dead soldiers stay dead.
4. **Healing.** Every campaign `endTurn` heals each living soldier by 3 HP up to max.
5. **Promotion.** At 5 kills a soldier becomes rank 1 (+10 accuracy), at 12 kills rank 2
   (+15 accuracy, +2 max HP). Ranks are shown as "Agent", "Operative", "Veteran". Applied when
   results are written back; the bonus applies through the squad build in criterion 2.
6. **Replacements.** `recruitSoldier(state)` costs 40 treasury, needs an empty roster slot (max
   four living), and adds a fresh rank-0 soldier with a name from a fixed list of 12 and a
   rifle. Not allowed with a pending event or below 40 treasury.
7. Tests: roster seeding, squad build with fewer than four, write-back incl. death and kills,
   healing cap, both promotions and their bonuses, recruit rules, save migration, and that
   the story missions still work with the roster squad.

### Renderer (`src/render/`)

8. **World screen SQUAD panel**: four slots showing portrait, name, rank, HP bar, kills; dead
   slots show KIA with a RECRUIT button (cost shown, disabled when unaffordable); an empty
   roster shows a warning line. Fit it without covering region cards (place it under the
   right-hand HUD or make the missions panel and squad panel share a paged area).
9. **Debrief** lists each soldier's result: HP change, kills this mission, promotions, KIA.
10. **Battle side panel** shows rank next to the name.
11. `bun test`, `bun run build` green. Screenshots in `docs/screens/7b/` of the squad panel
    with one KIA and a recruit, a debrief with a promotion, and a battle card with a rank,
    through the real flow.

## Out of scope

Overwatch and grenades (7c), equipment purchases, new art, sound. Do not change mission
generation or story missions beyond building the squad from the roster.
