# Slice 5 — missions wired from the world

Branch: `slice/5-missions`. Owner: Orpheus. Reviewer: the critic. Conductor-approved 20 Sep (Athena, 2 revisions applied).
Depends on slices 2, 3 and 4 being merged.

## Goal

The two layers meet. The Leak unlocks the Area 51 mission, Mythology II unlocks Atlantis, each
plays as a tactical battle with an objective tile, and the reward flows back into the campaign.

## Acceptance criteria

1. Two new scenarios in `src/game/scenarios.ts`: `AREA51_HANGAR` (crates as cover, guards
   with rifles, one artefact tile) and `ATLANTIS_RUINS` (pillars as cover, "guardian" units,
   one formula tile). Each has an `objective: { tile: Vec; holdRounds: 2 }` field.
2. Tactical rules gain the reach-and-hold win: if any living squad unit stands on the objective
   tile at the end of the player's turn for `holdRounds` consecutive turns, outcome is `won`.
   Killing every enemy still wins. Tests for both routes and for losing the hold by moving off.
3. `src/game/strategy/missions.ts`: `availableMissions(state)`, `startMission(state, id)`
   (marks it in progress), `completeMission(state, id, result)`. Area 51 is unlocked by
   `state.unlockedMissions` containing `area-51`; Atlantis is unlocked when completed research
   grants `unlock-atlantis`. On an Area 51 win, add `alien-artefact` to `state.items` and reduce
   Exposure by 10; on an Atlantis win, add `aurichalcum` to `state.items`. On loss, deduct 20
   treasury and make the mission retriable from the next turn. Missions are available from the
   turn they unlock.
4. `WorldScene`: a MISSIONS panel listing available and completed missions with a LAUNCH
   button. Launch switches to `BattleScene` with the chosen scenario; the battle's ending
   returns to `WorldScene` and applies the result. Campaign state must survive the round trip
   (pass it through the scene registry, not a global).
5. When completed research grants `plasma-small-arms`, upgrade squad weapons in missions to
   Plasma: range 7, accuracy 75, damage 5. Derive research grants from completed node IDs; grant
   strings are not stored directly in `state.completedResearch`, `state.flags`, or `state.items`.
6. `EndingScene`: four win endings plus the exposed ending, with title, two lines of flavour
   text, and a New Game button. Text for each is in DESIGN.md's names; write the flavour.
7. `bun test`, `bun run build` green. Playtest: a full campaign with the random policy still
   terminates; the tactical harness runs both new scenarios with a squad win rate between 40%
   and 75%.

## Out of scope

Save/load, sound, title screen, mobile layout (slice 6).
