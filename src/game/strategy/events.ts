import { REGION_NEIGHBOURS } from './data.ts';
import type { CampaignState } from './types.ts';

export interface EventChoice {
  label: string;
  available?: (state: CampaignState) => boolean;
  effect: (state: CampaignState) => CampaignState;
}

export interface EventCard {
  id: string;
  name: string;
  description: string;
  when: (state: CampaignState) => boolean;
  choices: readonly EventChoice[];
}

const clamp = (value: number): number => Math.max(0, Math.min(100, value));

function addUnique(values: string[], value: string): string[] {
  return values.includes(value) ? values : [...values, value];
}

export const EVENTS: readonly EventCard[] = [
  {
    id: 'candidate',
    name: 'The Candidate',
    description: 'A reality-TV star is ready for the ultimate role.',
    when: (state) => (state.regions.find((region) => region.id === 'north-america')?.meters.subvert ?? 0) >= 40,
    choices: [
      {
        label: 'Install the candidate',
        effect: (state) => ({
          ...state,
          exposure: clamp(state.exposure + 10),
          flags: addUnique(state.flags, 'favourable-law'),
          regions: state.regions.map((region) => region.id === 'north-america'
            ? { ...region, meters: { ...region.meters, subvert: clamp(region.meters.subvert + 30) } }
            : region),
        }),
      },
      { label: 'Pass', effect: (state) => state },
    ],
  },
  {
    id: 'leak',
    name: 'The Leak',
    description: 'Coordinates for a hangar in Nevada have surfaced.',
    when: (state) => state.turn >= 3,
    choices: [
      {
        label: 'Respond',
        effect: (state) => ({
          ...state,
          unlockedMissions: addUnique(state.unlockedMissions, 'area-51'),
        }),
      },
      {
        label: 'Ignore',
        effect: (state) => ({
          ...state,
          exposure: clamp(state.exposure + 15),
          unlockedMissions: addUnique(state.unlockedMissions, 'area-51'),
        }),
      },
    ],
  },
  {
    id: 'whistleblower',
    name: 'Whistleblower',
    description: 'An insider has documents and a journalist on hold.',
    when: (state) => state.exposure >= 60,
    choices: [
      {
        label: 'Pay 30 treasury',
        available: (state) => state.treasury >= 30,
        effect: (state) => ({ ...state, treasury: state.treasury - 30 }),
      },
      {
        label: 'Let them talk',
        effect: (state) => {
          const target = state.regions.reduce((most, region) =>
            region.meters.subvert > most.meters.subvert ? region : most,
          );
          return {
            ...state,
            regions: state.regions.map((region) => region.id === target.id
              ? { ...region, meters: { ...region.meters, subvert: clamp(region.meters.subvert - 20) } }
              : region),
          };
        },
      },
    ],
  },
  {
    id: 'miracle-at-the-well',
    name: 'Miracle at the Well',
    description: 'Hope crosses borders faster than any army.',
    when: (state) => state.regions.some((region) => region.meters.enlighten >= 50),
    choices: [
      {
        label: 'Witness it',
        effect: (state) => {
          const source = state.regions.find((region) => region.meters.enlighten >= 50);
          if (!source) return state;
          const neighbours = new Set(REGION_NEIGHBOURS[source.id] ?? []);
          return {
            ...state,
            regions: state.regions.map((region) => neighbours.has(region.id)
              ? { ...region, meters: { ...region.meters, enlighten: clamp(region.meters.enlighten + 15) } }
              : region),
          };
        },
      },
    ],
  },
  {
    id: 'summit',
    name: 'The Summit',
    description: 'A rival cabal proposes a mutually profitable peace.',
    when: (state) => state.regions.filter((region) =>
      region.held || Object.values(region.meters).some((meter) => meter >= 100),
    ).length >= 3,
    choices: [
      {
        label: 'Accept the pact',
        effect: (state) => ({
          ...state,
          exposure: clamp(state.exposure + 20),
          bonusAgents: state.bonusAgents + 1,
          agents: state.agents + 1,
        }),
      },
      { label: 'Refuse', effect: (state) => state },
    ],
  },
] as const;

export function pendingEvent(state: CampaignState): EventCard | null {
  return EVENTS.find((event) => !state.firedEvents.includes(event.id) && event.when(state)) ?? null;
}

export function resolveEvent(state: CampaignState, choiceIndex: number): CampaignState {
  const event = pendingEvent(state);
  const choice = event?.choices[choiceIndex];
  if (!event || !choice || (choice.available && !choice.available(state))) return state;
  const resolved = choice.effect(state);
  return { ...resolved, firedEvents: [...resolved.firedEvents, event.id] };
}
