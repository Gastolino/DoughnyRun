import { buildLevel, RUN_HEIGHT, sausage } from "./build";
import type { Gap } from "./build";
import type { Sausage } from "../logic/types";

// A raised sausage with a void beneath it. Running under it drops the
// doughnut into the void, and it hangs too high to jump over, so the only
// way across is through it. The tests prove this for every such pair.
function overVoid(x: number, y: number, length: number, voidWidth: number): [Sausage, Gap] {
  const centre = x + length / 2;
  return [sausage(x, y, length), { x: centre - voidWidth / 2, width: voidWidth }];
}

// Raised sausages sit just below the top of a full jump. Lower ones over a
// void leave the player almost no time to press, because a jump released
// early to meet them falls short of the far side.
const raised = [
  overVoid(2000, 231, 40, 380),
  overVoid(3400, 231, 40, 380),
  overVoid(4500, 233, 40, 370),
];

export const GREYBOX = buildLevel({
  name: "Greybox 1-1",
  length: 6400,
  gaps: [
    // A plain gap to teach jumping before any raised sausage appears.
    { x: 1300, width: 140 },
    ...raised.map(([, gap]) => gap),
  ],
  sausages: [
    // The first sausage sits at hole height, so running straight threads it
    // dead centre: a perfect grind that shows the player the reward.
    sausage(700, RUN_HEIGHT, 220),
    sausage(3900, RUN_HEIGHT, 160),
    sausage(5700, RUN_HEIGHT, 200),
    // Optional grinds over solid ground. A partial jump threads them for
    // points and speed; running underneath costs the chain.
    sausage(2700, 300, 40),
    sausage(5100, 310, 40),
    ...raised.map(([s]) => s),
  ],
});
