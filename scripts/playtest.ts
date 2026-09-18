// Headless balance check: both sides play with the built-in AI.
// Usage: bun run playtest [games=200] [scenario=Farmstead]

import { createGame, runTeamTurn, SCENARIOS } from '../src/game/index.ts';

const games = Number(process.argv[2] ?? 200);
const scenarioName = process.argv[3] ?? SCENARIOS[0]!.name;
const scenario = SCENARIOS.find((s) => s.name === scenarioName);
if (!scenario) {
  console.error(`unknown scenario ${scenarioName}; have ${SCENARIOS.map((s) => s.name).join(', ')}`);
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
    survivors += state.units.filter((u) => u.team === 'squad' && u.alive).length;
  } else if (state.outcome === 'lost') lost++;
  else stalled++;
  rounds += state.round;
}

const pct = (n: number) => `${((100 * n) / games).toFixed(1)}%`;
console.log(`scenario: ${scenario.name}  games: ${games}`);
console.log(`won: ${won} (${pct(won)})  lost: ${lost} (${pct(lost)})  stalled: ${stalled}`);
console.log(`avg rounds: ${(rounds / games).toFixed(1)}  avg survivors on win: ${won ? (survivors / won).toFixed(2) : '-'}`);
