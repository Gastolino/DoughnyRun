import { describe, expect, it } from "vitest";
import { buildLevel, LevelFormatError, parseLevelFile } from "../src/levels/format";
import { createRunner, speedOf, stepRunner } from "../src/logic/runner";
import { findBypasses } from "../src/logic/solver";
import type { RunnerEvent, RunnerState } from "../src/logic/runner";
import { boostEnd, surfaceAt } from "../src/logic/terrain";
import { DOUGHNUT, TUNING, VIEW } from "../src/logic/tuning";
import type { LevelData } from "../src/logic/types";

const R = DOUGHNUT.outerRadius;
const base: LevelData = {
  name: "t",
  length: 100000,
  topping: "plain",
  ground: [{ x: 0, width: 100000 }],
  sausages: [],
  ramps: [],
  boosts: [],
};
const ramp = { x: 600, width: 300, height: 90 };
const withRamp: LevelData = { ...base, ramps: [ramp] };

function runUntil(s: RunnerState, level: LevelData, done: (s: RunnerState) => boolean, input = (_s: RunnerState) => ({ held: false, pressed: false })) {
  const events: RunnerEvent[] = [];
  for (let i = 0; i < 5000 && !done(s) && !s.dead; i++) events.push(...stepRunner(s, input(s), level));
  return events;
}

/** Highest the bottom of the doughnut gets above the flat ground. */
function peakAfter(level: LevelData, input: (s: RunnerState) => { held: boolean; pressed: boolean }): number {
  const s = createRunner(level);
  let top = Infinity;
  runUntil(s, level, (st) => st.x > 2000, (st) => {
    top = Math.min(top, st.y);
    return input(st);
  });
  return VIEW.groundY - (top + R);
}

describe("ramps", () => {
  it("carry the doughnut up the curve and launch it off the lip", () => {
    const s = createRunner(withRamp);
    runUntil(s, withRamp, (st) => st.x > ramp.x + ramp.width / 2);
    expect(s.grounded).toBe(true);
    expect(s.y + R).toBeCloseTo(surfaceAt(withRamp, s.x) ?? 0, 5);
    const events = runUntil(s, withRamp, (st) => st.x > ramp.x + ramp.width + 5);
    expect(events.some((e) => e.type === "launch")).toBe(true);
    expect(s.grounded).toBe(false);
    expect(s.vy).toBeLessThan(0);
    const peak = peakAfter(withRamp, () => ({ held: false, pressed: false }));
    expect(peak).toBeGreaterThan(ramp.height + 5);
  });

  it("send a jump from the lip higher than one from flat ground", () => {
    const flatJump = peakAfter(base, (st) => ({ held: true, pressed: st.x >= 880 && st.x < 884 }));
    let pressed = false;
    const lipJump = peakAfter(withRamp, (st) => {
      const press = !pressed && st.x >= ramp.x + ramp.width - 4;
      if (press) pressed = true;
      return { held: true, pressed: press };
    });
    expect(lipJump).toBeGreaterThan(flatJump + ramp.height);
  });

  it("stop a doughnut that falls into a void and meets a ramp's foot", () => {
    const level: LevelData = { ...base, ground: [{ x: 0, width: 500 }, { x: 600, width: 100000 }], ramps: [{ x: 600, width: 300, height: 60 }] };
    const s = createRunner(level);
    runUntil(s, level, () => false);
    expect(s.dead).toBe("wall");
  });

  it("can bridge a void from its edge", () => {
    const level: LevelData = {
      ...base,
      ground: [{ x: 0, width: 800 }, { x: 900, width: 100000 }],
      ramps: [{ x: 600, width: 200, height: 60 }],
    };
    const s = createRunner(level);
    runUntil(s, level, (st) => st.x > 1400);
    expect(s.dead).toBeNull();
  });
});

describe("speed pads", () => {
  const padded: LevelData = { ...base, boosts: [{ x: 600, width: 160 }] };

  it("boost a rolling doughnut above its top gear, then wear off", () => {
    const s = createRunner(padded);
    const events = runUntil(s, padded, (st) => st.x > 700);
    expect(events).toContainEqual({ type: "boost", index: 0 });
    expect(speedOf(s)).toBe(TUNING.boostSpeed);
    expect(TUNING.boostSpeed).toBeGreaterThan(TUNING.gears[TUNING.gears.length - 1]);
    runUntil(s, padded, (st) => st.x > boostEnd(padded.boosts[0]) + 1);
    expect(speedOf(s)).toBe(TUNING.gears[0]);
  });

  it("do nothing for a doughnut that jumps over them", () => {
    const s = createRunner(padded);
    let pressed = false;
    runUntil(s, padded, (st) => st.x > 900, (st) => {
      const press = !pressed && st.x > 480;
      if (press) pressed = true;
      return { held: true, pressed: press };
    });
    expect(s.boostPad).toBe(-1);
  });
});

describe("ramp and pad elements", () => {
  const file = (elements: unknown[]) => ({ format: 1, name: "t", length: 4000, topping: "plain", elements });

  it("load into a level sorted by x", () => {
    const level = buildLevel(
      parseLevelFile(
        file([
          { type: "boost", x: 2000, width: 100 },
          { type: "ramp", x: 1500, width: 200, height: 50 },
          { type: "ramp", x: 500, width: 200, height: 50 },
        ]),
      ),
    );
    expect(level.ramps.map((r) => r.x)).toEqual([500, 1500]);
    expect(level.boosts).toEqual([{ x: 2000, width: 100 }]);
  });

  it("reject overlapping ramps", () => {
    expect(() =>
      parseLevelFile(
        file([
          { type: "ramp", x: 500, width: 200, height: 50 },
          { type: "ramp", x: 650, width: 200, height: 50 },
        ]),
      ),
    ).toThrow(LevelFormatError);
  });

  it("reject a ramp taller than the limit", () => {
    expect(() => parseLevelFile(file([{ type: "ramp", x: 500, width: 200, height: 900 }]))).toThrow(/height/);
  });
});

describe("the bypass search", () => {
  it("finds a low sausage a full jump can pass over, and not one that blocks the only way across", () => {
    const level: LevelData = {
      ...base,
      length: 4000,
      ground: [
        { x: 0, width: 1000 },
        { x: 1380, width: 800 },
        { x: 2480, width: 10000 },
      ],
      sausages: [
        { x: 1170, y: 231, length: 40, thickness: 22 },
        { x: 2310, y: 320, length: 40, thickness: 22 },
      ],
    };
    expect([...findBypasses(level, { airJumps: 0, shield: false }, [0, 1])]).toEqual([1]);
  });
});
