// Headless balance checks for tactical battles and random-policy campaigns.
// Usage:
//   bun run playtest [games=200] [scenario=Farmstead]
//   bun run playtest --campaign [games=200]

import { createGame, runTeamTurn, SCENARIOS } from '../src/game/index.ts';
import { nextRandom } from '../src/game/rng.ts';
import {
  assignAction,
  availableActions,
  createCampaign,
  endTurn as endCampaignTurn,
} from '../src/game/strategy/campaign.ts';
import type { CampaignState } from '../src/game/strategy/types.ts';

const pct = (count: number, total: number) => `${((100 * count) / total).toFixed(1)}%`;

function randomIndex(seed: number, length: number): { index: number; seed: number } {
  const random = nextRandom(seed);
  return { index: Math.floor(random.value * length), seed: random.seed };
}

function assignRandomActions(state: CampaignState, policySeed: number): { state: CampaignState; seed: number } {
  let next = state;
  let seed = policySeed;
  while (Object.keys(next.assignments).length < next.agents) {
    const choices = next.regions.flatMap((region) =>
      availableActions(next, region.id).map((action) => ({ regionId: region.id, actionId: action.id })),
    );
    if (!choices.length) break;
    const pick = randomIndex(seed, choices.length);
    seed = pick.seed;
    const choice = choices[pick.index]!;
    next = assignAction(next, choice.regionId, choice.actionId);
  }
  return { state: next, seed };
}

function runCampaigns(games: number): void {
  let won = 0;
  let lost = 0;
  let stalled = 0;
  let turns = 0;

  for (let seed = 1; seed <= games; seed++) {
    let state = createCampaign(seed);
    let policySeed = seed ^ 0x5f3759df;
    while (state.outcome === 'playing' && state.turn <= 40) {
      const assigned = assignRandomActions(state, policySeed);
      state = endCampaignTurn(assigned.state);
      policySeed = assigned.seed;
    }
    if (state.outcome === 'won') won++;
    else if (state.outcome === 'lost') lost++;
    else stalled++;
    turns += Math.min(40, state.turn - 1);
  }

  console.log(`campaigns: ${games}  max turns: 40`);
  console.log(`won: ${won} (${pct(won, games)})  lost: ${lost} (${pct(lost, games)})  stalled: ${stalled} (${pct(stalled, games)})  mean turns: ${(turns / games).toFixed(1)}`);
}

function runBattles(games: number, scenarioName: string): void {
  const scenario = SCENARIOS.find((candidate) => candidate.name === scenarioName);
  if (!scenario) {
    console.error(`unknown scenario ${scenarioName}; have ${SCENARIOS.map((candidate) => candidate.name).join(', ')}`);
    process.exit(1);
  }

  let won = 0;
  let lost = 0;
  let stalled = 0;
  let rounds = 0;
  let survivors = 0;

  for (let seed = 1; seed <= games; seed++) {
    let state = createGame(scenario, seed);
    for (let i = 0; i < 400 && state.outcome === 'playing'; i++) {
      state = runTeamTurn(state, state.turn).state;
    }
    if (state.outcome === 'won') {
      won++;
      survivors += state.units.filter((unit) => unit.team === 'squad' && unit.alive).length;
    } else if (state.outcome === 'lost') lost++;
    else stalled++;
    rounds += state.round;
  }

  console.log(`scenario: ${scenario.name}  games: ${games}`);
  console.log(`won: ${won} (${pct(won, games)})  lost: ${lost} (${pct(lost, games)})  stalled: ${stalled}`);
  console.log(`avg rounds: ${(rounds / games).toFixed(1)}  avg survivors on win: ${won ? (survivors / won).toFixed(2) : '-'}`);
}

const campaignFlag = process.argv.indexOf('--campaign');
if (campaignFlag >= 0) {
  runCampaigns(Number(process.argv[campaignFlag + 1] ?? 200));
} else {
  runBattles(Number(process.argv[2] ?? 200), process.argv[3] ?? SCENARIOS[0]!.name);
}
