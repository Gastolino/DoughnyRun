import { describe, expect, it } from "vitest";
import { isOverVoid } from "../src/levels/build";
import { GREYBOX } from "../src/levels/greybox";
import { createRunner, PLAIN, stepRunner } from "../src/logic/runner";
import { solveLevel, STEPS_PER_DECISION } from "../src/logic/solver";
import type { SolveResult } from "../src/logic/solver";
import type { LevelData } from "../src/logic/types";

// Every level ships only if the solver finds a way through it with the
// toppings the player has by then, and only if no sausage over a void can be
// avoided.

const LEVELS: LevelData[] = [GREYBOX];

describe.each(LEVELS)("$name", (level) => {
  let solved: SolveResult | undefined;
  const solve = (): SolveResult => (solved ??= solveLevel(level, PLAIN));

  it("can be cleared", () => {
    const result = solve();
    expect(result.solvable, `stuck near x=${Math.round(result.furthestX)}`).toBe(true);
  });

  const voidSausages = level.sausages.map((s, i) => [i, s] as const).filter(([, s]) => isOverVoid(level, s));

  it("has raised sausages over voids", () => {
    expect(voidSausages.length).toBeGreaterThan(0);
  });

  it.each(voidSausages.map(([i, s]) => [i, s.x]))("forces sausage %i at x=%i through the hole", (i) => {
    const result = solveLevel(level, { ...PLAIN, solidSausage: i });
    expect(result.solvable, "the doughnut got past without threading it").toBe(false);
  });

  it("is cleared when the solver's inputs are fed back step by step", () => {
    const inputs = solve().inputs ?? [];
    const s = createRunner(level);
    for (let step = 0; !s.dead && !s.finished && step < inputs.length * STEPS_PER_DECISION; step++) {
      const d = inputs[Math.floor(step / STEPS_PER_DECISION)];
      stepRunner(s, { held: d.held, pressed: d.pressed && step % STEPS_PER_DECISION === 0 }, level);
    }
    expect(s.dead).toBeNull();
    expect(s.finished).toBe(true);
  });
});
