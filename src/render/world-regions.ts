/**
 * The 8 region polygons, hand-placed over the night-earth world map
 * (`public/assets/art/world-map.jpg`). Points are normalised to [0, 1] across the
 * full map image (1672x941, equirectangular, longitude -180..180 left-to-right,
 * latitude 90N..90S top-to-bottom). The scene maps them into screen space with
 * `mapPointToScreen` and draws them as translucent polygons tinted by each region's
 * dominant influence path.
 */

export interface MapPoint {
  x: number;
  y: number;
}

export interface RegionPolygon {
  id: string;
  points: MapPoint[];
  centroid: MapPoint;
}

export const MAP_IMAGE = { width: 1672, height: 941 } as const;
/** The on-screen map area (left of the side panel). */
export const MAP_AREA = { x: 0, y: 0, width: 1000, height: 720 } as const;
/** Cover scale: fill the map area's height, crop the left/right Pacific margins. */
export const MAP_SCALE = MAP_AREA.height / MAP_IMAGE.height;
export const MAP_OFFSET = {
  x: (MAP_AREA.width - MAP_IMAGE.width * MAP_SCALE) / 2,
  y: 0,
};

export function mapPointToScreen(point: MapPoint): MapPoint {
  return {
    x: MAP_OFFSET.x + point.x * MAP_IMAGE.width * MAP_SCALE,
    y: MAP_OFFSET.y + point.y * MAP_IMAGE.height * MAP_SCALE,
  };
}

