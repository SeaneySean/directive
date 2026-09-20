import type { ActionDefinition, RegionDefinition } from './types.ts';

export const STARTING_TREASURY = 400;

export const REGIONS: readonly RegionDefinition[] = [
  { id: 'north-america', name: 'North America', resistance: 2, wealth: 10 },
  { id: 'south-america', name: 'South America', resistance: 1, wealth: 7 },
  { id: 'europe', name: 'Europe', resistance: 2, wealth: 11 },
  { id: 'middle-east', name: 'Middle East', resistance: 2, wealth: 9 },
  { id: 'africa', name: 'Africa', resistance: 1, wealth: 6 },
  { id: 'russia', name: 'Russia', resistance: 2, wealth: 8 },
  { id: 'asia', name: 'Asia', resistance: 2, wealth: 10 },
  { id: 'oceania', name: 'Oceania', resistance: 1, wealth: 6 },
] as const;

export const ACTIONS: Readonly<Record<string, ActionDefinition>> = {
  'buy-media': {
    id: 'buy-media',
    name: 'Buy the media',
    path: 'subvert',
    cost: 8,
    effects: { subvert: 26 },
    exposure: 2,
  },
  'install-leader': {
    id: 'install-leader',
    name: 'Install a loyal leader',
    path: 'subvert',
    cost: 14,
    effects: { subvert: 40 },
    exposure: 6,
    minimum: { subvert: 50 },
  },
  'found-movement': {
    id: 'found-movement',
    name: 'Found a movement',
    path: 'subvert',
    cost: 10,
    effects: { subvert: 22, enlighten: 10 },
    exposure: 1,
  },
  'arm-faction': {
    id: 'arm-faction',
    name: 'Arm a faction',
    path: 'force',
    cost: 9,
    effects: { force: 30 },
    exposure: 5,
  },
  coup: {
    id: 'coup',
    name: 'Coup',
    path: 'force',
    cost: 16,
    effects: { force: 42 },
    exposure: 12,
    minimum: { force: 50 },
    requires: 'weaponry-I',
  },
  'fund-abundance': {
    id: 'fund-abundance',
    name: 'Fund abundance projects',
    path: 'enlighten',
    cost: 12,
    effects: { enlighten: 28 },
    exposure: 0,
    resistanceDelta: -1,
  },
  'open-archives': {
    id: 'open-archives',
    name: 'Open the archives',
    path: 'enlighten',
    cost: 13,
    effects: { enlighten: 25 },
    exposure: -6,
    requires: 'psychology-II',
  },
} as const;
