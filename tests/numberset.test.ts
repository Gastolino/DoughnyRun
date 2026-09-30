import { describe, expect, it } from "vitest";
import { NumberSet } from "../src/logic/solver";

describe("NumberSet", () => {
  it("reports each number once, across the whole range the solver packs into", () => {
    const set = new NumberSet(8);
    const big = 2 ** 47 - 1;
    expect(set.add(0)).toBe(true);
    expect(set.add(big)).toBe(true);
    expect(set.add(0)).toBe(false);
    expect(set.add(big)).toBe(false);
    expect(set.size).toBe(2);
  });

  it("keeps every number through repeated growth", () => {
    const set = new NumberSet(4);
    const values = Array.from({ length: 5000 }, (_, i) => i * 2 ** 31 + (i % 7));
    for (const v of values) expect(set.add(v)).toBe(true);
    for (const v of values) expect(set.add(v)).toBe(false);
    expect(set.size).toBe(values.length);
  });
});
