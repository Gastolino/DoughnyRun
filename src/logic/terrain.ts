import { TUNING, VIEW } from "./tuning";
import type { Boost, Hills, LevelData, Ramp } from "./types";

// The height of the ground under the doughnut. Flat ground sits at
// VIEW.groundY; a ramp rises above it on a curve that steepens towards the
// lip, like a skate kicker. A ramp is solid all the way down, so one placed at
// the edge of a void can launch the doughnut across it. Hills roll up and
// down on top of the ground, and where a gap cuts through them it leaves a
// cliff as tall as the hill at that point.

/** Height of a ramp's surface above the ground at x, or 0 off the ramp. */
export function rampRise(r: Ramp, x: number): number {
  if (x < r.x || x > r.x + r.width) return 0;
  const t = (x - r.x) / r.width;
  return r.height * t * t;
}

/** Upward slope of a ramp at x (rise per pixel of run), or 0 off the ramp. */
export function rampSlope(r: Ramp, x: number): number {
  if (x < r.x || x > r.x + r.width) return 0;
  return (2 * r.height * (x - r.x)) / (r.width * r.width);
}

/** Height of the hills' surface above the ground at x, or 0 off them. */
export function hillsRise(h: Hills, x: number): number {
  if (x < h.x || x > h.x + h.width) return 0;
  return (h.height * (1 - Math.cos((2 * Math.PI * h.waves * (x - h.x)) / h.width))) / 2;
}

/** Upward slope of the hills at x, or 0 off them. */
export function hillsSlope(h: Hills, x: number): number {
  if (x < h.x || x > h.x + h.width) return 0;
  const k = (2 * Math.PI * h.waves) / h.width;
  return ((h.height * k) / 2) * Math.sin(k * (x - h.x));
}

export function hillsAt(level: LevelData, x: number): Hills | null {
  for (const h of level.hills) {
    if (h.x > x) break;
    if (x <= h.x + h.width) return h;
  }
  return null;
}

export function rampAt(level: LevelData, x: number): Ramp | null {
  for (const r of level.ramps) {
    if (r.x > x) break;
    if (x <= r.x + r.width) return r;
  }
  return null;
}

/** The surface's y at x, or null over a void. */
export function surfaceAt(level: LevelData, x: number): number | null {
  const r = rampAt(level, x);
  if (r) return VIEW.groundY - rampRise(r, x);
  for (const g of level.ground) {
    if (x >= g.x && x <= g.x + g.width) {
      const h = hillsAt(level, x);
      return VIEW.groundY - (h ? hillsRise(h, x) : 0);
    }
  }
  return null;
}

/** Upward slope of the surface at x. */
export function slopeAt(level: LevelData, x: number): number {
  const r = rampAt(level, x);
  if (r) return rampSlope(r, x);
  const h = hillsAt(level, x);
  return h ? hillsSlope(h, x) : 0;
}

/** Where a boost from this pad runs out. */
export function boostEnd(b: Boost): number {
  return b.x + b.width + TUNING.boostDistance;
}
