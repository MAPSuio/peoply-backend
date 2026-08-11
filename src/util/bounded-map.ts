/**
 * Trims a Map back under a capacity, dropping least-recently-inserted keys.
 *
 * Maps keyed by something the caller of an HTTP endpoint controls — a client
 * IP, say — grow at whatever rate requests arrive. A periodic sweep bounds how
 * long an entry lives but not how many arrive between two sweeps, so the cap
 * has to be enforced on insert.
 *
 * It trims to `keepRatio` of the cap rather than to exactly the cap, so the
 * O(n) walk happens once per (1 - keepRatio) x maxEntries inserts instead of
 * on every insert once full. Without that, a flood that holds the map at
 * capacity would make each further insert do a full pass.
 *
 * Returns how many entries were dropped, so the caller can say so — needing to
 * evict at all is itself worth reporting.
 */
export function evictToCapacity<K, V>(
  map: Map<K, V>,
  maxEntries: number,
  keepRatio = 0.9,
): number {
  if (map.size <= maxEntries) return 0;

  const target = Math.floor(maxEntries * keepRatio);
  let removed = 0;

  // Map iteration is insertion-ordered, and `set` on an existing key keeps its
  // original position — so this drops the keys first seen.
  for (const key of map.keys()) {
    if (map.size <= target) break;
    map.delete(key);
    removed++;
  }

  return removed;
}
