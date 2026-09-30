import { describe, expect, it } from "vitest";
import { isOverVoid } from "../src/levels/format";
import { CAMPAIGN } from "../src/levels/index";
import { createRunner, stepRunner } from "../src/logic/runner";
import { solveLevel, STEPS_PER_DECISION } from "../src/logic/solver";
import type { SolveResult } from "../src/logic/solver";
import { runnerOptionsFor, TOPPINGS } from "../src/logic/toppings";

// Every campaign level ships only if the solver can finish it with its own
// topping and thread every sausage in one run. A level with a new topping
// must also be impossible without it, so that the unlock matters; and on a
// level with no air jump, no sausage over a void can be avoided.

describe.each(CAMPAIGN.map((c) => [c.id, c] as const))("level %s", (_id, { level }) => {
  const options = runnerOptionsFor(level.topping);
  let solved: SolveResult | undefined;
  const solve = (): SolveResult => (solved ??= solveLevel(level, options));

  it("can be cleared with its topping", () => {
    const result = solve();
    expect(result.solvable, `stuck near x=${Math.round(result.furthestX)}`).toBe(true);
  });

  it("lets every sausage be threaded in one run", () => {
    const result = solveLevel(level, { ...options, mustThread: level.sausages.map((_, i) => i) });
    expect(result.solvable, `stuck near x=${Math.round(result.furthestX)}`).toBe(true);
  });

  it("is cleared when the solver's inputs are fed back step by step", () => {
    const inputs = solve().inputs ?? [];
    const s = createRunner(level, options);
    for (let step = 0; !s.dead && !s.finished && step < inputs.length * STEPS_PER_DECISION; step++) {
      const d = inputs[Math.floor(step / STEPS_PER_DECISION)];
      stepRunner(s, { held: d.held, pressed: d.pressed && step % STEPS_PER_DECISION === 0 }, level, options);
    }
    expect(s.dead).toBeNull();
    expect(s.finished).toBe(true);
  });

  if (TOPPINGS[level.topping].airJumps > 0) {
    it("cannot be cleared without its topping", () => {
      expect(solveLevel(level, runnerOptionsFor("plain")).solvable).toBe(false);
    });
  } else {
    const voidSausages = level.sausages.map((s, i) => [i, s] as const).filter(([, s]) => isOverVoid(level, s));
    it.each(voidSausages.map(([i, s]) => [i, s.x]))("forces sausage %i at x=%i through the hole", (i) => {
      const result = solveLevel(level, { ...options, solidSausage: i });
      expect(result.solvable, "the doughnut got past without threading it").toBe(false);
    });
  }
});

describe("campaign", () => {
  it("starts plain and unlocks glaze on the second level", () => {
    expect(CAMPAIGN.map((c) => c.level.topping)).toEqual(["plain", "glaze"]);
  });
});
