# Slice 4 — research tree and event cards

Branch: `slice/4-research-events`. Owner: Orpheus. Reviewer: the critic.
Depends on slice 2 being merged.

## Goal

The campaign gets its second and third systems from DESIGN.md: the 10-node research tree and
the 5 event cards. AGI becomes a win condition.

## Acceptance criteria

1. `src/game/strategy/research.ts`: the 10 nodes in DESIGN.md as data (`id`, `discipline`,
   `cost`, `requires: string[]`, `grants: string[]`), plus `chooseResearch(state, nodeId)`,
   `researchProgress(state)`, and the per-turn progress step called from `endTurn`. Research
   points per turn = a fixed base plus a fraction of treasury income; Aurichalcum Electronics
   multiplies it by 1.5. Nodes that need an item (`alien-artefact`, `aurichalcum`) show as
   locked until `state.items` contains it. For this slice, add a dev-only `grantItem` so the
   tree can be completed without missions.
2. Research effects wire into existing actions via the `requires` gate from slice 2:
   Coup needs `weaponry-1`, Open the archives needs `psychology-2`, Mass Persuasion doubles
   Buy the media, Manufactured Consent halves Subvert exposure, Surveillance Net makes region
   meters exact (otherwise the UI shows them rounded to the nearest 10), Neural Lace +1 agent.
3. `src/game/strategy/events.ts`: the 5 cards with `when(state)` predicates, `choices` (1 or
   2), and effects as pure functions. Each fires at most once. `pendingEvent(state)` returns
   the first unfired card whose condition holds; `resolveEvent(state, choiceIndex)` applies it.
   `endTurn` must not proceed while an event is pending (return state unchanged and the UI
   blocks).
4. `checkOutcome` adds the AGI win. Ending id recorded on the state: `quiet-throne`,
   `pax-illuminata`, `long-dawn`, `machine-ascends`, or `exposed`.
5. Tests: every node reachable in the right order and never out of order; item gates; each
   event fires exactly once under its condition; both choices of The Candidate; AGI win.
6. `WorldScene`: a RESEARCH panel (four columns, nodes as cards with cost and lock state, one
   active node highlighted) and an event modal that blocks END TURN until resolved.
7. `bun test`, `bun run build` green. Playtest `--campaign 300` still lands the random policy
   between 10% and 40% wins.

## Out of scope

Missions, the items actually being earned (slice 5), art, sound, save/load.
