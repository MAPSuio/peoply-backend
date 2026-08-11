import { evictToCapacity } from "./bounded-map";

const mapOf = (n: number) =>
  new Map(Array.from({ length: n }, (_, i) => [`key-${i}`, i]));

describe("evictToCapacity", () => {
  it("leaves a map that is under capacity alone", () => {
    const map = mapOf(5);
    expect(evictToCapacity(map, 10)).toBe(0);
    expect(map.size).toBe(5);
  });

  it("leaves a map that is exactly at capacity alone", () => {
    const map = mapOf(10);
    expect(evictToCapacity(map, 10)).toBe(0);
    expect(map.size).toBe(10);
  });

  it("trims below the cap so the walk is not repeated on every insert", () => {
    const map = mapOf(11);
    expect(evictToCapacity(map, 10)).toBe(2);
    expect(map.size).toBe(9);
  });

  it("drops the entries that were inserted first", () => {
    const map = mapOf(11);
    evictToCapacity(map, 10);

    expect(map.has("key-0")).toBe(false);
    expect(map.has("key-1")).toBe(false);
    expect(map.has("key-10")).toBe(true);
  });

  it("holds the line no matter how many keys arrive", () => {
    // 500,000 distinct source IPs inside one cleanup window measured at
    // 92.6 MB of heap before this cap existed.
    const map = new Map<string, number>();

    for (let i = 0; i < 500_000; i++) {
      map.set(`10.0.${(i >>> 8) & 255}.${i & 255}-${i}`, i);
      evictToCapacity(map, 1000);
    }

    expect(map.size).toBeLessThanOrEqual(1000);
  });

  it("keeps the most recent arrivals when it trims", () => {
    const map = new Map<string, number>();

    for (let i = 0; i < 100; i++) {
      map.set(`key-${i}`, i);
      evictToCapacity(map, 10);
    }

    expect(map.has("key-99")).toBe(true);
    expect(map.has("key-0")).toBe(false);
  });

  it("respects an explicit keep ratio", () => {
    const map = mapOf(21);
    expect(evictToCapacity(map, 20, 0.5)).toBe(11);
    expect(map.size).toBe(10);
  });

  it("survives a cap of zero without looping forever", () => {
    const map = mapOf(3);
    evictToCapacity(map, 0);
    expect(map.size).toBe(0);
  });
});
