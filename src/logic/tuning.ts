// Every number that shapes how the game feels lives here, so that tuning
// never requires hunting through scene code. Units are pixels and seconds.

export const TUNING = {
  // The doughnut runs in gears. It starts in the first; good grinds shift it
  // up and sloppy grinds or skipped sausages shift it down. Discrete gears
  // keep the level solver's search small and give the player a speed they
  // can read at a glance.
  // The top gear is capped by the one-jump levels: above about 520 px/s a
  // low hop clears a void that is still narrow enough to thread at 320, so a
  // raised sausage over it could be skipped. The level tests catch this.
  gears: [320, 360, 400, 440, 490, 520],
  // A speed pad lifts the doughnut above its top gear for a stretch of
  // ground, measured from the pad's far end. Levels place pads where the
  // extra speed cannot be used to hop a void without threading its sausage.
  boostSpeed: 700,
  boostDistance: 1400,
  gravity: 2200,
  jumpVelocity: 820,
  // Releasing jump while rising multiplies the upward speed by this factor,
  // which gives the player control over jump height.
  jumpCutFactor: 0.45,
  maxFallSpeed: 1400,
  // Near the top of a jump held all the way up, gravity weakens so that the
  // doughnut hangs in the air for a moment. That moment is when it threads
  // raised sausages.
  apexHangSpeed: 300,
  apexHangGravityFactor: 0.35,
  coyoteTime: 0.1,
  jumpBufferTime: 0.12,
  fixedStep: 1 / 120,
} as const;

// The doughnut stands on edge with its hole facing the direction of travel.
// Seen from the side it is a narrow ring: tall, with the hole as a vertical gap.
export const DOUGHNUT = {
  outerRadius: 48,
  holeRadius: 28,
  // Horizontal half-width of the ring as drawn in three-quarter view.
  halfWidth: 16,
  // Extra pixels the hole forgives beyond its drawn size. Players judge a
  // near miss by what they see, so the hitbox is slightly kinder than the art.
  holeForgiveness: 4,
} as const;

export const VIEW = {
  width: 960,
  height: 540,
  groundY: 460,
  // Horizontal screen position the doughnut is held at while the camera follows.
  playerScreenX: 260,
} as const;

export type Grade = "perfect" | "great" | "good" | "sloppy";

// A grind is graded by how far, on average, the sausage sat from the centre
// of the hole while it passed through, as a fraction of the most it could be
// off-centre without touching the dough. Grades are checked in order.
export const GRIND = {
  grades: [
    { grade: "perfect", maxOffset: 0.15, points: 3, gears: 2, keepsChain: true },
    { grade: "great", maxOffset: 0.35, points: 2, gears: 1, keepsChain: true },
    { grade: "good", maxOffset: 0.6, points: 1.5, gears: 0, keepsChain: true },
    { grade: "sloppy", maxOffset: Infinity, points: 1, gears: -1, keepsChain: false },
  ] as const satisfies readonly {
    grade: Grade;
    maxOffset: number;
    points: number;
    gears: number;
    keepsChain: boolean;
  }[],
  // Points per pixel of sausage length, before the grade and chain multipliers.
  pointsPerPixel: 1,
  // Each grind in an unbroken chain adds this much to the multiplier.
  chainStep: 0.5,
  maxChain: 8,
  // Gears lost when the doughnut passes a sausage without threading it.
  skipGears: -1,
} as const;
