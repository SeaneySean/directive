# Slice 6b — the war-room look

Branch: `slice/6b-art`. Owner: Orpheus. Reviewer: the critic.
Depends on slice 6a being merged. Art assets arrive in `public/assets/art/` from the designer
(see `docs/ART-PROMPTS.md`); where an asset is missing, use the fallback named below so the
slice never blocks.

## Direction

Reference: Syndicate (1993) and the game's own splash screen. Dark, warm-lit, dense. Gold and
black HUD with thin gold rules. Research and help screens in green CRT phosphor with scanlines.
Agent portraits in framed cards in the side panel. Nothing flat grey, no default fonts, no
bare rectangles anywhere the player looks.

## Acceptance criteria

1. **World screen**: `public/assets/art/world-map.png` (a dark night-earth map, no text) fills
   the map area. Regions are translucent polygons traced over the real continents (hand-place
   the 8 polygons as point lists in `src/render/world-regions.ts`), tinted by their dominant
   path, with a gold rim when held. Meters become three thin arcs or bars in a small card at
   each region's centroid, with 11px labels minimum. Fallback: keep the rectangles but on the
   map image.
2. **HUD**: one shared style module `src/render/theme.ts`: fonts (a Google font loaded via
   `index.html`, one display face and one monospace), colours, panel drawing helpers (dark panel
   with 1px gold rule and 8px inner padding), button helper (gold fill, black text, hover
   brighten). Every scene uses it. No inline colour literals left in scenes.
3. **Research panel** becomes a CRT screen: green phosphor text on near-black, a scanline
   overlay (a tiled 2px pattern at 8% alpha), node cards as green outlined boxes, the active
   node pulsing. Same treatment for HOW TO PLAY.
4. **Event cards** show `public/assets/art/event-<id>.png` on the left (fallback: a gold
   triangle glyph) with the text on the right.
5. **Battle screen**: replace the three cubes with Kenney's Isometric Miniature packs (CC0):
   floor tiles with texture, walls, crates, pillars for Atlantis, water tiles for the ruins
   edge. Units become sprites: Kenney miniature characters if the pack has them, otherwise
   generated sprites from `public/assets/art/units/` (see prompts), scaled to the 60x30 tile.
   Squad units get a coloured base ring; enemies a red one. The objective tile gets a gold
   pulsing beacon sprite. Fog: tiles beyond 8 of any squad unit are drawn at 40% brightness.
6. **Side panel in battle**: four agent portrait cards (`public/assets/art/portraits/*.png`,
   fallback: initials on a gold disc) with HP and AP bars, in the Syndicate framed style.
7. **Title, briefing, debrief, ending** use the splash palette: black, gold, white text,
   with `public/assets/art/briefing-<mission>.png` behind the briefing text (fallback: dark
   panel).
8. Every screen stays readable at 1280x720; nothing important under 11px.
9. `bun test`, `bun run build` green. Credits file updated for every pack used.

## Out of scope

New mechanics, sound, mobile layout, animation beyond the beacon pulse and button hover.
