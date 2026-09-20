# Slice 4 — research tree and event cards

Branch: `slice/4-research-events`. Owner: Orpheus. Reviewer: the critic. Conductor-approved 20 Sep (Athena, 4 revisions applied).
Depends on slice 2 being merged.

## Goal

The campaign gets its second and third systems from DESIGN.md: the 10-node research tree and
the 5 event cards. AGI becomes a win condition.

## Acceptance criteria

1. `src/game/strategy/research.ts`: the 10 nodes in DESIGN.md as data (`id`, `discipline`,
   `cost`, `requires: string[]`, `grants: string[]`), plus `chooseResearch(state, nodeId)`,
   `researchProgress(state)`, and the per-turn progress step called from `endTurn`. Use canonical
   ids `psychology-1`, `psychology-2`, `weaponry-1`, `weaponry-2`, `cybernetics-1`,
   `cybernetics-2`, `cybernetics-3`, `mythology-1`, `mythology-2`, `mythology-3`; normalise
   the existing action `requires` values to those ids. Research points per turn = a fixed base
   plus a fraction of current held-region income; Aurichalcum Electronics multiplies it by 1.5.
   Research costs and the base/fraction constants are yours to pick and tune, but keep them
   together in research data. Nodes that need an item (`alien-artefact`, `aurichalcum`) show as
   locked until `state.items` contains it. AGI requires Cybernetics II, Mythology III and
   `aurichalcum`. For this slice, add a pure dev/test helper `grantItem`; do not expose it in
   `WorldScene`.
2. Research effects wire into existing actions via the `requires` gate from slice 2:
   Coup needs `weaponry-1`, Open the archives needs `psychology-2`, Mass Persuasion doubles
   Buy the media, Manufactured Consent halves Subvert exposure, Surveillance Net makes region
   meters exact (otherwise the UI shows them rounded to the nearest 10), Neural Lace +1 agent.
3. `src/game/strategy/events.ts`: the 5 cards with `when(state)` predicates, `choices` (1 or
   2), and effects as pure functions. Implement the DESIGN.md effects as follows: The Candidate
   offers install or pass; install gives North America +30 Subvert, +10 Exposure and a
   `favourable-law` flag that reduces every Subvert action’s treasury cost by 2, to a minimum
   of 0. The Leak fires on turn 3, records Area 51 as unlocked for slice 5, and offers respond
   or ignore; ignore also gives +15 Exposure. Whistleblower offers pay 30 treasury, when
   affordable, or lose 20 Subvert from the most-subverted region, breaking ties by region data
   order. Miracle at the Well has one acknowledgement choice and gives +15 Enlighten to two
   deterministic neighbours of the first qualifying region; define the neighbour pairs in
   strategy data. The Summit offers accept (+1 permanent bonus agent and +20 Exposure) or
   refuse. Each card fires at most once. `pendingEvent(state)` returns the first unfired card
   in the order listed in DESIGN.md whose condition holds; `resolveEvent(state, choiceIndex)`
   applies it. `endTurn` must not proceed while an event is pending (return the identical state
   reference and let the UI block).
4. `checkOutcome` adds the AGI win and records `endingId` on the state. Exposure ≥100 takes
   precedence and records `exposed`; otherwise completed AGI records `machine-ascends`;
   otherwise 5 held regions records the dominant-path ending. Determine the dominant path by
   summing each influence meter across all regions, with ties resolved Subvert, then Force,
   then Enlighten. Record `quiet-throne`, `pax-illuminata`, or `long-dawn` respectively.
5. Tests: every node reachable in the right order and never out of order; item gates; each
   event fires exactly once under its condition; every event choice and effect; pending events
   block `endTurn`; AGI win, exposure precedence, and deterministic dominant-path endings.
6. `WorldScene`: a RESEARCH panel (four columns, nodes as cards with cost and lock state, one
   active node highlighted) and an event modal that blocks END TURN until resolved.
7. Update the campaign random policy to choose a legal research node when none is active and
   to resolve every pending event before attempting another `endTurn`; it must never stall on
   an unchanged blocked state. `bun test` and `bun run build` green. Playtest `--campaign 300`
   still lands the random policy between 10% and 40% wins.

## Out of scope

Missions, the items actually being earned (slice 5), art, sound, save/load.
