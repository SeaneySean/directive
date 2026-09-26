#!/usr/bin/env python3
"""Crop the Kenney city/building textures used by the district renderer into tight sprites.

Sources (CC0, kenney.nl) live under /tmp/kenney; each texture is trimmed to its clean
bounding box so the renderer can place it without dead canvas. Outputs to
public/assets/battle/.
"""
from PIL import Image
import os

SRC = "/tmp/kenney"
DST = "/home/sean/games/directive/public/assets/battle"

# (source path under SRC, destination filename)
JOBS = [
    # Building perimeter wall block: roof top + two windowed facades.
    ("isometric-tiles-buildings/PNG/buildingTiles_000.png", "city-wall.png"),
    # Flat roof top face (one top face per building).
    ("isometric-tiles-buildings/PNG/buildingTiles_005.png", "city-roof.png"),
    # Open doorway (walkable door tile through a building wall).
    ("isometric-miniature-prototype/Isometric/doorOpen_N.png", "city-door.png"),
    # Flat ground top face (tinted per surface: road / pavement / plaza / interior).
    ("isometric-miniature-prototype/Isometric/floor_N.png", "city-road.png"),
    ("isometric-miniature-prototype/Isometric/floor_N.png", "city-pavement.png"),
    # Three cover props.
    ("isometric-tiles-buildings/PNG/buildingTiles_057.png", "city-prop-tree.png"),
    ("isometric-tiles-buildings/PNG/buildingTiles_061.png", "city-prop-tree2.png"),
    ("isometric-miniature-prototype/Isometric/crate_N.png", "city-prop-crate.png"),
]


def trim_bbox(im: Image.Image) -> Image.Image:
    bbox = im.convert("RGBA").getbbox()
    return im.crop(bbox) if bbox else im


os.makedirs(DST, exist_ok=True)
for src, dst in JOBS:
    im = Image.open(os.path.join(SRC, src)).convert("RGBA")
    cropped = trim_bbox(im)
    out = os.path.join(DST, dst)
    cropped.save(out, optimize=True)
    print(f"{dst:24s} {cropped.size[0]}x{cropped.size[1]}")