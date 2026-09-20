#!/usr/bin/env python3
"""Crop the Kenney Isometric Miniature textures we actually use into tight sprites.

Source packs (CC0, kenney.nl) live under /tmp/kenney after manual download; this
script trims each tile to its clean bounding box so the renderer can place it
without dead canvas. Outputs go to public/assets/battle/.
"""
from PIL import Image
import os

SRC = "/tmp/kenney"
DST = "/home/sean/games/directive/public/assets/battle"

# (source path under SRC, destination filename, crop box or "bbox")
JOBS = [
    ("isometric-miniature-prototype/Isometric/floor_N.png",  "floor-hangar.png",  (0, 383, 256, 511)),
    ("isometric-miniature-dungeon/Isometric/stone_N.png",     "floor-atlantis.png",(0, 364, 256, 492)),
    ("isometric-miniature-prototype/Isometric/block_N.png",   "wall-hangar.png",   (0, 226, 256, 512)),
    ("isometric-miniature-dungeon/Isometric/stoneWallStructure_N.png", "wall-atlantis.png", (0, 230, 256, 512)),
    ("isometric-miniature-prototype/Isometric/crate_N.png",   "crate.png",         (63, 337, 193, 480)),
    ("isometric-miniature-dungeon/Isometric/stoneColumn_N.png","pillar.png",       (96, 276, 160, 464)),
]

os.makedirs(DST, exist_ok=True)
for src, dst, box in JOBS:
    im = Image.open(os.path.join(SRC, src)).convert("RGBA")
    cropped = im.crop(box)
    out = os.path.join(DST, dst)
    cropped.save(out, optimize=True)
    print(f"{dst:24s} {cropped.size[0]}x{cropped.size[1]}")
