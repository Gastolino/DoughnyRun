import type { ToppingId } from "./toppings";

export type Theme = "candy" | "city";

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

/**
 * A parked vehicle, solid to the ground: a doughnut can land on top and roll
 * along it, but running into its side is a crash. A cab's top follows its
 * body from the trunk over the roof to the hood; a hot dog cart is flat.
 */
export interface Vehicle {
  kind: "cab" | "cart";
  x: number;
}

/** A street crossing, drawn as asphalt with a crosswalk. It is scenery only. */
export interface Street {
  x: number;
  width: number;
}

/** A speed pad on the ground. Rolling over it sends the doughnut into boost. */
export interface Boost {
  x: number;
  width: number;
}

/**
 * The boss chase: wind-up dentures that start `gap` pixels behind the
 * doughnut and run at a speed rising from `speed` to `speedEnd` over the
 * level, so a doughnut in a faster gear pulls away and a slower one is
 * caught. They never fall further behind than they started, and when they
 * reach the doughnut they chomp it.
 */
export interface Chaser {
  gap: number;
  speed: number;
  speedEnd: number;
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
  /** Sorted by x, and never overlapping each other, a ramp or hills. */
  vehicles: Vehicle[];
  /** Street crossings, for the city's scenery. */
  streets: Street[];
  /** Present on a boss level. */
  chaser?: Chaser;
  /** Which world's look the level wears. */
  theme: Theme;
}
