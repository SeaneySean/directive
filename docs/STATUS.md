# Illuminatus — status (kept current by the critic)

Last updated: 23 Sep 2026, 18:30. Deadline: 30 Sep 2026.

## Where things are

| Slice | What | State |
|---|---|---|
| 0–5 | Scaffold, tactical prototype, world layer, isometric render, research + events, missions + endings | merged on master |
| 6a | Balance against a human + explanation layer (title screen with your splash, How To Play, first-turn guide, hover text, event context, mission briefing and debrief, battle hints, save/load) | merged on master |
| 6a+ | Mission maps redrawn by hand after "still unplayable": open floors, scattered cover, three-hit guards | on master, needs your playtest |
| 6b | The war-room look (night-earth map, gold HUD, CRT research, Kenney miniatures, your sprites, portraits, event art) | merged on master |
| 6c-tactics | Directional cover, holding guards, reinforcements, bigger maps | merged; hangar eased again after "too far the other way", objective now a light column |
| 7a-rules | The three mission types and the map generator as rules (not yet visible in the game) | merged |
| 7a-campaign | Missions offered per region on the world map, rewards, the UI for all three types | merged; PLAY THIS |
| 7b | Persistent squad: HP and kills carry over, promotions, deaths cost | Orpheus building now |
| 7a-spawn | Your 23 Sep note: missions spawn from your actions, one or two open at a time, panel out of the map | brief written, runs right after 7b |
| 7c | Overwatch and grenades | after 7b |
| 7d | Polish, Loom, Skool post | last |
| 6c-ship | Mobile sizing, Loom, Skool post | last |

## What I need from Sean

1. **Play the new build.** The world map now offers a mission in every region every turn
   (recover technology, assassination, rival cabal), each costing an agent. Play two or three
   and report each in one line (type, won or lost, soldiers lost, turns). Also the hangar if
   you haven't:
   `cd ~/games/illuminatus-play && bun run dev` (the copy is already on the new build).
   Watch for: guards now stay by their cover; from round 4 the alarm brings extra guards at
   the far wall; camping no longer wins. Atlantis unlocks from the Mythology research route.
2. Still outstanding from earlier: `gh auth refresh -h github.com -s workflow` so the Pages
   deploy can go live; the judges need a link.

## Things worth knowing

- Every Hermes run today used gpt-5.6 on your ChatGPT login, not DeepSeek: the Hermes CLI
  ignores the model set in a persona file. That is what hit your cap. Fixed by passing the
  provider and model explicitly on every call from now on.
- The AI-vs-AI harness cannot judge human difficulty (the AI squad uses cover perfectly and
  wins nearly always with honest stats). Your playtest is the gate for mission difficulty.
- Guards now take five rifle hits at 60% accuracy and 4 damage; soldiers have 12 HP; cover
  runs along the route; the objective is mid-map. The old version had four 75%-accuracy
  guards, 10 HP soldiers, and the objective in the far corner.

## How to read progress without scrolling

This file, plus `git log --oneline` in the repo. The critic updates this file on every merge.