export const REGION_POLYGONS: readonly RegionPolygon[] = [
  {
    id: 'north-america',
    points: [
      { x: 0.028, y: 0.133 }, { x: 0.083, y: 0.111 }, { x: 0.139, y: 0.1 }, { x: 0.194, y: 0.1 },
      { x: 0.25, y: 0.111 }, { x: 0.278, y: 0.156 }, { x: 0.306, y: 0.194 }, { x: 0.333, y: 0.239 },
      { x: 0.306, y: 0.278 }, { x: 0.283, y: 0.322 }, { x: 0.267, y: 0.361 }, { x: 0.256, y: 0.4 },
      { x: 0.244, y: 0.422 }, { x: 0.222, y: 0.411 }, { x: 0.2, y: 0.378 }, { x: 0.172, y: 0.333 },
      { x: 0.144, y: 0.233 }, { x: 0.111, y: 0.194 }, { x: 0.056, y: 0.167 },
    ],
    centroid: { x: 0.2, y: 0.24 },
  },
  {
    id: 'south-america',
    points: [
      { x: 0.272, y: 0.45 }, { x: 0.289, y: 0.439 }, { x: 0.328, y: 0.45 }, { x: 0.356, y: 0.478 },
      { x: 0.378, y: 0.522 }, { x: 0.394, y: 0.567 }, { x: 0.383, y: 0.622 }, { x: 0.356, y: 0.678 },
      { x: 0.333, y: 0.733 }, { x: 0.311, y: 0.8 }, { x: 0.294, y: 0.756 }, { x: 0.283, y: 0.678 },
      { x: 0.278, y: 0.6 }, { x: 0.272, y: 0.522 },
    ],
    centroid: { x: 0.32, y: 0.62 },
  },
  {
    id: 'europe',
    points: [
      { x: 0.472, y: 0.3 }, { x: 0.475, y: 0.261 }, { x: 0.489, y: 0.233 }, { x: 0.508, y: 0.222 },
      { x: 0.522, y: 0.194 }, { x: 0.533, y: 0.167 }, { x: 0.561, y: 0.133 }, { x: 0.589, y: 0.111 },
      { x: 0.617, y: 0.122 }, { x: 0.625, y: 0.178 }, { x: 0.611, y: 0.222 }, { x: 0.589, y: 0.256 },
      { x: 0.567, y: 0.289 }, { x: 0.539, y: 0.3 }, { x: 0.517, y: 0.3 }, { x: 0.494, y: 0.294 },
    ],
    centroid: { x: 0.54, y: 0.2 },
  },
  {
    id: 'middle-east',
    points: [
      { x: 0.575, y: 0.294 }, { x: 0.589, y: 0.333 }, { x: 0.597, y: 0.378 }, { x: 0.617, y: 0.422 },
      { x: 0.639, y: 0.428 }, { x: 0.656, y: 0.389 }, { x: 0.667, y: 0.356 }, { x: 0.658, y: 0.328 },
      { x: 0.639, y: 0.306 }, { x: 0.622, y: 0.278 }, { x: 0.611, y: 0.261 }, { x: 0.597, y: 0.267 },
      { x: 0.583, y: 0.278 },
    ],
    centroid: { x: 0.62, y: 0.33 },
  },
  {
    id: 'africa',
    points: [
      { x: 0.453, y: 0.306 }, { x: 0.475, y: 0.294 }, { x: 0.506, y: 0.3 }, { x: 0.528, y: 0.311 },
      { x: 0.556, y: 0.322 }, { x: 0.583, y: 0.328 }, { x: 0.6, y: 0.35 }, { x: 0.619, y: 0.389 },
      { x: 0.633, y: 0.433 }, { x: 0.642, y: 0.456 }, { x: 0.625, y: 0.5 }, { x: 0.611, y: 0.533 },
      { x: 0.597, y: 0.583 }, { x: 0.589, y: 0.644 }, { x: 0.572, y: 0.689 }, { x: 0.556, y: 0.694 },
      { x: 0.539, y: 0.656 }, { x: 0.528, y: 0.611 }, { x: 0.519, y: 0.556 }, { x: 0.506, y: 0.5 },
      { x: 0.489, y: 0.472 }, { x: 0.472, y: 0.444 }, { x: 0.458, y: 0.4 }, { x: 0.453, y: 0.344 },
    ],
    centroid: { x: 0.54, y: 0.48 },
  },
  {
    id: 'russia',
    points: [
      { x: 0.583, y: 0.133 }, { x: 0.625, y: 0.156 }, { x: 0.667, y: 0.133 }, { x: 0.722, y: 0.111 },
      { x: 0.778, y: 0.094 }, { x: 0.833, y: 0.106 }, { x: 0.889, y: 0.122 }, { x: 0.944, y: 0.144 },
      { x: 0.994, y: 0.156 }, { x: 0.986, y: 0.211 }, { x: 0.917, y: 0.222 }, { x: 0.875, y: 0.211 },
      { x: 0.833, y: 0.194 }, { x: 0.778, y: 0.189 }, { x: 0.722, y: 0.178 }, { x: 0.667, y: 0.183 },
      { x: 0.625, y: 0.211 }, { x: 0.597, y: 0.233 }, { x: 0.583, y: 0.222 },
    ],
    centroid: { x: 0.78, y: 0.18 },
  },
  {
    id: 'asia',
    points: [
      { x: 0.667, y: 0.333 }, { x: 0.689, y: 0.367 }, { x: 0.711, y: 0.389 }, { x: 0.722, y: 0.422 },
      { x: 0.739, y: 0.456 }, { x: 0.756, y: 0.478 }, { x: 0.772, y: 0.5 }, { x: 0.792, y: 0.489 },
      { x: 0.8, y: 0.456 }, { x: 0.811, y: 0.417 }, { x: 0.828, y: 0.367 }, { x: 0.839, y: 0.333 },
      { x: 0.85, y: 0.289 }, { x: 0.833, y: 0.244 }, { x: 0.811, y: 0.233 }, { x: 0.789, y: 0.244 },
      { x: 0.764, y: 0.256 }, { x: 0.744, y: 0.278 }, { x: 0.722, y: 0.3 }, { x: 0.7, y: 0.317 },
      { x: 0.675, y: 0.333 },
    ],
    centroid: { x: 0.78, y: 0.34 },
  },
  {
    id: 'oceania',
    points: [
      { x: 0.811, y: 0.556 }, { x: 0.828, y: 0.583 }, { x: 0.844, y: 0.611 }, { x: 0.861, y: 0.639 },
      { x: 0.883, y: 0.667 }, { x: 0.906, y: 0.694 }, { x: 0.922, y: 0.711 }, { x: 0.911, y: 0.733 },
      { x: 0.889, y: 0.7 }, { x: 0.867, y: 0.656 }, { x: 0.85, y: 0.611 }, { x: 0.833, y: 0.578 },
      { x: 0.817, y: 0.55 },
    ],
    centroid: { x: 0.86, y: 0.63 },
  },
];

export function regionPolygon(id: string): RegionPolygon | undefined {
  return REGION_POLYGONS.find((polygon) => polygon.id === id);
}
