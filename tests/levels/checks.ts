import { describe, expect, it } from "vitest";
import { isOverVoid } from "../../src/levels/format";
import { CAMPAIGN } from "../../src/levels/index";
import { createRunner, stepRunner } from "../../src/logic/runner";
import { findBypasses, solveLevel, STEPS_PER_DECISION } from "../../src/logic/solver";
import type { SolveResult } from "../../src/logic/solver";
import { runnerOptionsFor, TOPPINGS } from "../../src/logic/toppings";

// Every campaign level ships only if the solver can finish it with its own
// topping and thread every sausage in one run. A level with a new topping
// must also be impossible without it, so that the unlock matters; and on a
// level with no air jump, no sausage over a void can be avoided.
//
// Each level has its own test file, so that the levels' searches run side by
// side; the longest takes most of a minute.

export function checkLevel(id: string): void {
  const entry = CAMPAIGN.find((c) => c.id === id);
  if (!entry) throw new Error(`No campaign level ${id}`);
  const { level } = entry;
  const options = runnerOptionsFor(level.topping);

  describe(`level ${id}`, () => {
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
      const voids = level.sausages.flatMap((s, i) => (isOverVoid(level, s) ? [i] : []));
      it(`forces every sausage over a void through the hole (${voids.length})`, { timeout: 240_000 }, () => {
        // Without the sunglasses' free crash, which may deliberately smash one sausage.
        const bypassed = findBypasses(level, { ...options, shield: false }, voids);
        const where = [...bypassed].map((i) => `#${i} at x=${level.sausages[i].x}`).join(", ");
        expect(where, "the doughnut got past these without threading them").toBe("");
      });
    }
  });
}
