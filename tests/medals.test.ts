import { describe, expect, it } from "vitest";
import { CAMPAIGN } from "../src/levels/index";
import { createRunner, stepRunner } from "../src/logic/runner";
import { medalFor, medalTargets, perfectScore } from "../src/logic/medals";
import { GRIND, VIEW, DOUGHNUT } from "../src/logic/tuning";
import type { LevelData } from "../src/logic/types";

const rest = VIEW.groundY - DOUGHNUT.outerRadius;
const rolling: LevelData = {
  name: "t",
  length: 3000,
  topping: "plain",
  ground: [{ x: 0, width: 10000 }],
  sausages: [400, 800, 1200].map((x) => ({ x, y: rest, length: 100, thickness: 16 })),
  ramps: [],
  boosts: [],
  hills: [],
};

describe("medals", () => {
  it("score a perfect run as every grind perfect in one chain", () => {
    const p = GRIND.grades[0].points;
    expect(perfectScore(rolling)).toBe(100 * p * 1 + 100 * p * 1.5 + 100 * p * 2);
    // Rolling straight through sausages at rolling height is perfect every time.
    const s = createRunner(rolling);
    for (let i = 0; i < 2000 && !s.finished; i++) stepRunner(s, { held: false, pressed: false }, rolling);
    expect(s.score).toBe(perfectScore(rolling));
    expect(medalFor(rolling, s.score)).toBe("gold");
  });

  it("give silver and bronze below their shares, and nothing to a level never finished", () => {
    const t = medalTargets(rolling);
    expect(medalFor(rolling, t.gold - 1)).toBe("silver");
    expect(medalFor(rolling, t.silver - 1)).toBe("bronze");
    expect(medalFor(rolling, null)).toBeNull();
  });

  it("set gold above silver on every campaign level", () => {
    for (const c of CAMPAIGN) {
      const t = medalTargets(c.level);
      expect(t.gold).toBeGreaterThan(t.silver);
      expect(t.silver).toBeGreaterThan(0);
    }
  });
});
