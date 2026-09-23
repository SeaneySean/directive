import type { RegionDefinition } from './types.ts';

export const ACTION_TEXT: Readonly<Record<string, string>> = {
  'buy-media': 'Adds 26 Subvert. Exposure: +2.',
  'install-leader': 'Adds 40 Subvert after Subvert reaches 50. Exposure: +6.',
  'found-movement': 'Adds 22 Subvert and 10 Enlighten. Exposure: +1.',
  'arm-faction': 'Adds 30 Force. Exposure: +5.',
  coup: 'Adds 42 Force after Force reaches 50; requires Private Armies. Exposure: +12.',
  'fund-abundance': 'Adds 28 Enlighten and permanently lowers Resistance. Exposure: none.',
  'open-archives': 'Adds 25 Enlighten; requires Manufactured Consent. Exposure: -6.',
};

export const RESEARCH_TEXT: Readonly<Record<string, string>> = {
  'psychology-1': 'Doubles the effect of Buy the media.',
  'psychology-2': 'Unlocks Open the archives and halves Subvert Exposure.',
  'weaponry-1': 'Unlocks Coup actions.',
  'weaponry-2': 'Upgrades the squad to plasma weapons after Area 51.',
  'cybernetics-1': 'Reveals exact influence meters.',
  'cybernetics-2': 'Adds one agent and four research points each turn.',
  'cybernetics-3': 'Completes AGI and wins the campaign.',
  'mythology-1': 'Reveals the Atlantis research route.',
  'mythology-2': 'Unlocks the Atlantis Ruins mission.',
  'mythology-3': 'Accelerates research by fifty per cent and enables AGI.',
};

export const REGION_RESISTANCE_TEXT: Readonly<Record<number, string>> = {
  0: 'Offers no resistance',
  1: 'Resists slowly',
  2: 'Resists firmly',
};

export const REGION_WEALTH_TEXT: Readonly<Record<number, string>> = {
  6: 'pays modestly',
  7: 'pays steadily',
  8: 'pays steadily',
  9: 'pays well',
  10: 'pays well',
  11: 'pays richly',
};

export function regionDescription(region: RegionDefinition): string {
  return `${REGION_RESISTANCE_TEXT[region.resistance] ?? 'Resists unpredictably'}, ${REGION_WEALTH_TEXT[region.wealth] ?? 'pays unpredictably'}.`;
}

export const EVENT_CONTEXT: Readonly<Record<string, string>> = {
  candidate: 'North America is listening to a celebrity who mistakes attention for authority. Put him in office and every friendly newsroom gains leverage.',
  leak: 'A source has exposed the location of a classified Nevada hangar. Move now to seize its alien artefact before the trail goes cold.',
  whistleblower: 'An insider has documents and a journalist waiting on the line. Silence costs money; publicity costs hard-won influence.',
  'miracle-at-the-well': 'An abundance project has become a symbol of practical hope. Nearby populations are ready to believe that change can cross borders.',
  summit: 'A rival cabal sees that your control is becoming permanent. Its offer buys another agent at the price of dangerous visibility.',
};

export const EVENT_CHOICE_TEXT: Readonly<Record<string, readonly string[]>> = {
  candidate: [
    'Install the candidate (+30 Subvert NA, +10 Exposure, cheaper Subvert actions)',
    'Pass (no change)',
  ],
  leak: [
    'Respond (unlock Area 51)',
    'Ignore (+15 Exposure, Area 51 remains available)',
  ],
  whistleblower: [
    'Pay 30 treasury (bury the story)',
    'Let them talk (-20 Subvert in your most-subverted region)',
  ],
  'miracle-at-the-well': [
    'Witness it (+15 Enlighten in two neighbouring regions)',
  ],
  summit: [
    'Accept the pact (+1 agent, +20 Exposure)',
    'Refuse (no change)',
  ],
};

export interface HelpPanelCopy {
  title: string;
  body: string;
}

export const HELP_PANELS: readonly HelpPanelCopy[] = [
  {
    title: 'THE GOAL',
    body: 'Hold five regions or complete AGI before Exposure reaches 100. Assign actions with your available agents, choose research, then end the turn.',
  },
  {
    title: 'THREE PATHS',
    body: 'Subvert is efficient but raises Exposure. Force is fast and conspicuous. Enlighten is slower, reduces resistance, and can lower Exposure. Any path can hold a region at 100 influence.',
  },
  {
    title: 'RESEARCH & MISSIONS',
    body: 'Research unlocks stronger actions, exact intelligence, agents, and AGI.\nMissions secure the alien artefact and Aurichalcum needed for advanced research; losing costs 20 treasury but permits a later retry.',
  },
  {
    title: 'BATTLE CONTROLS',
    body: 'Click a soldier, then a green tile to move or an enemy to shoot. Each action costs 1 AP. Use E to end the turn and Tab to select the next soldier.',
  },
];

export function guideText(turn: number): string | null {
  if (turn === 1) return 'Pick a region, assign an action, then END TURN. Watch Exposure.';
  if (turn === 2) return 'Choose a research project now; it advances every END TURN.';
  return null;
}

export interface MissionCopy {
  why: string;
  objective: string;
  reward: string;
  /** Shown after the reinforcement line; warns that camping never pays. */
  reinforcementsNote?: string;
}

export const MISSION_TEXT: Readonly<Record<string, MissionCopy>> = {
  'area-51': {
    why: 'A leaked Nevada hangar contains technology that can transform your arsenal. Reach it before the guards erase every trace.',
    objective: 'Reach the gold artefact tile and hold it for 2 squad turns.',
    reward: 'Alien artefact and -10 Exposure',
    reinforcementsNote: 'Once reinforcements stop, holding your starting position gains nothing: advance to secure the objective or eliminate the remaining defenders.',
  },
  atlantis: {
    why: 'The ruins preserve the Aurichalcum formula required by your final research programme. Guardians still defend the flooded archive.',
    objective: 'Reach the gold formula tile and hold it for 2 squad turns.',
    reward: 'Aurichalcum',
    reinforcementsNote: 'Once reinforcements stop, holding your starting position gains nothing: advance to secure the objective or eliminate the remaining defenders.',
  },
};
