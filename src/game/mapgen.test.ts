import { describe, expect, test } from 'bun:test';
import { decide, runTeamTurn, squadPolicy } from './ai.ts';
import { createGame } from './state.ts';
import { isWalkable, parseMap } from './map.ts';
import { generateMission, type MissionType } from './mapgen.ts';
import type { InfluencePath } from './strategy/types.ts';
import type { Grid, Scenario, Vec } from './types.ts';

const PATHS: InfluencePath[] = ['subvert', 'force', 'enlighten'];

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

const key = (p: Vec) => `${p.x},${p.y}`;

/** 4-connected cover components, optionally excluding cover on `excludeY`. */
function coverClusters(grid: Grid, excludeY: number): Vec[][] {
  const isCover = (x: number, y: number) => grid.tiles[y * grid.width + x] === 'cover';
  const seen = new Set<string>();
  const clusters: Vec[][] = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (!isCover(x, y) || y === excludeY) continue;
      const start = { x, y };
      if (seen.has(key(start))) continue;
      const cluster: Vec[] = [];
      const queue = [start];
      seen.add(key(start));
      while (queue.length) {
        const c = queue.shift()!;
        cluster.push(c);
        for (const n of [
          { x: c.x + 1, y: c.y }, { x: c.x - 1, y: c.y }, { x: c.x, y: c.y + 1 }, { x: c.x, y: c.y - 1 },
        ]) {
          const k = key(n);
          if (seen.has(k) || !isCover(n.x, n.y) || n.y === excludeY) continue;
          seen.add(k);
          queue.push(n);
        }
      }
      clusters.push(cluster);
    }
  }
  return clusters;
}

