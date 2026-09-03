// A small seeded random source for generated places. A member's island must
// look the same on every device and every visit, so its layout comes from a
// deterministic stream keyed by their user id rather than Math.random.

/** FNV-1a: a stable 32-bit hash of any string, good enough to seed a PRNG. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface Rng {
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [min, max]. */
  int(min: number, max: number): number;
  /** One element of a non-empty list. */
  pick<T>(items: ReadonlyArray<T>): T;
}

/** mulberry32 over a string seed: tiny, fast, and deterministic. */
export function createRng(seed: string): Rng {
  let state = hashString(seed);
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)],
  };
}
