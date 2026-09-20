# Asset credits

## Designer-generated art (GPT Image)

All files under `public/assets/art/` are original generated artwork supplied by the
designer for this project (see `docs/ART-PROMPTS.md`). They are not third-party assets.

- `splash.jpg`, `world-map.jpg`
- `event-<id>.jpg` (candidate, leak, whistleblower, miracle, summit)
- `briefing-area-51.jpg`, `briefing-atlantis.jpg`
- `portraits/*.jpg` (cole, diaz, okafor, reyes)
- `units/*.png` (soldier, guard, guardian, sectoid)

## Kenney Isometric Blocks

- Pack: **Isometric Blocks**
- Author: Kenney Vleugels (Kenney.nl)
- Source: https://kenney.nl/assets/isometric-blocks
- Licence: Creative Commons Zero (CC0 1.0)
- Licence URL: https://creativecommons.org/publicdomain/zero/1.0/

Included files retain their original pack filenames:

- `platformerTile_22.png` — wooden crate/cover
- `platformerTile_30.png` — grey masonry wall
- `platformerTile_35.png` — dark grey floor block

## Kenney Isometric Miniature — Prototype

- Pack: **Isometric Miniature Prototype**
- Author: Kenney Vleugels (Kenney.nl)
- Source: https://kenney.nl/assets/isometric-miniature-prototype
- Licence: Creative Commons Zero (CC0 1.0)
- Licence URL: https://creativecommons.org/publicdomain/zero/1.0/

Used by the battle renderer (`src/render/BattleScene.ts`) for the Area 51 hangar
tileset. Each texture is cropped to its tight bounding box (`scripts/vendor-kenney.py`):

- `battle/floor-hangar.png` — from `Isometric/floor_N.png` (top face)
- `battle/wall-hangar.png` — from `Isometric/block_N.png` (full block)
- `battle/crate.png` — from `Isometric/crate_N.png`

## Kenney Isometric Miniature — Dungeon

- Pack: **Isometric Miniature Dungeon**
- Author: Kenney Vleugels (Kenney.nl)
- Source: https://kenney.nl/assets/isometric-miniature-dungeon
- Licence: Creative Commons Zero (CC0 1.0)
- Licence URL: https://creativecommons.org/publicdomain/zero/1.0/

Used by the battle renderer for the Atlantis ruins tileset (stone floor, stone walls,
column pillars as cover):

- `battle/floor-atlantis.png` — from `Isometric/stone_N.png` (top face)
- `battle/wall-atlantis.png` — from `Isometric/stoneWallStructure_N.png` (full block)
- `battle/pillar.png` — from `Isometric/stoneColumn_N.png`

The decorative water surrounding the Atlantis board is drawn procedurally in the
renderer (no Kenney texture used).
