// Seedable mulberry32 RNG — all gameplay randomness flows through here so
// nights are reproducible under test.

export function createRng(seed = 1) {
  let state = seed >>> 0;

  const rng = {
    reseed(s) { state = s >>> 0; },

    // float in [0, 1)
    next() {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },

    // integer in [min, max] inclusive
    int(min, max) {
      return min + Math.floor(rng.next() * (max - min + 1));
    },

    pick(arr) {
      return arr[Math.floor(rng.next() * arr.length)];
    },

    // weighted pick: items = [{item, weight}]
    weighted(items) {
      let total = 0;
      for (const it of items) total += it.weight;
      let r = rng.next() * total;
      for (const it of items) {
        r -= it.weight;
        if (r <= 0) return it.item;
      }
      return items[items.length - 1]?.item;
    },
  };
  return rng;
}
