import { describe, expect, test } from 'bun:test';
import { createGame } from './state.ts';
import { isWalkable, parseMap } from './map.ts';
import { generateMission, type MissionType } from './mapgen.ts';
import type { InfluencePath } from './strategy/types.ts';
import type { DistrictMetadata, Grid, SurfaceTag, Vec } from './types.ts';

const PATHS: InfluencePath[] = ['subvert', 'force', 'enlighten'];
const TYPES: MissionType[] = ['recover', 'assassinate', 'clash'];

const key = (p: Vec) => `${p.x},${p.y}`;

/** BFS over open floor, ignoring unit occupancy. Returns reachable keys. */
function flood(grid: Grid, from: Vec): Set<string> {
  const seen = new Set<string>([key(from)]);
  const queue: Vec[] = [from];
  while (queue.length) {
    const current = queue.shift()!;
    for (const next of [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ]) {
      const k = key(next);
      if (seen.has(k) || !isWalkable(grid, next)) continue;
      seen.add(k);
      queue.push(next);
    }
  }
  return seen;
}

/** Surface tag of a tile from district metadata. */
function surfaceAt(district: DistrictMetadata, grid: Grid, p: Vec): SurfaceTag {
  return district.surfaces[p.y * grid.width + p.x]!;
}

for (const type of TYPES) {
  describe(`district ${type}`, () => {
    test('200 seeds produce 36-40 sized, fully connected district maps', () => {
      for (let seed = 1; seed <= 200; seed++) {
        const path = PATHS[(seed - 1) % 3]!;
        const scenario = generateMission(type, path, seed);
        const grid = parseMap(scenario.rows);
        const district = scenario.district!;
        const message = `${type} ${path} seed ${seed}`;

        expect(grid.width, `${message} width`).toBeGreaterThanOrEqual(36);
        expect(grid.width, `${message} width`).toBeLessThanOrEqual(40);
        expect(grid.height, `${message} height`).toBeGreaterThanOrEqual(36);
        expect(grid.height, `${message} height`).toBeLessThanOrEqual(40);
        expect(district.surfaces.length, `${message} surfaces`).toBe(grid.width * grid.height);

        // Distinct unit spawns.
        const positions = scenario.units.map((unit) => key(unit.pos));
        expect(new Set(positions).size, `${message} distinct unit spawns`).toBe(positions.length);

        // Every floor tile is connected to the squad spawn (roads, pavement,
        // plazas and interiors through doorways).
        const start = scenario.units.find((unit) => unit.team === 'squad')!.pos;
        const reachable = flood(grid, start);
        for (let y = 0; y < grid.height; y++) {
          for (let x = 0; x < grid.width; x++) {
            if (isWalkable(grid, { x, y })) {
              expect(reachable.has(key({ x, y })), `${message} floor ${x},${y} reachable`).toBe(true);
            }
          }
        }

        // Special tiles are floor and reachable.
        const objective = scenario.objective!;
        const specials: Vec[] = [];
        if (objective.kind === 'recover') specials.push(objective.tile, ...objective.extraction);
        else if (objective.kind === 'assassinate') {
          specials.push(...objective.exits, scenario.units.find((unit) => unit.id === objective.targetId)!.pos);
        }
        for (const b of district.buildings) specials.push(...b.doorways);
        if (scenario.reinforcements) specials.push(...scenario.reinforcements.spawns);
        for (const tile of specials) {
          expect(isWalkable(grid, tile), `${message} special ${key(tile)} floor`).toBe(true);
          expect(reachable.has(key(tile)), `${message} special ${key(tile)} reachable`).toBe(true);
        }

        // No cover props on any spawn or special tile.
        const forbidden = new Set([...positions, ...specials.map(key)]);
        for (let y = 0; y < grid.height; y++) {
          for (let x = 0; x < grid.width; x++) {
            if (grid.tiles[y * grid.width + x] === 'cover' && forbidden.has(key({ x, y }))) {
              expect(`${message} cover on ${key({ x, y })}`).toBe('never');
            }
          }
        }

        // Assassination bodyguards hold the host doorway (adjacent, never on it).
        if (objective.kind === 'assassinate') {
          const target = scenario.units.find((unit) => unit.id === objective.targetId)!;
          const host = district.buildings.find((b) =>
            b.x <= target.pos.x && target.pos.x < b.x + b.w && b.y <= target.pos.y && target.pos.y < b.y + b.h
          )!;
          const hostDoorwayKeys = new Set(host.doorways.map(key));
          for (const bg of scenario.units.filter((unit) => unit.team === 'alien' && unit.stance === 'hold')) {
            expect(host.doorways.some((d) =>
              Math.max(Math.abs(d.x - bg.pos.x), Math.abs(d.y - bg.pos.y)) === 1,
            ), `${message} bodyguard ${key(bg.pos)} adjacent to a host doorway`).toBe(true);
            expect(hostDoorwayKeys.has(key(bg.pos)), `${message} bodyguard not on a doorway`).toBe(false);
          }
        }
      }
    });

    test('roads, buildings and plazas form a valid district structure', () => {
      for (let seed = 1; seed <= 200; seed++) {
        const path = PATHS[(seed - 1) % 3]!;
        const scenario = generateMission(type, path, seed);
        const grid = parseMap(scenario.rows);
        const district = scenario.district!;
        const message = `${type} ${path} seed ${seed}`;

        // Roads exist as a grid of full-ish lines; borders are road.
        expect(surfaceAt(district, grid, { x: 0, y: 0 })).toBe('road');

        // Buildings have a rectangular wall perimeter and 1-2 floor doorways.
        expect(district.buildings.length, `${message} has buildings`).toBeGreaterThan(0);
        for (const b of district.buildings) {
          expect(b.w, `${message} footprint width`).toBeGreaterThanOrEqual(3);
          expect(b.w, `${message} footprint width`).toBeLessThanOrEqual(6);
          expect(b.h, `${message} footprint height`).toBeGreaterThanOrEqual(3);
          expect(b.h, `${message} footprint height`).toBeLessThanOrEqual(5);
          expect(b.doorways.length, `${message} doorway count`).toBeGreaterThanOrEqual(1);
          expect(b.doorways.length, `${message} doorway count`).toBeLessThanOrEqual(2);
          for (const d of b.doorways) {
            expect(isWalkable(grid, d), `${message} doorway ${key(d)} walkable`).toBe(true);
            expect(surfaceAt(district, grid, d)).toBe('interior');
          }
          // Walls on the perimeter, floor inside.
          for (let y = b.y; y < b.y + b.h; y++) {
            for (let x = b.x; x < b.x + b.w; x++) {
              const edge = y === b.y || y === b.y + b.h - 1 || x === b.x || x === b.x + b.w - 1;
              const walkable = isWalkable(grid, { x, y });
              if (edge && !b.doorways.some((d) => d.x === x && d.y === y)) {
                expect(walkable, `${message} building edge ${x},${y} is wall`).toBe(false);
              } else {
                expect(walkable, `${message} building interior ${x},${y} is floor`).toBe(true);
              }
            }
          }
        }

        // Every interior tagged tile is actually inside a building footprint.
        for (let y = 0; y < grid.height; y++) {
          for (let x = 0; x < grid.width; x++) {
            if (surfaceAt(district, grid, { x, y }) !== 'interior') continue;
            const inside = district.buildings.some((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
            expect(inside, `${message} interior ${x},${y} inside a building`).toBe(true);
          }
        }

        // Every plaza (4-connected 'plaza' surface component) carries 2-4 cover props.
        const plazaSeen = new Set<string>();
        for (let y = 0; y < grid.height; y++) {
          for (let x = 0; x < grid.width; x++) {
            const k = `${x},${y}`;
            if (surfaceAt(district, grid, { x, y }) !== 'plaza' || plazaSeen.has(k)) continue;
            const component: Vec[] = [];
            const queue: Vec[] = [{ x, y }];
            plazaSeen.add(k);
            while (queue.length) {
              const c = queue.shift()!;
              component.push(c);
              for (const n of [{ x: c.x + 1, y: c.y }, { x: c.x - 1, y: c.y }, { x: c.x, y: c.y + 1 }, { x: c.x, y: c.y - 1 }]) {
                const nk = key(n);
                if (plazaSeen.has(nk)) continue;
                if (surfaceAt(district, grid, n) !== 'plaza') continue;
                plazaSeen.add(nk);
                queue.push(n);
              }
            }
            const props = component.filter((p) => grid.tiles[p.y * grid.width + p.x] === 'cover').length;
            expect(props, `${message} plaza props 2-4`).toBeGreaterThanOrEqual(2);
            expect(props, `${message} plaza props 2-4`).toBeLessThanOrEqual(4);
          }
        }
      }
    });

    test('per-type placement follows the brief', () => {
      const scenario = generateMission(type, 'subvert', 1);
      const grid = parseMap(scenario.rows);
      const district = scenario.district!;
      const squad = scenario.units.filter((unit) => unit.team === 'squad');
      const aliens = scenario.units.filter((unit) => unit.team === 'alien');

      // Squad spawns on the near edge, behind props (cover one row north).
      for (const s of squad) {
        expect(s.pos.y, 'squad near south edge').toBeGreaterThanOrEqual(grid.height - 4);
        expect(surfaceAt(district, grid, s.pos)).toBe('pavement');
      }

      if (type === 'recover') {
        expect(aliens).toHaveLength(4);
        expect(aliens.every((unit) => unit.stance === 'hold')).toBe(true);
        const item = (scenario.objective as { kind: 'recover'; tile: Vec }).tile;
        expect(surfaceAt(district, grid, item)).toBe('interior');
      } else if (type === 'assassinate') {
        expect(aliens).toHaveLength(4);
        expect(aliens.filter((unit) => unit.stance === 'flee')).toHaveLength(1);
        expect(aliens.filter((unit) => unit.stance === 'hold')).toHaveLength(3);
        const target = aliens.find((unit) => unit.stance === 'flee')!;
        // Inside a building in the far third, outside opening visibility.
        expect(surfaceAt(district, grid, target.pos)).toBe('interior');
        expect(target.pos.y).toBeLessThan(Math.floor(grid.height / 3));
        const bodyguards = aliens.filter((unit) => unit.stance === 'hold');
        const allDoorways = district.buildings.flatMap((b) => b.doorways);
        const host = district.buildings.find((b) =>
          b.x <= target.pos.x && target.pos.x < b.x + b.w && b.y <= target.pos.y && target.pos.y < b.y + b.h
        )!;
        const hostDoorways = host.doorways;
        for (const bg of bodyguards) {
          // Adjacent (Chebyshev 1) to a host doorway.
          expect(hostDoorways.some((d) =>
            Math.max(Math.abs(d.x - bg.pos.x), Math.abs(d.y - bg.pos.y)) === 1
          )).toBe(true);
          // Occupies no doorway itself.
          expect(allDoorways.some((d) => d.x === bg.pos.x && d.y === bg.pos.y)).toBe(false);
          // Does not overlap the target.
          expect(bg.pos.x === target.pos.x && bg.pos.y === target.pos.y).toBe(false);
        }
        // Distinct from each other.
        const guardKeys = bodyguards.map((bg) => key(bg.pos));
        expect(new Set(guardKeys).size).toBe(bodyguards.length);
        // Exits are walkable tiles on the far edge.
        const exits = (scenario.objective as { kind: 'assassinate'; exits: Vec[] }).exits;
        for (const e of exits) {
          expect(e.y).toBe(0);
          expect(isWalkable(grid, e)).toBe(true);
        }
      } else {
        expect(aliens).toHaveLength(4);
        expect(aliens.every((unit) => unit.stance === 'smart')).toBe(true);
        const farHalf = Math.floor(grid.height / 2);
        expect(aliens.every((unit) => unit.pos.y < farHalf)).toBe(true);
        expect(aliens.some((unit) => surfaceAt(district, grid, unit.pos) === 'interior')).toBe(true);
      }

      if (type !== 'clash') {
        expect(scenario.reinforcements).toMatchObject({ fromRound: 6, every: 3, max: 2 });
        for (const s of scenario.reinforcements!.spawns) {
          expect(s.y).toBe(0);
          expect(surfaceAt(district, grid, s)).toBe('road');
        }
      }
    });
  });
}

describe('district determinism and copies', () => {
  test('generation is deterministic for every type and path', () => {
    for (const type of TYPES) {
      for (const path of PATHS) {
        const a = generateMission(type, path, 42);
        const b = generateMission(type, path, 42);
        expect(a.rows).toEqual(b.rows);
        expect(a.district).toEqual(b.district);
        expect(a.units.map((unit) => unit.pos)).toEqual(b.units.map((unit) => unit.pos));
      }
    }
  });

  test('createGame copies district metadata into independent state', () => {
    const scenario = generateMission('assassinate', 'subvert', 7);
    const a = createGame(scenario, 1);
    const b = createGame(scenario, 1);
    expect(a.district).not.toBe(scenario.district);
    expect(a.district).not.toBe(b.district);
    expect(a.district).toEqual(b.district);
    expect(a.district!.surfaces).not.toBe(b.district!.surfaces);
    // Mutating one state's surfaces leaves the other (and the scenario) untouched.
    a.district!.surfaces[0] = 'plaza';
    expect(b.district!.surfaces[0]).toBe(scenario.district!.surfaces[0]);
  });
});