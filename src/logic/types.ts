import type { ToppingId } from "./toppings";

export interface Sausage {
  /** Left end of the sausage in world pixels. */
  x: number;
  /** Vertical centre of the sausage in world pixels. */
  y: number;
  length: number;
  thickness: number;
}

export interface GroundSegment {
  x: number;
  width: number;
}

/**
 * A kicker ramp. Its surface curves up from the ground at x to its full
 * height at the lip, x + width, and then drops straight back down. A doughnut
 * rolling off the lip keeps the lip's upward speed.
 */
export interface Ramp {
  x: number;
  width: number;
  height: number;
}

/**
 * Rolling hills: the ground's surface rises and falls in even waves, from
 * ground level at x up to `height` at each crest and back, `waves` times over
 * `width`. Hills lie on the ground, so a gap cuts through them as a cliff.
 */
export interface Hills {
  x: number;
  width: number;
  height: number;
  waves: number;
}

/** A speed pad on the ground. Rolling over it sends the doughnut into boost. */
export interface Boost {
  x: number;
  width: number;
}

/** A level ready to play: ground worked out from the gaps, sausages sorted. */
export interface LevelData {
  name: string;
  length: number;
  /** The topping the doughnut wears, which sets its jumps. */
  topping: ToppingId;
  ground: GroundSegment[];
  /** Sorted by x. */
  sausages: Sausage[];
  /** Sorted by x, and never overlapping. */
  ramps: Ramp[];
  /** Sorted by x. */
  boosts: Boost[];
  /** Sorted by x, and never overlapping each other or a ramp. */
  hills: Hills[];
}
