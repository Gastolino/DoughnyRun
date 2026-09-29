import { describe, expect, it } from "vitest";
import { checkSausage, ringAt } from "../src/logic/threading";
import { DOUGHNUT } from "../src/logic/tuning";
import type { Sausage } from "../src/logic/types";

const hole = DOUGHNUT.holeRadius + DOUGHNUT.holeForgiveness;
const sausage = (y: number, thickness = 16): Sausage => ({ kind: "thread", x: 100, y, length: 80, thickness });

describe("checkSausage", () => {
  const ring = ringAt(140, 300);

  it("threads a sausage centred in the hole", () => {
    expect(checkSausage(ring, sausage(300))).toBe("threaded");
  });

  it("ignores a sausage that is behind or ahead of the ring", () => {
    expect(checkSausage(ringAt(0, 300), sausage(300))).toBe("clear");
    expect(checkSausage(ringAt(400, 300), sausage(300))).toBe("clear");
  });

  it("ignores a sausage entirely above or below the ring", () => {
    expect(checkSausage(ring, sausage(300 - DOUGHNUT.outerRadius - 8))).toBe("clear");
    expect(checkSausage(ring, sausage(300 + DOUGHNUT.outerRadius + 8))).toBe("clear");
  });

  it("threads a sausage exactly as thick as the forgiving hole", () => {
    expect(checkSausage(ring, sausage(300, hole * 2))).toBe("threaded");
    expect(checkSausage(ring, sausage(300, hole * 2 + 1))).toBe("hit");
  });

  it("threads a sausage touching the top or bottom edge of the hole", () => {
    expect(checkSausage(ring, sausage(300 - hole + 8))).toBe("threaded");
    expect(checkSausage(ring, sausage(300 + hole - 8))).toBe("threaded");
  });

  it("crashes when the sausage overlaps the dough above or below the hole", () => {
    expect(checkSausage(ring, sausage(300 - hole + 7))).toBe("hit");
    expect(checkSausage(ring, sausage(300 + hole - 7))).toBe("hit");
    expect(checkSausage(ring, sausage(300 - DOUGHNUT.outerRadius))).toBe("hit");
  });
});
