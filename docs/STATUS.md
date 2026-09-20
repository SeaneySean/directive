# Illuminatus — status (kept current by the critic)

Last updated: 20 Sep 2026, 16:40. Deadline: 30 Sep 2026.

## Where things are

| Slice | What | State |
|---|---|---|
| 0–5 | Scaffold, tactical prototype, world layer, isometric render, research + events, missions + endings | merged on master |
| 6a | Balance against a human + explanation layer (title screen with your splash, How To Play, first-turn guide, hover text, event context, mission briefing and debrief, battle hints, save/load) | merged on master |
| 6a+ | Mission maps redrawn by hand after "still unplayable": open floors, scattered cover, three-hit guards | on master, needs your playtest |
| 6b | The war-room look (night-earth map, gold HUD, CRT research, Kenney miniatures, portraits, event art) | Orpheus building it now on DeepSeek; all 17 of your images are in and compressed |
| 6c | Mobile sizing, Loom, Skool post | last |

## What I need from Sean

1. **Playtest the hangar** (the redrawn map) and say whether it is fair now. Use the play copy,
   never the main folder while a worker run is live:
   `cd ~/games/illuminatus-play && git checkout --detach origin/master && bun run dev`
   (run `git fetch` first to pick up anything new). Reach the gold tile under the craft and
   hold it two turns, or kill the three guards.
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
