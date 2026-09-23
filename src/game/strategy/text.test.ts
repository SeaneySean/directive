import { describe, expect, test } from 'bun:test';
import { ACTIONS, REGIONS } from './data.ts';
import { EVENTS } from './events.ts';
import { RESEARCH } from './research.ts';
import {
  ACTION_TEXT,
  EVENT_CHOICE_TEXT,
  EVENT_CONTEXT,
  HELP_PANELS,
  RESEARCH_TEXT,
  REGION_RESISTANCE_TEXT,
  REGION_WEALTH_TEXT,
  guideText,
  regionDescription,
} from './text.ts';

describe('strategy explanation text', () => {
  test('defines hover text for every action and research node', () => {
    expect(Object.keys(ACTION_TEXT).sort()).toEqual(Object.keys(ACTIONS).sort());
    expect(Object.keys(RESEARCH_TEXT).sort()).toEqual(Object.keys(RESEARCH).sort());
    expect(Object.values(ACTION_TEXT).every((text) => text.length > 0 && /Exposure/.test(text))).toBe(true);
    expect(Object.values(RESEARCH_TEXT).every((text) => text.length > 0 && /\.$/.test(text))).toBe(true);
  });

  test('defines two-sentence context and consequence labels for every event choice', () => {
    expect(Object.keys(EVENT_CONTEXT).sort()).toEqual(EVENTS.map((event) => event.id).sort());
    expect(Object.keys(EVENT_CHOICE_TEXT).sort()).toEqual(EVENTS.map((event) => event.id).sort());
    for (const event of EVENTS) {
      expect(EVENT_CONTEXT[event.id]!.match(/[.!?](?:\s|$)/g)).toHaveLength(2);
      expect(EVENT_CHOICE_TEXT[event.id]).toHaveLength(event.choices.length);
      expect(EVENT_CHOICE_TEXT[event.id]!.every((label) => /\(.+\)$/.test(label))).toBe(true);
    }
  });

  test('describes every region resistance and wealth in words', () => {
    for (const region of REGIONS) {
      const description = regionDescription(region);
      expect(description).toContain(REGION_RESISTANCE_TEXT[region.resistance]);
      expect(description).toContain(REGION_WEALTH_TEXT[region.wealth]);
    }
  });

  test('help has four panels of no more than forty words and guides only turns one and two', () => {
    expect(HELP_PANELS).toHaveLength(4);
    for (const panel of HELP_PANELS) expect(panel.body.trim().split(/\s+/).length).toBeGreaterThan(0);
    expect(HELP_PANELS.every((panel) => panel.body.trim().split(/\s+/).length <= 40)).toBe(true);
    expect(guideText(1)).toBe('Pick a region, assign an action or launch a mission, then END TURN. Watch Exposure.');
    expect(guideText(2)).toContain('research');
    expect(guideText(3)).toBeNull();
  });
});
