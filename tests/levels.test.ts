import { describe, expect, it } from "vitest";
import { GREYBOX } from "../src/levels/greybox";
import { createRunner, stepRunner } from "../src/logic/runner";
import { solveLevel, STEPS_PER_DECISION } from "../src/logic/solver";
import { DOUGHNUT, VIEW } from "../src/logic/tuning";
import type { LevelData } from "../src/logic/types";

// Every level ships only if the solver finds a way through it with the
// toppings the player has by then.

describe("levels", () => {
  it("greybox level can be cleared with a plain doughnut", () => {
    const result = solveLevel(GREYBOX);
    expect(result.solvable, `stuck near x=${Math.round(result.furthestX)}`).toBe(true);
  });

  it("solver rejects a raised sausage too long for a single jump", () => {
    const level: LevelData = {
      name: "too long",
      length: 1600,
      ground: [{ x: 0, width: 1600 }],
      sausages: [{ kind: "thread", x: 700, y: VIEW.groundY - DOUGHNUT.outerRadius - 150, length: 400, thickness: 16 }],
    };
    expect(solveLevel(level).solvable).toBe(false);
  });
});

describe("solver replay", () => {
  it("clears the greybox level when its inputs are fed back step by step", () => {
    const inputs = solveLevel(GREYBOX).inputs ?? [];
    const s = createRunner(GREYBOX);
    for (let step = 0; !s.dead && !s.finished && step < inputs.length * STEPS_PER_DECISION; step++) {
      const d = inputs[Math.floor(step / STEPS_PER_DECISION)];
      stepRunner(s, { held: d.held, pressed: d.pressed && step % STEPS_PER_DECISION === 0 }, GREYBOX);
    }
    expect(s.dead).toBeNull();
    expect(s.finished).toBe(true);
  });
});
