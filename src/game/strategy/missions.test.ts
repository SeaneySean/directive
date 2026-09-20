import { describe, expect, test } from 'bun:test';
import { createCampaign } from './campaign.ts';
import {
  availableMissions,
  completeMission,
  missionScenario,
  startMission,
} from './missions.ts';

describe('campaign missions', () => {
  test('Area 51 is available on the turn The Leak unlocks it', () => {
    const state = { ...createCampaign(1), turn: 3, unlockedMissions: ['area-51'] };
    expect(availableMissions(state).map((mission) => mission.id)).toEqual(['area-51']);

    const started = startMission(state, 'area-51');
    expect(started.missions['area-51']).toEqual({ status: 'in-progress' });
    expect(availableMissions(started)).toEqual([]);
  });

  test('Atlantis unlocks from a completed research grant, not a stored grant string', () => {
    const researched = { ...createCampaign(2), completedResearch: ['mythology-1', 'mythology-2'] };
    expect(availableMissions(researched).map((mission) => mission.id)).toEqual(['atlantis']);
    expect(researched.completedResearch).not.toContain('unlock-atlantis');
    expect(researched.flags).not.toContain('unlock-atlantis');
    expect(researched.items).not.toContain('unlock-atlantis');
  });

  test('winning missions grants each reward once and completes the mission', () => {
    let area = { ...createCampaign(3), exposure: 6, unlockedMissions: ['area-51'] };
    area = startMission(area, 'area-51');
    area = completeMission(area, 'area-51', 'won');
    expect(area.items).toContain('alien-artefact');
    expect(area.exposure).toBe(0);
    expect(area.missions['area-51']).toEqual({ status: 'completed' });
    expect(availableMissions(area)).toEqual([]);

    let atlantis = { ...createCampaign(4), completedResearch: ['mythology-2'] };
    atlantis = completeMission(startMission(atlantis, 'atlantis'), 'atlantis', 'won');
    expect(atlantis.items).toContain('aurichalcum');
    expect(atlantis.missions.atlantis).toEqual({ status: 'completed' });
  });

  test('losing costs treasury and permits a retry only next turn', () => {
    let state = { ...createCampaign(5), treasury: 15, unlockedMissions: ['area-51'] };
    state = completeMission(startMission(state, 'area-51'), 'area-51', 'lost');
    expect(state.treasury).toBe(0);
    expect(state.missions['area-51']).toEqual({ status: 'failed', retryTurn: 2 });
    expect(availableMissions(state)).toEqual([]);
    expect(availableMissions({ ...state, turn: 2 }).map((mission) => mission.id)).toEqual(['area-51']);
  });

  test('Plasma squad weapons derive only from completed research node grants', () => {
    const researched = { ...createCampaign(6), completedResearch: ['weaponry-2'] };
    const plasma = missionScenario(researched, 'area-51');
    expect(plasma.units.filter((unit) => unit.team === 'squad').every((unit) =>
      unit.weapon.name === 'Plasma'
      && unit.weapon.range === 7
      && unit.weapon.accuracy === 75
      && unit.weapon.damage === 5
    )).toBe(true);

    const storedGrant = { ...createCampaign(7), flags: ['plasma-small-arms'], items: ['plasma-small-arms'] };
    expect(missionScenario(storedGrant, 'area-51').units.some((unit) =>
      unit.team === 'squad' && unit.weapon.name === 'Plasma'
    )).toBe(false);
  });
});
