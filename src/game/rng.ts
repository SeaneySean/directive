// Pure, seedable RNG (mulberry32). Returns the value and the next seed so game
// state stays a plain value and every game is replayable from its seed.

export function nextRandom(seed: number): { value: number; seed: number } {
  let t = (seed + 0x6d2b79f5) | 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  const value = ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  return { value, seed: t };
}

/** Roll 1..100 inclusive. */
export function rollPercent(seed: number): { roll: number; seed: number } {
  const r = nextRandom(seed);
  return { roll: Math.floor(r.value * 100) + 1, seed: r.seed };
}
