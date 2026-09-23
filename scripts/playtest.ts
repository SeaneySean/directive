// Headless balance checks for tactical battles and random-policy campaigns.
// Usage:
//   bun run playtest [games=200] [scenario=Farmstead]
//   bun run playtest --campaign [games=200]

import {
  canAct,
  createGame,
  decide,
  livingUnits,
  previewShot,
  runTeamTurn,
  SCENARIOS,
  squadPolicy,
  unitById,
  type AiPolicy,
  type GameState,
} from '../src/game/index.ts';
import { nextRandom } from '../src/game/rng.ts';
import {
  assignAction,
  availableActions,
  createCampaign,
  endTurn as endCampaignTurn,
} from '../src/game/strategy/campaign.ts';
import { pendingEvent, resolveEvent } from '../src/game/strategy/events.ts';
import { availableMissions, completeMission, startMission } from '../src/game/strategy/missions.ts';
import { RESEARCH, chooseResearch, isResearchAvailable } from '../src/game/strategy/research.ts';
import type { CampaignState } from '../src/game/strategy/types.ts';

const pct = (count: number, total: number) => `${((100 * count) / total).toFixed(1)}%`;
const MAX_CAMPAIGN_TURNS = 40;

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

function chooseRandomResearch(state: CampaignState, policySeed: number): { state: CampaignState; seed: number } {
  if (state.activeResearch) return { state, seed: policySeed };
  const choices = Object.keys(RESEARCH).filter((nodeId) => isResearchAvailable(state, nodeId));
  if (!choices.length) return { state, seed: policySeed };
  const pick = randomIndex(policySeed, choices.length);
  return { state: chooseResearch(state, choices[pick.index]!), seed: pick.seed };
}

function resolvePendingEvents(state: CampaignState, policySeed: number): { state: CampaignState; seed: number } {
  let next = state;
  let seed = policySeed;
  while (pendingEvent(next)) {
    const event = pendingEvent(next)!;
    const legal = event.choices
      .map((choice, index) => ({ choice, index }))
      .filter(({ choice }) => !choice.available || choice.available(next));
    const pick = randomIndex(seed, legal.length);
    seed = pick.seed;
    next = resolveEvent(next, legal[pick.index]!.index);
  }
  return { state: next, seed };
}

function completeAvailableMissions(state: CampaignState): CampaignState {
  let next = state;
  for (const mission of availableMissions(next)) {
    next = completeMission(startMission(next, mission.id), mission.id, 'won');
  }
  return next;
}

function resolveDeterministicEvents(state: CampaignState): CampaignState {
  let next = state;
  while (pendingEvent(next)) {
    const event = pendingEvent(next)!;
    const preferred = event.id === 'candidate' || event.id === 'summit' ? 1 : 0;
    const choice = event.choices[preferred];
    next = resolveEvent(next, choice && (!choice.available || choice.available(next)) ? preferred : 0);
  }
  return next;
}

function assignFiveRegionActions(state: CampaignState): CampaignState {
  let next = state;
  for (const region of next.regions.filter((candidate) => !candidate.held).slice(0, 5)) {
    if (Object.keys(next.assignments).length >= next.agents) break;
    const actions = availableActions(next, region.id);
    const actionId = actions.find((action) => action.id === 'fund-abundance')?.id ?? actions[0]?.id;
    if (actionId) next = assignAction(next, region.id, actionId);
  }
  return next;
}

const AGI_CHAIN = [
  'mythology-1',
  'mythology-2',
  'cybernetics-1',
  'cybernetics-2',
  'mythology-3',
  'cybernetics-3',
] as const;

function chooseAgiResearch(state: CampaignState): CampaignState {
  if (state.activeResearch) return state;
  const next = AGI_CHAIN.find((nodeId) => isResearchAvailable(state, nodeId));
  return next ? chooseResearch(state, next) : state;
}

function runRouteCampaign(seed: number, route: 'five-region' | 'agi'): CampaignState {
  let state = createCampaign(seed);
  while (state.outcome === 'playing' && state.turn <= MAX_CAMPAIGN_TURNS) {
    state = resolveDeterministicEvents(state);
    state = completeAvailableMissions(state);
    state = route === 'agi' ? chooseAgiResearch(state) : assignFiveRegionActions(state);
    state = resolveDeterministicEvents(state);
    const next = endCampaignTurn(state);
    if (next === state) throw new Error(`${route} campaign ${seed} stalled on turn ${state.turn}`);
    state = next;
  }
  return state;
}

function routeLine(label: string, states: CampaignState[]): string {
  const wins = states.filter((state) => state.outcome === 'won');
  const mean = wins.reduce((sum, state) => sum + state.turn, 0) / wins.length;
  return `${label}: won ${wins.length}/${states.length}  mean winning turn: ${mean.toFixed(1)}`;
}

