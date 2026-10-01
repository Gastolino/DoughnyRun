import { describe, expect, it } from "vitest";
import { CAMPAIGN } from "../../src/levels/index";
import { createRunner, stepRunner } from "../../src/logic/runner";
import { solveLevel, STEPS_PER_DECISION } from "../../src/logic/solver";
import type { SolveResult } from "../../src/logic/solver";
import { runnerOptionsFor, TOPPINGS } from "../../src/logic/toppings";

// Every campaign level ships only if the solver can finish it with its own
// topping. A skipped sausage ends the run, so a finish threads every one. A
// level that brings in a new topping must also be impossible with the one
// before it, so that the unlock matters.
//
// Each level has its own test file, so that the levels' searches run side by
// side.

export function checkLevel(id: string): void {
  const index = CAMPAIGN.findIndex((c) => c.id === id);
  if (index < 0) throw new Error(`No campaign level ${id}`);
  const { level } = CAMPAIGN[index];
  // A topping new to the campaign here is checked against the one before it.
  const newTopping = !CAMPAIGN.slice(0, index).some((c) => c.level.topping === level.topping);
  const before = index > 0 && newTopping ? CAMPAIGN[index - 1].level.topping : null;
  const options = runnerOptionsFor(level.topping);

  describe(`level ${id}`, () => {
    let solved: SolveResult | undefined;
    const solve = (): SolveResult => (solved ??= solveLevel(level, options));

    // A boss's chase, or long flights with many air jumps, make the search
    // much larger.
    it("can be cleared with its topping", { timeout: 240_000 }, () => {
      const result = solve();
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

    if (before !== null) {
      it(`cannot be cleared with the topping before it, ${TOPPINGS[before].name}`, { timeout: 240_000 }, () => {
        // Without a boss's chase, which only adds ways to lose, so that the
        // search stays small.
        const unchased = { ...level, chaser: undefined };
        expect(solveLevel(unchased, runnerOptionsFor(before)).solvable).toBe(false);
      });
    }
  });
}
