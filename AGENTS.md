# Rules for agents working in this repo

This repo is built by a triad: a **conductor** (Athena, GPT-6 Astra via Hermes) writes the
slice briefs in `tasks/` and decides what merges, a **worker** (Orpheus, DeepSeek V4 Pro via
Hermes) implements a slice on a branch, a **critic** (Claude Fable 5.1 in Claude Code) reviews
every branch against its brief and merges on the conductor's decision. Read `DESIGN.md` first.

## Hard rules

1. TypeScript strict, as configured. `bun run build` (tsc + vite) must stay green.
2. `bun test` must stay green. New rules need new tests in `src/game/*.test.ts`.
3. `src/game/` never imports Phaser or touches the DOM. Rendering goes in `src/render/`.
4. No new dependencies without the conductor's say-so in the brief.
5. Work on a branch `slice/<n>-<name>`, never on master. Small commits, clear messages.
6. Do not redesign. Implement the brief in `tasks/<slice>.md`. Ambiguity: pick the simplest
   reading and write the assumption in your report.
7. Do not delete or rename existing exports from `src/game/index.ts` without saying so.

## Commands

```
bun install        # once
bun run dev        # http://localhost:5173
bun test           # unit tests
bun run playtest   # headless AI-vs-AI balance report (optional: games, scenario)
bun run build      # production build to dist/
```

## Reporting

Worker report: changed files, assumptions, what was not done, last lines of `bun test` and
`bun run build`, plus the playtest line the brief asks for. Critic report: defects ranked by
severity with file, line and repro; a one-line mergeable / not-mergeable verdict. Conductor:
merge, send back with a numbered fix list, or rewrite the brief.
