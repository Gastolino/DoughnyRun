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

export interface LevelData {
  name: string;
  length: number;
  ground: GroundSegment[];
  /** Sorted by x. */
  sausages: Sausage[];
}
