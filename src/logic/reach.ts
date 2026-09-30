import { createRunner, stepRunner } from "./runner";
import { DOUGHNUT, VIEW } from "./tuning";
import type { LevelData } from "./types";

// How high the doughnut's hole can reach, found by running the simulation on
// flat ground rather than by formula, so that the editor's guide lines stay
// true whenever the tuning changes.

export interface Reach {
  /** Hole centre while rolling along the ground. */
  run: number;
  /** Highest hole centre of a held jump. */
  single: number;
  /** Highest hole centre of a held jump with an air jump at its top. */
  double: number;
}

const FLAT: LevelData = {
  name: "flat",
  length: 1e6,
  topping: "glaze",
  ground: [{ x: 0, width: 1e6 }],
  sausages: [],
};

function highest(airJumps: number): number {
  const s = createRunner(FLAT, { airJumps });
  let top = s.y;
  let usedAir = false;
  for (let i = 0; i < 1200; i++) {
    // Press again once the first jump has stopped rising.
    const airPress = airJumps > 0 && !usedAir && i > 1 && !s.grounded && s.vy >= 0;
    if (airPress) usedAir = true;
    stepRunner(s, { held: true, pressed: i === 0 || airPress }, FLAT, { airJumps });
    top = Math.min(top, s.y);
    if (i > 2 && s.grounded) break;
  }
  return top;
}

let cached: Reach | null = null;

export function reachHeights(): Reach {
  cached ??= { run: VIEW.groundY - DOUGHNUT.outerRadius, single: highest(0), double: highest(1) };
  return cached;
}
