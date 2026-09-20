# Slice 6b — the war-room look

Branch: `slice/6b-art`. Owner: Orpheus. Reviewer: the critic. Conductor-approved 20 Sep (Athena, 4 revisions applied).
Depends on slice 6a being merged. All art assets are in `public/assets/art/` (web-compressed: opaque images are `.jpg`, the four
unit sprites are 512px RGBA `.png` with transparent backgrounds in `units/`, portraits are 512px
`.jpg` in `portraits/`, the splash is `splash.jpg`). All 17 designer assets are present. The Kenney Isometric Miniature terrain packs required by
criterion 5 still need acquiring; only the three existing Isometric Blocks textures are currently
shipped. Vendor only the textures used, with source and CC0 attribution in
`public/assets/CREDITS.md`; no new package dependencies. Keep the named fallbacks so failed image
loads never blank a screen.

## Direction

Reference: Syndicate (1993) and the game's own splash screen. Dark, warm-lit, dense. Gold and
black HUD with thin gold rules. Research and help screens in green CRT phosphor with scanlines.
Agent portraits in framed cards in the side panel. Nothing flat grey, no default fonts, no
bare rectangles anywhere the player looks.

## Acceptance criteria

1. **World screen**: `public/assets/art/world-map.jpg` (a dark night-earth map, no text) fills
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
4. **Event cards** show `public/assets/art/event-<id>.jpg` on the left (fallback: a gold
   triangle glyph) with the text on the right.
5. **Battle screen**: replace the three cubes with Kenney's Isometric Miniature packs (CC0):
   textured floors, walls and crates; in Atlantis, render existing cover tiles as pillars and add
   decorative water outside the playable grid. Preserve all scenario rows, unit statistics, spawn
   positions and objectives. Do not add tile kinds or change movement, cover or line-of-sight rules. Units become sprites from `public/assets/art/units/` (`soldier.png`, `guard.png`,
   `guardian.png`, `sectoid.png`, 512px RGBA, facing down-right), scaled so a unit stands about
   1.6 tiles tall on the 60x30 diamond with its feet at the tile centre.
   Squad units get a coloured base ring; enemies a red one. The objective tile gets a gold
   pulsing beacon sprite. Cosmetic distance dimming only: draw terrain at 40% brightness when its Chebyshev distance
   from every living squad unit exceeds 8. Do not hide enemies or change targeting, hit previews,
   movement, AI or information availability. Keep units, selection, reachable-tile highlights and
   the objective beacon legible.
6. **Side panel in battle**: four agent portrait cards (`public/assets/art/portraits/*.jpg`,
   fallback: initials on a gold disc) with HP and AP bars, in the Syndicate framed style.
7. **Title, briefing, debrief, ending** use the splash palette: black, gold, white text,
   with `public/assets/art/briefing-<mission>.jpg` behind the briefing text (fallback: dark
   panel).
8. Every screen stays readable at 1280x720; nothing important under 11px.
9. `bun test`, `bun run build` green. Credits file updated for every pack used and the
   designer-supplied art. Verify in-browser at 1280x720 and include screenshots of title, world,
   research/help, an event, both mission boards, briefing, debrief and ending. Exercise region
   selection/action assignment, research selection, event choices, mission launch/return, unit
   selection/movement/shooting and save/continue. Preserve slice 6a's explanatory text, hints and
   hover previews; no clipped text, obscured controls or art intercepting input. Test the named
   missing-image fallbacks. This verifies presentation and interaction, not the separate human
   difficulty gate.

## Out of scope

New mechanics, balance changes, sound, mobile layout, and new animation beyond the objective
beacon pulse, active research-node pulse and button hover. Preserve existing combat feedback.
