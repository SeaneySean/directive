# Illuminatus — design

A conspiracy strategy game in the browser. You are one of the Illuminati. Take the world, region
by region, by subversion, by force, or by giving everyone so much that they stop resisting. Fund
research from cybernetics to mythology, dig alien tech out of Area 51, find the Aurichalcum
formula in Atlantis, and put a reality-TV star in the White House when a law needs passing.

Blend: Syndicate (1993) and UFO: Enemy Unknown (1994). A strategic world layer feeds turn-based
isometric squad missions. Built for the September Comp, deadline **30 Sep 2026**.

## Comp cut v2 (decided 23 Sep with the designer: combat is the game)

The strategic layer stays as built. The remaining week goes into making the combat layer the
main loop, the way Syndicate and UFO: Enemy Unknown work: the world map exists to feed
missions, and the squad that fights them is the thing you care about.

1. **Missions everywhere (7a).** Missions arise from your strategy: acting in a region can
   spawn a mission there (at most two open at once, expiring after three turns), drawn from
   three types on generated maps: **Recover technology** (reach the item tile, then get
   the carrier back to your extraction edge), **Assassination** (kill a marked target with
   bodyguards before they reach their exit), **Rival cabal** (eliminate a four-operative squad
   that uses the smart squad AI). Winning gives that region a large influence jump on the
   matching path. Area 51 and Atlantis remain as the two story missions.
2. **The squad persists (7b).** Soldiers carry HP and kills between missions, heal per
   campaign turn, promote at five kills, stay dead when killed, and cost treasury to replace.
   Roster on the world screen.
3. **Two more verbs (7c).** Overwatch and grenades.
4. **Ship (7d).** Polish, Loom, Skool post. No mobile sizing, no shop, no new enemy classes.

Master stays shippable every night: the v1 cut is already a complete game.

## Strategic layer

### Regions
Eight, fixed: North America, South America, Europe, Middle East, Africa, Russia, Asia, Oceania.
Each has three meters, 0 to 100: **Subvert**, **Force**, **Enlighten**. A region is **held**
when any meter reaches 100. Each region also has a **Resistance** value that bleeds every meter
by a small amount per turn and a **Wealth** value that feeds the treasury once held.

### Turns
One campaign turn is one month. Per turn the player:
- Assigns at most one action per region (limited by **Agents**, starting at 3, +1 per two held
  regions).
- Picks or continues one research node (research points per turn from the treasury).
- Resolves any event card that fires.
- Ends the turn: meters move, treasury updates, Exposure updates, missions may unlock.

### Actions (cost treasury, move a meter)
| Path | Action | Effect | Exposure |
|---|---|---|---|
| Subvert | Buy the media | +Subvert | low |
| Subvert | Install a loyal leader | +Subvert big, needs Subvert ≥ 50 | medium |
| Subvert | Found a movement | +Subvert, +Enlighten small | low |
| Force | Arm a faction | +Force | medium |
| Force | Coup | +Force big, needs Force ≥ 50, needs Weaponry I | high |
| Enlighten | Fund abundance projects | +Enlighten, reduces Resistance | none |
| Enlighten | Open the archives | +Enlighten big, needs Psychology II | negative (lowers Exposure) |

### Exposure
0 to 100. Force and subversion raise it, Enlighten lowers it, the "Media Empire" research
node halves gains. At 100 the conspiracy is exposed: game over.

### Research (disciplines → nodes)
- **Psychology**: I Mass Persuasion (unlocks Buy the media at double effect) → II Manufactured
  Consent (unlocks Open the archives; Subvert actions cost less Exposure).
- **Weaponry**: I Private Armies (unlocks Coup) → II Plasma Small Arms (needs alien artefact;
  squad weapons upgrade in missions).
- **Cybernetics**: I Surveillance Net (see all region meters exactly; otherwise fuzzy) → II
  Neural Lace (+1 agent) → III **AGI** (needs Aurichalcum; win condition).
- **Mythology**: I Lost Archives (reveals the Atlantis mission) → II Atlantis Expedition (the
  mission itself, on success grants Aurichalcum) → III Aurichalcum Electronics (+50% research
  speed, prerequisite for AGI).

### Events (fire once, on a condition)
1. **The Candidate**: when Subvert in North America ≥ 40. Choose: install the reality-TV star
   (+30 Subvert NA, +10 Exposure, unlock "Favourable Law": all Subvert actions cheaper) or
   pass.
2. **The Leak**: turn 3. Area 51 mission unlocks. Ignore it and Exposure +15.
3. **Whistleblower**: when Exposure ≥ 60. Pay treasury to bury it, or lose 20 Subvert in the
   most-subverted region.
4. **Miracle at the Well**: when any Enlighten ≥ 50. +Enlighten in two neighbouring regions.
5. **The Summit**: when 3 regions are held. Rival cabal offers a pact: +1 agent for +20
   Exposure, or refuse.

### Missions (world → tactical)
- **Area 51 Hangar**: unlocked by The Leak. Map: hangar interior, crates as cover, a guarded
  artefact tile. Win by reaching the artefact with any soldier and surviving 2 more rounds, or
  by killing all guards. Reward: alien artefact (Weaponry II prerequisite), −Exposure 10.
- **Atlantis Ruins**: unlocked by Mythology II. Map: flooded ruins, pillars as cover, the
  formula tile. Same objective shape. Reward: Aurichalcum.
Losing a mission costs the squad and 20 treasury; the mission can be retried next turn with a
fresh squad.

### Win / lose
Win: 5 regions held, or AGI researched. Lose: Exposure reaches 100. Show the ending screen
that matches the dominant path (Subvert: "The Quiet Throne", Force: "Pax Illuminata",
Enlighten: "The Long Dawn", AGI: "The Machine Ascends").

