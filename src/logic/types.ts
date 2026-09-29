/**
 * A "thread" sausage must pass through the hole; running past one without
 * threading it counts as a crash. A "hurdle" lies on the ground and must be
 * jumped over.
 */
export type SausageKind = "thread" | "hurdle";

export interface Sausage {
  kind: SausageKind;
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
  sausages: Sausage[];
}
