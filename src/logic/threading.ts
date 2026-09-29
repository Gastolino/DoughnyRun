import { DOUGHNUT } from "./tuning";
import type { Sausage } from "./types";

export type ThreadResult = "clear" | "threaded" | "hit";

export interface RingShape {
  cx: number;
  cy: number;
  outerRadius: number;
  holeRadius: number;
  halfWidth: number;
  holeForgiveness: number;
}

export function ringAt(cx: number, cy: number): RingShape {
  return { cx, cy, ...DOUGHNUT };
}

/**
 * Decides how a doughnut and a sausage relate at one instant.
 *
 * Because the hole faces the direction of travel, a sausage lying along
 * that direction passes through it whenever the sausage's whole thickness
 * sits inside the hole's vertical span. If any part of the sausage overlaps
 * the dough instead, the doughnut crashes. A sausage entirely above or
 * below the ring does not touch it at all.
 */
export function checkSausage(ring: RingShape, sausage: Sausage): ThreadResult {
  const ringLeft = ring.cx - ring.halfWidth;
  const ringRight = ring.cx + ring.halfWidth;
  if (ringRight <= sausage.x || ringLeft >= sausage.x + sausage.length) {
    return "clear";
  }

  const top = sausage.y - sausage.thickness / 2;
  const bottom = sausage.y + sausage.thickness / 2;

  if (bottom <= ring.cy - ring.outerRadius || top >= ring.cy + ring.outerRadius) {
    return "clear";
  }

  const holeTop = ring.cy - ring.holeRadius - ring.holeForgiveness;
  const holeBottom = ring.cy + ring.holeRadius + ring.holeForgiveness;
  if (top >= holeTop && bottom <= holeBottom) {
    return "threaded";
  }
  return "hit";
}

/**
 * How far the sausage sits from the centre of the hole, as a fraction of the
 * furthest it can be off-centre and still pass through: 0 is dead centre and
 * 1 is grazing the dough.
 */
export function centreOffset(ring: RingShape, sausage: Sausage): number {
  const slack = ring.holeRadius + ring.holeForgiveness - sausage.thickness / 2;
  if (slack <= 0) return 0;
  return Math.min(1, Math.abs(sausage.y - ring.cy) / slack);
}
