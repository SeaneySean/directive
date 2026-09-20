# Illuminatus — status (kept current by the critic)

Last updated: 20 Sep 2026, evening. Deadline: 30 Sep 2026.

## Where things are

| Slice | What | State |
|---|---|---|
| 0–5 | Scaffold, tactical prototype, world layer, isometric render, research + events, missions + endings | merged on master |
| 6a | Balance against a human + explanation layer (title screen with your splash, How To Play, first-turn guide, hover text, event context, mission briefing and debrief, battle hints, save/load) | built and verified on branch `slice/6a-balance-explain`, waiting for a merge decision |
| 6b | The war-room look (night-earth map, gold HUD, CRT research, Kenney miniatures, portraits, event art) | brief written, starts after 6a merges and your images are in |
| 6c | Mobile sizing, Loom, Skool post | last |

## What I need from Sean

1. **Images** into `/home/sean/games/directive/public/assets/art/` with the exact names in
   `docs/ART-PROMPTS.md` (portraits into `art/portraits/`). Missing ones fall back to placeholders.
2. **Playtest the hangar** on the 6a branch and say whether it now feels fair:
   `cd ~/games/directive && git checkout slice/6a-balance-explain && bun run dev`
3. **Say "merge 6a"** (or wait for Athena once your ChatGPT cap resets) so 6b can start.
4. Still outstanding from earlier: `gh auth refresh -h github.com -s workflow` so the Pages
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
