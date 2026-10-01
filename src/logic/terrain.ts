import { TUNING, VIEW } from "./tuning";
import type { Boost, Hills, LevelData, Ramp, Vehicle } from "./types";

// The height of the ground under the doughnut. Flat ground sits at
// VIEW.groundY; a ramp rises above it on a curve that steepens towards the
// lip, like a skate kicker. A ramp is solid all the way down, so one placed at
// the edge of a void can launch the doughnut across it. Hills roll up and
// down on top of the ground, and where a gap cuts through them it leaves a
// cliff as tall as the hill at that point. Parked cabs and hot dog carts are
// solid blocks to land on, with sides to crash into.

/** Sizes of the vehicles, and the heights of a cab's body along its length. */
export const VEHICLES = {
  cab: { width: 240, trunk: 58, roof: 104, hood: 62 },
  cart: { width: 170, height: 86 },
} as const;

// A cab's top from back to front, as (share of its length, height): the
// trunk, up the rear window, along the roof, down the windscreen, the hood.
const CAB_PROFILE: readonly [number, number][] = [
  [0, VEHICLES.cab.trunk],
  [0.18, VEHICLES.cab.trunk],
  [0.36, VEHICLES.cab.roof],
  [0.64, VEHICLES.cab.roof],
  [0.8, VEHICLES.cab.hood],
  [1, VEHICLES.cab.hood],
];

export function vehicleWidth(v: Vehicle): number {
  return v.kind === "cab" ? VEHICLES.cab.width : VEHICLES.cart.width;
}

/** Height of a vehicle's top above the ground at x, and its upward slope. */
export function vehicleTop(v: Vehicle, x: number): { rise: number; slope: number } {
  if (v.kind === "cart") return { rise: VEHICLES.cart.height, slope: 0 };
  const w = VEHICLES.cab.width;
  const t = Math.min(1, Math.max(0, (x - v.x) / w));
  for (let i = 1; i < CAB_PROFILE.length; i++) {
    const [t1, h1] = CAB_PROFILE[i];
    if (t <= t1) {
      const [t0, h0] = CAB_PROFILE[i - 1];
      const slope = (h1 - h0) / ((t1 - t0) * w);
      return { rise: h0 + slope * (t - t0) * w, slope };
    }
  }
  return { rise: VEHICLES.cab.hood, slope: 0 };
}

export function vehicleAt(level: LevelData, x: number): Vehicle | null {
  for (const v of level.vehicles) {
    if (v.x > x) break;
    if (x <= v.x + vehicleWidth(v)) return v;
  }
  return null;
}

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
  const v = vehicleAt(level, x);
  if (v) return VIEW.groundY - vehicleTop(v, x).rise;
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
  const v = vehicleAt(level, x);
  if (v) return vehicleTop(v, x).slope;
  const h = hillsAt(level, x);
  return h ? hillsSlope(h, x) : 0;
}

/** Where a boost from this pad runs out. */
export function boostEnd(b: Boost): number {
  return b.x + b.width + TUNING.boostDistance;
}
