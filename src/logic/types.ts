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

/** A level ready to play: ground worked out from the gaps, sausages sorted. */
export interface LevelData {
  name: string;
  length: number;
  /** The topping the doughnut wears, which sets its jumps. */
  topping: ToppingId;
  ground: GroundSegment[];
  /** Sorted by x. */
  sausages: Sausage[];
}
