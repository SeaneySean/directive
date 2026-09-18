# Directive — design

Turn-based isometric squad tactics in the spirit of UFO: Enemy Unknown. Built for the
September Comp (deadline 30 Sep 2026). Working title; rename before shipping.

## The one-line pitch

Four soldiers, one map, a handful of aliens. Move, take cover, shoot, end turn. Win when the
aliens are dead, lose when the squad is.

## Rules (MVP)

- Grid map, 16x16. Tiles: floor, wall (blocks movement and sight), cover (blocks movement,
  not sight; a unit standing next to cover on the shooter's side is harder to hit).
- Each unit: HP, action points (AP, 2 per turn), a move range in tiles, a weapon.
- Actions cost 1 AP each: **move** (up to `move` tiles, 4-directional pathing) or **shoot**.
  So a turn is move+shoot, move+move or shoot+shoot.
- Hit chance = weapon accuracy, minus 4% per tile beyond point blank, minus 30% if the target
  is in cover, clamped to 5..95. Shown on hover before you commit.
- Damage is flat per weapon. No armour in the MVP.
- Player turn, then the AI plays every alien, then a new round.
- Win: all aliens dead. Lose: all soldiers dead.

## Layers

- `src/game/` — pure rules. No Phaser imports, ever. Fully unit-tested (`bun test`). State is a
  plain value; every function returns a new state. RNG is seeded so games replay.
- `src/render/` — Phaser scenes. Draws state, translates input into game calls, animates.
- `scripts/playtest.ts` — headless AI-vs-AI balance harness (`bun run playtest`).

## Slices

| # | Slice | Owner | Status |
|---|---|---|---|
| 0 | Scaffold, deploy, docs | conductor | done |
| 1 | 2D prototype: move, shoot, AI, win/lose | conductor | done |
| 2 | Isometric render with Kenney tiles | worker → critic | next |
| 3 | Combat feel: animation, sound, camera, numbers | worker → critic | |
| 4 | Smarter AI, balance via playtest harness | worker → conductor | |
| 5 | Title, result screen, mobile sizing, Loom, submit | conductor | |

Stretch, only after slice 5: fog of war, a second map, overwatch, Syndicate-style persuade,
squad roster with injuries carried between missions.

## Art direction (slice 2+)

Kenney CC0 isometric packs. Muted night palette, high-contrast unit markers, chunky readable
UI in monospace. Squad blue, aliens red, cover amber. Keep every tile readable at 40px.
