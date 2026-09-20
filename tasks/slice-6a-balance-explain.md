# Slice 6a — make it fair and make it explain itself

Branch: `slice/6a-balance-explain`. Owner: Orpheus. Reviewer: the critic. Conductor-approved 20 Sep (Athena, 7 revisions applied).
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
4. Add an exported `squadPolicy(state, unitId)` in `src/game/ai.ts` for the harness only.
   Refactor `runTeamTurn` to accept an optional policy callback, defaulting to the existing
   `decide`, so `BattleScene` enemy behaviour does not change. In the harness, aliens always use
   `decide`; the baseline squad also uses `decide`, while the smart squad uses `squadPolicy`.
   The smart policy shoots the lowest-HP enemy for which a legal shot exists (break ties by
   higher hit chance, then unit id). When no shot exists, it chooses a reachable tile that
   reduces path distance to the objective, preferring tiles that are in directional cover from
   the nearest enemy; without an objective, fall back to the existing movement policy. Report
   both the labelled baseline and smart-policy results.
5. (Amended by Athena at merge, 20 Sep.) Run seeds 1 through 1000 for each mission and retain
   all four labelled baseline/smart-policy result lines. These rates are diagnostic, not
   acceptance bands. Campaign guards and guardians must have no more than 24 HP; preserve the
   statistics fixed by criteria 1 and 2. The designer's next human playtest is the difficulty
   gate. If either mission remains too hard or too easy, issue a focused follow-up balance brief.
6. Campaign: research base points 8 → 12, Neural Lace grants +4 research points per turn, and
   starting treasury changes from 400 → 160. Extend the harness with deterministic five-region
   and AGI-priority policies and report each policy's mean winning turn over seeds 1 through
   1000; their means must differ by at most 3 turns. The AGI policy must follow the required
   Mythology/Cybernetics chain and auto-complete available missions using the existing campaign
   harness convention. If the specified research-income changes do not meet the pacing target,
   tune late-node research costs while preserving prerequisites, as authorised by `DESIGN.md`.
   The existing random campaign policy must produce 15% to 35% wins over the same 1000 seeds.
   Record the two route lines and the random-policy line.

### Explanation layer (`src/render/`, plus small pure helpers in `src/game/strategy/text.ts`)

7. `TitleScene`: shows `public/assets/art/splash.png` scaled to fit 1280x720 (letterbox, keep
   aspect). The image has a baked-in menu box around x 640 to 890, y 630 to 850 in its native
   1536x1024 space; paint an opaque panel over that box in the same dark tone with a thin gold
   border, and draw our own buttons on it: NEW GAME, CONTINUE (only when a valid save exists),
   HOW TO PLAY, CREDITS. CREDITS opens a dismissible overlay containing the shipped asset
   attribution from `public/assets/CREDITS.md`. Boot scene is now Title.
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
14. Save/load: add pure versioned serialisation/deserialisation helpers in
    `src/game/strategy/save.ts`. A malformed, unsupported or structurally invalid save is treated
    as absent and must not expose CONTINUE. Save campaign state to `localStorage` after every
    campaign-state mutation on the world screen and immediately after applying a battle result;
    CONTINUE restores it. NEW GAME asks for confirmation only when a valid save exists, then
    clears both persisted and registry state before creating a campaign. Move
    `CAMPAIGN_REGISTRY_KEY` out of `EndingScene.ts` into a small shared scene-glue module and use
    it from Title, World, Battle and Ending scenes.
15. `bun test`, `bun run build` green. Tests cover smart-policy target selection, objective
    movement and directional-cover preference; fixed scenario counts/statistics; text lookups for
    every action, research node, event context and event choice; and save round trip plus rejection
    of malformed, unsupported and structurally invalid saves. Keep the 1000-seed statistical
    balance checks in `scripts/playtest.ts`; report their final lines rather than adding flaky
    percentage assertions to the unit suite.

## Files expected to change

`src/game/scenarios.ts`, `src/game/ai.ts`, `src/game/strategy/research.ts`, `data.ts`,
new `src/game/strategy/text.ts` and `save.ts`, `scripts/playtest.ts`, new
`src/render/TitleScene.ts`, `HelpOverlay.ts`, `BriefingScene.ts` (or panels inside
`WorldScene`), a small shared scene-glue key module, edits to `WorldScene.ts`,
`BattleScene.ts`, `EndingScene.ts`, and `src/main.ts`.

## Out of scope

Any art beyond the splash (that is slice 6b). Sound. Mobile layout. New mechanics.
