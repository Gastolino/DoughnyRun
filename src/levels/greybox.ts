import { VIEW } from "../logic/tuning";
import type { LevelData, Sausage } from "../logic/types";

// Hole height for a doughnut rolling along the ground.
const RUN = VIEW.groundY - 48;

const cocktail = (x: number, y: number, length = 40): Sausage => ({
  kind: "thread",
  x,
  y,
  length,
  thickness: 16,
});
// A sausage lying on the ground, which the doughnut must jump over.
const hurdle = (x: number, length = 60): Sausage => ({
  kind: "hurdle",
  x,
  y: VIEW.groundY - 8,
  length,
  thickness: 16,
});

export const GREYBOX: LevelData = {
  name: "Greybox 1-1",
  length: 6400,
  ground: [
    { x: 0, width: 1500 },
    { x: 1640, width: 1360 },
    { x: 3160, width: 1240 },
    { x: 4560, width: 2400 },
  ],
  sausages: [
    // Lesson 1: the sausage sits at hole height, so running straight threads it.
    cocktail(700, RUN, 220),
    // Lesson 2: a sausage on the ground has to be jumped.
    hurdle(1150),
    // Lesson 3: a full jump threads a sausage at the top of the arc.
    cocktail(2050, 265),
    // Lesson 4: a partial jump, released early, threads a lower sausage.
    cocktail(2500, 378),
    // Mixed: over one, through the next, over a gap, through another.
    hurdle(3300),
    cocktail(3700, 300),
    cocktail(4120, RUN, 160),
    cocktail(4900, 265),
    hurdle(5300, 90),
    cocktail(5700, 330),
    cocktail(6000, RUN, 200),
  ],
};