## Tactical layer (already built as the 2D prototype)

Rules unchanged from slice 1: 4-soldier squad, 2 AP per turn, move up to 4 tiles or shoot,
hit chance from accuracy, distance and cover, alien/guard AI, seeded RNG. Slice 3 gives it an
isometric look. Missions add an objective tile and a "reach and hold" win condition.

## Architecture

- `src/game/` pure rules, no Phaser. Tactical rules already there. Strategic rules go in
  `src/game/strategy/`: `types.ts`, `data.ts` (regions, actions, research, events),
  `campaign.ts` (createCampaign, assignAction, chooseResearch, resolveEvent, endTurn,
  checkOutcome), all pure, seeded, unit-tested.
- `src/render/`: `TitleScene`, `WorldScene` (map, meters, action picker, research panel,
  event modal), `BattleScene` (isometric from slice 3), `EndingScene`. Scene flow:
  Title → World ⇄ Battle → Ending.
- Campaign save in `localStorage` under one key; a "New game" button wipes it.
- `scripts/playtest.ts` gains a campaign mode: random-policy campaigns to check average
  turns-to-win and lose rate.

## Slices

| # | Slice | Owner | Status |
|---|---|---|---|
| 0 | Scaffold, deploy, docs | conductor | done |
| 1 | 2D tactical prototype | conductor | done |
| 2 | Strategic layer: regions, actions, treasury, exposure, turns, world screen | worker → critic | done 20 Sep |
| 3 | Isometric renderer for missions | worker → critic | done 20 Sep |
| 4 | Research tree and event cards | worker → critic | done 20 Sep |
| 5 | Two missions wired from the world, objective tiles, rewards, endings | worker → critic | done 20 Sep |
| 6 | Split into 6a, 6b, 6c below | | |

Dates: slice 2 by 23 Sep, slice 3 by 25 Sep, slice 4 by 26 Sep, slice 5 by 28 Sep, ship 29 Sep.

Cut order if late: Atlantis becomes a second map on the Area 51 tileset; events drop to 3
(Candidate, Leak, Whistleblower); Enlighten becomes a passive meter fed only by research.

## Polish debt for 7d (Athena, 23 Sep)

1. Offers panel hides Europe's and Russia's region cards; reposition or resize.
2. Reserve space so offer text cannot run under LAUNCH.
3. Objective-specific victory banners: TARGET DOWN, ITEM EXTRACTED.

## Balance notes for slice 6

- The AI-vs-AI tactical harness is diagnostic only; it wins ~100% with honest enemy HP. Human
  playtest is the gate (Athena ruling, 20 Sep). Campaign playtest must check that treasury
  depletion is a recoverable setback, not a dead end.
- Campaign random-policy win rate is 42.7% after slice 5 (target band 10 to 40%): mission
  auto-wins, the artefact exposure reward and the plasma upgrade all help the player. Retune
  alongside the AGI pacing. (Athena, 20 Sep, deferred from slice 5.)
- `CAMPAIGN_REGISTRY_KEY` lives in `EndingScene.ts`; move it to a small shared module when
  next touching the scene glue.
- AGI route needs about 168 research points; at 8 base points per turn that is 15 to 20 turns
  against roughly 10 turns for a five-region win. Raise base points or lower late-node costs so
  the two routes finish within a few turns of each other. (Athena, 20 Sep, deferred from slice 4.)
- Starting treasury of 400 against action costs of 8 to 16 means money never binds. (Deferred
  from slice 2.)
- Region meter labels are 8px; too small on a phone. Floor sprite chevrons and reach-highlight
  contrast in the battle scene. (Deferred from slices 2 and 3.)

## Art direction (decided 20 Sep after the first playtest)

Reference: Syndicate (1993) and the game's splash screen (`public/assets/art/splash.png`,
generated by the designer). Dark, warm-lit, dense. Gold and black HUD with thin gold rules;
research and help screens in green CRT phosphor with scanlines; agent portraits in framed cards
in the side panel. Real continent outlines on a night-earth map for the world screen. Kenney
Isometric Miniature packs (CC0) for battle tiles and units, generated backdrops and
illustrations for title, briefings and events (prompts in `docs/ART-PROMPTS.md`). Nothing flat
grey, no bare rectangles, nothing important under 11px, every screen readable at 1280x720.

## Slice 6 split

| # | Slice | Owner | Status |
|---|---|---|---|
| 6a | Balance against a human + explanation layer (title, help, hints, briefings, hover text, save/load) | worker → critic | merged 20 Sep; human difficulty gate still pending Sean's playtest |
| 6b | The war-room look (map, HUD theme, CRT research, miniatures, portraits, event art) | worker → critic | merged 20 Sep |
| 6c-tactics | Directional cover, holding guards, timed reinforcements, 20x20/22x22 maps, camper gate, 6b nits | worker → critic | merged 23 Sep; human difficulty gate open |
| 7a-rules | Objective types (hold/recover/assassinate/clash), smart and flee stances, map generator, missions harness | worker → critic | merged 23 Sep |
| 7a-campaign | Offers per region, rewards, agent cost, saves, world and battle UI, manual assassination gate | worker → critic | merged 23 Sep |
| 7b | Persistent squad, roster, promotions, replacements | worker → critic | building |
| 7a-spawn | Missions spawn from actions, max two open, expiry, panel moved into the HUD | worker → critic | after 7b |
| 7c | Overwatch and grenades | worker → critic | |
| 7d | Polish, Loom, Skool post | conductor | last |
