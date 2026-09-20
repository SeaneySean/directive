# Illuminatus — design

A conspiracy strategy game in the browser. You are one of the Illuminati. Take the world, region
by region, by subversion, by force, or by giving everyone so much that they stop resisting. Fund
research from cybernetics to mythology, dig alien tech out of Area 51, find the Aurichalcum
formula in Atlantis, and put a reality-TV star in the White House when a law needs passing.

Blend: Syndicate (1993) and UFO: Enemy Unknown (1994). A strategic world layer feeds turn-based
isometric squad missions. Built for the September Comp, deadline **30 Sep 2026**.

## Comp cut (what ships)

Two layers, two missions, one campaign that can be won or lost in 20 to 30 minutes.

1. **World screen**: 8 regions, 3 influence paths per region, one action per region per turn.
2. **Research tree**: 10 nodes across 4 disciplines, one of which ends in AGI.
3. **Events**: 5 scripted cards that fire on conditions.
4. **Two tactical missions** launched from the world: Area 51 hangar, Atlantis ruins.
5. **Win** by holding 5 regions or reaching AGI. **Lose** when Exposure hits 100.

Everything else in the premise (more regions, dictators as units, 3D, a full Syndicate-style
real-time layer) is the sequel.

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
| 3 | Isometric renderer for missions | worker → critic | next |
| 4 | Research tree and event cards | worker → critic | |
| 5 | Two missions wired from the world, objective tiles, rewards, endings | worker → critic | |
| 6 | Title screen, save/load, balance pass, mobile sizing, Loom, submit | conductor | |

Dates: slice 2 by 23 Sep, slice 3 by 25 Sep, slice 4 by 26 Sep, slice 5 by 28 Sep, ship 29 Sep.

Cut order if late: Atlantis becomes a second map on the Area 51 tileset; events drop to 3
(Candidate, Leak, Whistleblower); Enlighten becomes a passive meter fed only by research.

## Art direction

Kenney CC0 packs for tiles and UI. World screen is a dark, flat, stylised map with region
polygons and three thin meter bars per region. Palette: near-black ground, gold for Subvert,
red for Force, cyan for Enlighten, violet for research. Monospace UI, all-caps captions, no
gradients. Every screen readable at 1280x720 and on a phone in landscape.
