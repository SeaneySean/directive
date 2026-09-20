# Slice 6a — make it fair and make it explain itself

Branch: `slice/6a-balance-explain`. Owner: Orpheus. Reviewer: the critic.
Depends on slice 5 (merged). Runs before the art pass (6b) and must not block on it.

## Why

A first playtest by the designer: lost the Area 51 hangar four times in a row on a small map,
and could not tell what was happening or why. Every system exists; none of it is explained,
and the first mission is tuned against a dumb AI squad instead of a person.

## Acceptance criteria

### Balance (pure rules, `src/game/`)

1. Area 51 Hangar: three guards, not four. Guard rifle: accuracy 60, damage 4, range 7. Squad
   HP 12. The squad starts behind a line of cover tiles, and the route to the objective has
   cover every 3 to 4 tiles. Objective moves nearer the middle of the far half, not the corner.
2. Atlantis Ruins: four guardians, not five; guardian accuracy 60. Same cover-route rule.
3. Farmstead is no longer used in the campaign; keep it for the dev harness only.
4. A smarter squad policy in `src/game/ai.ts` for the harness only (`squadPolicy`): prefer a
   reachable tile that is in cover from the nearest enemy, focus fire on the lowest-HP visible
   enemy, and move toward the objective tile when no shot is available. `scripts/playtest.ts`
   uses it for the squad side. Report both the old random-ish policy and the new one.
5. Targets with the new policy: Area 51 between 55% and 75% squad wins, Atlantis between 45%
   and 70%. Tune numbers in `scenarios.ts` until both land. Record the final lines.
6. Campaign: research base points 8 → 12, and Neural Lace also grants +4 research points per
   turn, so the AGI route finishes within 3 turns of a five-region win in the harness. Starting
   treasury 400 → 160. Campaign random policy target: 15% to 35% wins.

### Explanation layer (`src/render/`, plus small pure helpers in `src/game/strategy/text.ts`)

7. `TitleScene`: shows `public/assets/art/splash.png` scaled to fit 1280x720 (letterbox, keep
   aspect). The image has a baked-in menu box around x 640 to 890, y 630 to 850 in its native
   1536x1024 space; paint an opaque panel over that box in the same dark tone with a thin gold
   border, and draw our own buttons on it: NEW GAME, CONTINUE (only when a save exists),
   HOW TO PLAY, CREDITS. Boot scene is now Title.
8. HOW TO PLAY: one overlay, four short panels a player can page through: the goal (hold 5
   regions or reach AGI before Exposure hits 100), the three paths and what each costs in
   Exposure, research and missions in two lines each, and battle controls. Plain English, no
   more than 40 words per panel. The same overlay opens from a "?" button on the world screen.
9. First-turn guide on the world screen: on turn 1 of a new game, a dismissible strip at the
   top says what to do now: "Pick a region, assign an action, then END TURN. Watch Exposure."
   It changes on turn 2 to point at research, and disappears after that.
10. Hover text everywhere: every action shows what it does and its Exposure cost; every
    research node shows what it unlocks in one sentence; every region shows Resistance and
    Wealth in words ("Resists slowly, pays well"). Put the sentences in `text.ts`, not inline.
11. Event cards: each gets a two-sentence context paragraph and each choice label gets a
    consequence in brackets, e.g. "Install the candidate (+30 Subvert NA, +10 Exposure,
    cheaper Subvert actions)". Text lives in `text.ts`.
12. Mission briefing: LAUNCH opens a briefing panel before the battle: mission name, one
    paragraph of why, the objective in one line, the two ways to win, the enemy count, and
    GO / BACK. Debrief after the battle, before returning to the world: result, what was
    gained or lost, casualties.
13. Battle screen: a persistent hint line under the panel that changes with state: "Select a
    soldier", "Green tiles: move (1 AP). Hover an enemy for hit chance", "Stand next to a crate
    for cover: enemies hit you 30% less", "Objective: hold the gold tile for 2 of your turns".
    Show the objective tile's meaning in the panel: "Reach the gold tile and hold it".
14. Save/load: campaign state saved to `localStorage` on every world-screen state change and on
    return from a battle; CONTINUE restores it; NEW GAME clears it after a confirm.
15. `bun test`, `bun run build` green. Tests for the new policy, the tuned scenarios, text
    lookups for every action, node and event, and save round trip (pure serialisation helper).

## Files expected to change

`src/game/scenarios.ts`, `src/game/ai.ts`, `src/game/strategy/research.ts`, `data.ts`,
new `src/game/strategy/text.ts` and `save.ts`, `scripts/playtest.ts`, new
`src/render/TitleScene.ts`, `HelpOverlay.ts`, `BriefingScene.ts` (or panels inside
WorldScene), edits to `WorldScene.ts` and `BattleScene.ts`, `src/main.ts`.

## Out of scope

Any art beyond the splash (that is slice 6b). Sound. Mobile layout. New mechanics.