function runCampaigns(games: number): void {
  let won = 0;
  let lost = 0;
  let stalled = 0;
  let turns = 0;

  for (let seed = 1; seed <= games; seed++) {
    let state = createCampaign(seed);
    let policySeed = seed ^ 0x5f3759df;
    while (state.outcome === 'playing' && state.turn <= MAX_CAMPAIGN_TURNS) {
      const events = resolvePendingEvents(state, policySeed);
      const missions = completeAvailableMissions(events.state);
      const research = chooseRandomResearch(missions, events.seed);
      const assigned = assignRandomActions(research.state, research.seed);
      const resolved = resolvePendingEvents(assigned.state, assigned.seed);
      const next = endCampaignTurn(resolved.state);
      if (next === resolved.state) throw new Error(`campaign ${seed} stalled on turn ${state.turn}`);
      state = next;
      policySeed = resolved.seed;
    }
    if (state.outcome === 'won') won++;
    else if (state.outcome === 'lost') lost++;
    else stalled++;
    turns += Math.min(MAX_CAMPAIGN_TURNS, state.turn - 1);
  }

  const fiveRegion = Array.from({ length: games }, (_, index) => runRouteCampaign(index + 1, 'five-region'));
  const agi = Array.from({ length: games }, (_, index) => runRouteCampaign(index + 1, 'agi'));
  console.log(routeLine('five-region policy', fiveRegion));
  console.log(routeLine('AGI-priority policy', agi));
  console.log(`random policy: won ${won}/${games} (${pct(won, games)})  lost ${lost} (${pct(lost, games)})  stalled ${stalled} (${pct(stalled, games)})  mean turns: ${(turns / games).toFixed(1)}`);
}

interface BattleResult {
  won: number;
  lost: number;
  stalled: number;
  rounds: number;
  survivors: number;
}

function simulateBattles(
  games: number,
  scenario: (typeof SCENARIOS)[number],
  squad: AiPolicy,
): BattleResult {
  const result: BattleResult = { won: 0, lost: 0, stalled: 0, rounds: 0, survivors: 0 };
  for (let seed = 1; seed <= games; seed++) {
    let state = createGame(scenario, seed);
    for (let i = 0; i < 400 && state.outcome === 'playing'; i++) {
      state = runTeamTurn(state, state.turn, state.turn === 'squad' ? squad : decide).state;
    }
    if (state.outcome === 'won') {
      result.won++;
      result.survivors += state.units.filter((unit) => unit.team === 'squad' && unit.alive).length;
    } else if (state.outcome === 'lost') result.lost++;
    else result.stalled++;
    result.rounds += state.round;
  }
  return result;
}

function battleLine(label: string, result: BattleResult, games: number): string {
  return `${label}: won ${result.won}/${games} (${pct(result.won, games)})  lost ${result.lost} (${pct(result.lost, games)})  stalled ${result.stalled}  avg rounds ${(result.rounds / games).toFixed(1)}  avg survivors ${result.won ? (result.survivors / result.won).toFixed(2) : '-'}`;
}

/**
 * The automated anti-camping regression policy: the squad never moves and only
 * shoots. Target selection reuses the smart policy's lowest-HP, then highest
 * hit-chance, then unit-id ordering, but waits whenever no legal shot exists.
 */
function camperPolicy(state: GameState, unitId: string): AiStep {
  const unit = unitById(state, unitId);
  const enemies = livingUnits(state, unit.team === 'alien' ? 'squad' : 'alien');
  if (!canAct(state, unit) || enemies.length === 0) return { kind: 'wait', unitId };
  const shots = enemies.flatMap((enemy) => {
    const preview = previewShot(state.grid, unit, enemy);
    return preview ? [{ enemy, chance: preview.chance }] : [];
  }).sort((left, right) =>
    left.enemy.hp - right.enemy.hp
    || right.chance - left.chance
    || left.enemy.id.localeCompare(right.enemy.id),
  );
  if (shots[0]) return { kind: 'shoot', unitId, targetId: shots[0].enemy.id };
  return { kind: 'wait', unitId };
}

function runBattles(games: number, scenarioName: string): void {
  const scenario = SCENARIOS.find((candidate) => candidate.name === scenarioName);
  if (!scenario) {
    console.error(`unknown scenario ${scenarioName}; have ${SCENARIOS.map((candidate) => candidate.name).join(', ')}`);
    process.exit(1);
  }
  console.log(battleLine(`${scenario.name} baseline`, simulateBattles(games, scenario, decide), games));
  console.log(battleLine(`${scenario.name} smart squad`, simulateBattles(games, scenario, squadPolicy), games));
  console.log(battleLine(`${scenario.name} camper`, simulateBattles(games, scenario, camperPolicy), games));
}

const campaignFlag = process.argv.indexOf('--campaign');
if (campaignFlag >= 0) {
  runCampaigns(Number(process.argv[campaignFlag + 1] ?? 200));
} else {
  runBattles(Number(process.argv[2] ?? 200), process.argv[3] ?? SCENARIOS[0]!.name);
}
