# Slice 2 — strategic layer and world screen

Branch: `slice/2-world`. Owner: Orpheus. Reviewer: the critic.

## Goal

The campaign loop exists and is playable without research or events: regions, three influence
paths, actions, treasury, exposure, turns, win and lose. Read DESIGN.md "Strategic layer" first;
this brief only narrows it.

## Acceptance criteria

1. `src/game/strategy/types.ts`, `data.ts`, `campaign.ts` exist. No Phaser imports. All state
   is a plain value; every function returns a new state. RNG uses `src/game/rng.ts`.
2. `data.ts` holds the 8 regions from DESIGN.md with starting Resistance and Wealth, and the 7
   actions with their costs, meter effects and exposure deltas. Numbers are yours to pick;
   keep them in one place.
3. `campaign.ts` exports at least: `createCampaign(seed)`, `assignAction(state, regionId,
   actionId)`, `clearAction(state, regionId)`, `endTurn(state)`, `checkOutcome(state)`,
   `heldRegions(state)`. Actions that need a research node are simply unavailable in this
   slice (research arrives in slice 4); leave the gate as a `requires?: string` field.
4. `endTurn` applies actions, bleeds meters by Resistance, adds Wealth of held regions to the
   treasury, moves Exposure, increments the turn, recomputes agents (3 + floor(held / 2)).
5. `src/game/strategy/campaign.test.ts` covers: action limits by agents, treasury cannot go
   negative, a region becomes held at 100, win at 5 held, lose at Exposure 100, endTurn is
   deterministic for a seed.
6. `src/render/WorldScene.ts`: a flat stylised map (8 clickable region rectangles or polygons
   laid out roughly like a world map is fine), each showing three meter bars and a held badge.
   Clicking a region opens an action list with costs; picking one assigns it. A side panel
   shows turn, treasury, agents used/available, Exposure bar, and an END TURN button. Win and
   lose show a full-screen banner with a New Game button.
7. `src/main.ts` boots into WorldScene. BattleScene stays registered but is not reachable
   yet (slice 5 wires missions).
8. `scripts/playtest.ts` gains `--campaign N`: random legal actions each turn, reports win
   rate, lose rate and mean turns. Target for this slice: a random policy should win between
   10% and 40% of the time within 40 turns. Tune numbers in `data.ts` until it does.
9. `bun test` and `bun run build` green.

## Out of scope

Research, events, missions, save/load, art assets, sound, the isometric renderer.
No new npm dependencies.

## Report

Per AGENTS.md. Include the playtest line for `--campaign 300`.
