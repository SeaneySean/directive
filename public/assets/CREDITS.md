# Asset credits

## Designer-generated art (GPT Image)

All files under `public/assets/art/` are original generated artwork supplied by the
designer for this project (see `docs/ART-PROMPTS.md`). They are not third-party assets.

- `splash.jpg`, `world-map.jpg`
- `event-<id>.jpg` (candidate, leak, whistleblower, miracle, summit)
- `briefing-area-51.jpg`, `briefing-atlantis.jpg`
- `portraits/*.jpg` (cole, diaz, okafor, reyes)
- `units/*.png` (soldier, guard, guardian, sectoid, operative)
- `briefing-recover.jpg`, `briefing-assassinate.jpg`, `briefing-clash.jpg`
- `portraits/guard.jpg`, `guardian.jpg`, `operative.jpg`, `target.jpg`
- `ui/mission-glyph.png`, `ui/world-alert.png`

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

## Kenney Isometric Tiles: Buildings (city district tileset)

- Pack: **Isometric Tiles: Buildings**
- Author: Kenney Vleugels (Kenney.nl)
- Source: https://kenney.nl/assets/isometric-tiles-buildings
- Licence: Creative Commons Zero (CC0 1.0)
- Licence URL: https://creativecommons.org/publicdomain/zero/1.0/

Vendored for the district (generated-mission) renderer, cropped to each tile's tight
bounding box (`scripts/vendor-city.py`). The brief names this "Kenney's Isometric
City"; there is no pack by that exact name, so the city-building pack and the Isometric
Miniature: Prototype pack (below) cover the requested texture set:

- `battle/city-wall.png` — from `buildingTiles_000.png` (a building block: roof top + two windowed facades)
- `battle/city-roof.png` — from `buildingTiles_005.png` (flat roof top face)
- `battle/city-prop-tree.png`, `city-prop-tree2.png` — from `buildingTiles_057.png` / `buildingTiles_061.png` (street trees)
- `battle/city-door.png` — from Isometric Miniature: Prototype `doorOpen_N.png` (open doorway)
- `battle/city-prop-crate.png` — from Isometric Miniature: Prototype `crate_N.png`
- `battle/city-road.png` / `city-pavement.png` — flat ground top faces from Isometric Miniature: Prototype `floor_N.png`, tinted per surface (road / pavement) by the renderer
