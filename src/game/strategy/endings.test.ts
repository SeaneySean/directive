import { describe, expect, test } from 'bun:test';
import { ENDINGS } from './endings.ts';

describe('campaign endings', () => {
  test('defines every named ending with exactly two lines of flavour', () => {
    expect(Object.keys(ENDINGS)).toEqual([
      'quiet-throne',
      'pax-illuminata',
      'long-dawn',
      'machine-ascends',
      'exposed',
    ]);
    expect(Object.values(ENDINGS).map((ending) => ending.title)).toEqual([
      'The Quiet Throne',
      'Pax Illuminata',
      'The Long Dawn',
      'The Machine Ascends',
      'The Conspiracy Is Exposed',
    ]);
    expect(Object.values(ENDINGS).every((ending) => ending.flavour.length === 2)).toBe(true);
  });
});