for (const type of ['recover', 'assassinate', 'clash'] as MissionType[]) {
  describe(`mapgen ${type}`, () => {
    test('200 seeds satisfy size, connectivity, distinct spawns and floor-only specials', () => {
      for (let seed = 1; seed <= 200; seed++) {
        const path = PATHS[(seed - 1) % 3]!;
        const scenario = generateMission(type, path, seed);
        const grid = parseMap(scenario.rows);

        const message = `${type} ${path} seed ${seed}`;
        expect(grid.width, `${message} width`).toBeGreaterThanOrEqual(18);
        expect(grid.width, `${message} width`).toBeLessThanOrEqual(22);
        expect(grid.height, `${message} height`).toBeGreaterThanOrEqual(18);
        expect(grid.height, `${message} height`).toBeLessThanOrEqual(22);

        // Distinct unit spawns.
        const positions = scenario.units.map((unit) => key(unit.pos));
        expect(new Set(positions).size, `${message} distinct unit spawns`).toBe(positions.length);

        const squad = scenario.units.filter((unit) => unit.team === 'squad');
        const objective = scenario.objective!;

        // Floor-only special tiles and connectivity from every spawn (recover & assassinate).
        const specials: Vec[] = [];
        if (objective.kind === 'recover') {
          specials.push(objective.tile, ...objective.extraction);
        } else if (objective.kind === 'assassinate') {
          specials.push(...objective.exits, scenario.units.find((unit) => unit.id === objective.targetId)!.pos);
        }
        for (const tile of specials) {
          expect(isWalkable(grid, tile), `${message} special ${key(tile)} on floor`).toBe(true);
        }
        for (const unit of squad) {
          const reach = flood(grid, unit.pos);
          for (const tile of specials) {
            expect(reach.has(key(tile)), `${message} ${unit.id} reaches ${key(tile)}`).toBe(true);
          }
        }

        // No cover on any spawn, special, exit, extraction or objective tile.
        const forbidden = new Set([...squad.map((unit) => key(unit.pos)), ...specials.map(key)]);
        for (let y = 0; y < grid.height; y++) {
          for (let x = 0; x < grid.width; x++) {
            if (grid.tiles[y * grid.width + x] === 'cover' && forbidden.has(key({ x, y }))) {
              expect(`${message} cover on ${key({ x, y })}`).toBe('never');
            }
          }
        }
      }
    });

    test('scattered cover forms 6 to 10 clusters of 1 to 3 tiles with a 3-tile gap', () => {
      for (let seed = 1; seed <= 200; seed++) {
        const path = PATHS[(seed - 1) % 3]!;
        const scenario = generateMission(type, path, seed);
        const grid = parseMap(scenario.rows);
        const message = `${type} ${path} seed ${seed}`;

        // The squad cover line sits on the row directly north of the spawns.
        const squadY = scenario.units.filter((unit) => unit.team === 'squad')[0]!.pos.y;
        const coverLineY = squadY - 1;

        const clusters = coverClusters(grid, coverLineY);
        expect(clusters.length, `${message} cluster count`).toBeGreaterThanOrEqual(6);
        expect(clusters.length, `${message} cluster count`).toBeLessThanOrEqual(10);
        for (const cluster of clusters) {
          expect(cluster.length, `${message} cluster size`).toBeGreaterThanOrEqual(1);
          expect(cluster.length, `${message} cluster size`).toBeLessThanOrEqual(3);
        }
        // At least three floor tiles between any two clusters (Chebyshev gap >= 4).
        for (let i = 0; i < clusters.length; i++) {
          for (let j = i + 1; j < clusters.length; j++) {
            for (const a of clusters[i]!) {
              for (const b of clusters[j]!) {
                const gap = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
                expect(gap, `${message} cluster gap`).toBeGreaterThanOrEqual(4);
              }
            }
          }
        }

        // The squad cover line exists (some cover directly north of the spawns).
        const onLine = scenario.units
          .filter((unit) => unit.team === 'squad')
          .some((unit) => grid.tiles[(coverLineY) * grid.width + unit.pos.x] === 'cover');
        expect(onLine, `${message} squad cover line`).toBe(true);
      }
    });

    test('enemy roster matches the objective type', () => {
      const scenario = generateMission(type, 'subvert', 1);
      const aliens = scenario.units.filter((unit) => unit.team === 'alien');
      if (type === 'recover') {
        expect(aliens).toHaveLength(4);
        expect(aliens.every((unit) => unit.stance === 'hold')).toBe(true);
      } else if (type === 'assassinate') {
        expect(aliens).toHaveLength(4);
        expect(aliens.filter((unit) => unit.stance === 'flee')).toHaveLength(1);
        expect(aliens.filter((unit) => unit.stance === 'hold')).toHaveLength(3);
      } else {
        expect(aliens).toHaveLength(4);
        expect(aliens.every((unit) => unit.stance === 'smart')).toBe(true);
      }
    });

    test('recover and assassinate use the fixed reinforcement schedule', () => {
      if (type === 'clash') return;
      const scenario = generateMission(type, 'subvert', 1);
      expect(scenario.reinforcements).toMatchObject({ fromRound: 6, every: 3, max: 2 });
      expect(scenario.reinforcements!.unit.stance).toBe('advance');
      expect(scenario.reinforcements!.spawns.length).toBeGreaterThanOrEqual(1);
    });
  });
}

describe('assassination interception', () => {
  test('an unopposed squad can run down the target before it escapes', () => {
    for (const path of PATHS) {
      for (let seed = 1; seed <= 100; seed++) {
        const full = generateMission('assassinate', path, seed);
        const solo: Scenario = {
          ...full,
          units: full.units.filter((unit) => unit.team === 'squad' || unit.id === 't1'),
          reinforcements: undefined,
        };
        let state = createGame(solo, seed);
        for (let i = 0; i < 200 && state.outcome === 'playing'; i++) {
          state = runTeamTurn(state, state.turn, state.turn === 'squad' ? squadPolicy : decide).state;
        }
        expect(state.outcome, `assassinate ${path} seed ${seed} (target down, not escaped)`).toBe('won');
      }
    }
  }, 30000);
});