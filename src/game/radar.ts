// Radar: a read-only projection of the fog state for the HUD. Pure; never mutates.

import type { GameState, Vec } from './types.ts';

/** A stored last-seen enemy contact shown as a blip. */
export interface RadarContact {
  id: string;
  pos: Vec;
}

export interface Radar {
  width: number;
  height: number;
  /** Row-major explored bitmap (width*height); the live reference. */
  explored: boolean[];
  /** Living squad unit positions. */
  squad: Vec[];
  /** Last-seen enemy contacts (excluding the assassination target, shown separately). */
  enemies: RadarContact[];
  /** Objective marker tile(s) for the HUD gold marker. */
  objective: Vec[];
  /** Assassination: the target's last-known tile (or the district search hint). */
  targetLastKnown: Vec | null;
  /** Assassination: bearing in radians from the squad centroid, or null. */
  targetBearing: number | null;
  /** Assassination: the initial district search-area marker, or null. */
  searchMarker: Vec | null;
}

/** Average of living squad positions, or null when the squad is empty. */
function squadCentroid(state: GameState): Vec | null {
  const squad = state.units.filter((unit) => unit.team === 'squad' && unit.alive);
  if (squad.length === 0) return null;
  const sum = squad.reduce((acc, unit) => ({ x: acc.x + unit.pos.x, y: acc.y + unit.pos.y }), { x: 0, y: 0 });
  return { x: sum.x / squad.length, y: sum.y / squad.length };
}

/** Centre of the map's northern third, in grid coordinates. */
function northThirdCentre(state: GameState): Vec {
  const third = Math.floor(state.grid.height / 3);
  const y = Math.max(0, Math.floor(third / 2));
  return { x: Math.floor(state.grid.width / 2), y };
}

/** Living alien contacts with a stored last-seen tile. */
function storedContacts(state: GameState): RadarContact[] {
  const objective = state.objective;
  const targetId = objective?.kind === 'assassinate' ? objective.targetId : null;
  const out: RadarContact[] = [];
  for (const unit of state.units) {
    if (unit.team !== 'alien' || !unit.alive) continue;
    if (unit.id === targetId) continue; // the target is the gold blip, not a red contact
    const pos = state.knownEnemyPositions[unit.id];
    if (pos) out.push({ id: unit.id, pos: { ...pos } });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

/** The assassination target's last-known tile, falling back to the district hint. */
function targetLastKnown(state: GameState): Vec | null {
  const objective = state.objective;
  if (objective?.kind !== 'assassinate') return null;
  const stored = state.knownEnemyPositions[objective.targetId];
  if (stored) return { ...stored };
  return state.district?.searchMarker ? { ...state.district.searchMarker } : null;
}

/** Nearest stored contact to the squad centroid, ties by enemy id. */
function nearestContact(state: GameState, contacts: RadarContact[]): RadarContact | null {
  if (contacts.length === 0) return null;
  const centroid = squadCentroid(state);
  if (!centroid) return contacts[0]!;
  let best = contacts[0]!;
  let bestDist = Math.hypot(centroid.x - best.pos.x, centroid.y - best.pos.y);
  for (const contact of contacts.slice(1)) {
    const d = Math.hypot(centroid.x - contact.pos.x, centroid.y - contact.pos.y);
    if (d < bestDist || (d === bestDist && contact.id.localeCompare(best.id) < 0)) {
      best = contact;
      bestDist = d;
    }
  }
  return best;
}

/** Objective marker tile(s) per kind, or an empty list with no objective. */
function objectiveMarker(state: GameState): Vec[] {
  const objective = state.objective;
  if (!objective) return [];
  switch (objective.kind) {
    case 'hold':
      return [{ ...objective.tile }];
    case 'recover': {
      if (state.carrierId) {
        const carrier = state.units.find((unit) => unit.id === state.carrierId && unit.alive);
        if (carrier) return [carrier.pos, ...objective.extraction.map((e) => ({ ...e }))];
      }
      return [{ ...objective.tile }];
    }
    case 'assassinate': {
      const tile = targetLastKnown(state);
      return tile ? [tile] : [];
    }
    case 'clash': {
      const contact = nearestContact(state, storedContacts(state));
      return contact ? [{ ...contact.pos }] : [northThirdCentre(state)];
    }
  }
}

/** Read-only radar projection for the HUD. Handles an empty squad without NaN. */
export function radar(state: GameState): Radar {
  const centroid = squadCentroid(state);
  const tile = targetLastKnown(state);
  let bearing: number | null = null;
  if (centroid && tile) bearing = Math.atan2(tile.y - centroid.y, tile.x - centroid.x);
  return {
    width: state.grid.width,
    height: state.grid.height,
    explored: state.explored,
    squad: state.units.filter((unit) => unit.team === 'squad' && unit.alive).map((unit) => ({ ...unit.pos })),
    enemies: storedContacts(state),
    objective: objectiveMarker(state),
    targetLastKnown: tile,
    targetBearing: bearing,
    searchMarker: state.district?.searchMarker ? { ...state.district.searchMarker } : null,
  };
}