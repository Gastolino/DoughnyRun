import { boostEnd, rampAt, rampSlope, slopeAt, surfaceAt } from "./terrain";
import { centreOffset, checkSausage, ringAt } from "./threading";
import { DOUGHNUT, GRIND, TUNING, VIEW } from "./tuning";
import type { Grade } from "./tuning";
import type { LevelData } from "./types";

// A pure simulation of the doughnut. The scene feeds it input and draws the
// result; tests and the level solver drive it directly, so that what the
// tests prove about a level is what the player experiences.

export interface RunnerOptions {
  airJumps: number;
  /**
   * In top gear the doughnut wears its sunglasses, and they absorb one crash
   * into a sausage (not a fall, a cliff or a skipped sausage). On by default.
   */
  shield?: boolean;
}

export const PLAIN: RunnerOptions = { airJumps: 0 };

export interface RunnerInput {
  /** Jump button is currently down. */
  held: boolean;
  /** Jump button went down since the previous step. */
  pressed: boolean;
}

/**
 * How a run ends early. A doughnut that passes a sausage without threading
 * it is arrested: every sausage must go through the hole.
 */
export type DeathCause = "sausage" | "fell" | "wall" | "arrested";

/** A sausage currently passing through the hole. */
export interface Grind {
  index: number;
  offsetSum: number;
  steps: number;
}

export interface RunnerState {
  x: number;
  y: number;
  vy: number;
  /** Index into TUNING.gears. */
  gear: number;
  grounded: boolean;
  coyote: number;
  buffer: number;
  /** The jump has been held since takeoff: it can still be cut, and it hangs at the top. */
  canCutJump: boolean;
  airJumpsLeft: number;
  grinds: Grind[];
  /** Index of the first sausage the doughnut has not yet passed. */
  nextSausage: number;
  /** Indices of every sausage threaded so far. */
  threaded: number[];
  score: number;
  chain: number;
  /** Grinds finished since the doughnut last touched the ground. */
  airGrinds: number;
  /** Sausages the doughnut smashed through on its free crash. */
  smashed: number[];
  /** Index of the speed pad whose boost is running, or -1. */
  boostPad: number;
  dead: DeathCause | null;
  finished: boolean;
}

export interface GrindResult {
  index: number;
  grade: Grade;
  /** Mean distance from the centre of the hole, from 0 (dead centre) to 1. */
  offset: number;
  points: number;
  chain: number;
  /** Grinds in the current flight when this is the second or later, else 0. */
  airCombo: number;
}

export type RunnerEvent =
  | { type: "jump" }
  | { type: "airJump" }
  | { type: "land" }
  /** Left the surface without jumping, going upwards: off a ramp's lip. */
  | { type: "launch" }
  /** Rolled onto a speed pad. */
  | { type: "boost"; index: number }
  | { type: "grindStart"; index: number }
  | ({ type: "grindEnd" } & GrindResult)
  | { type: "die"; cause: DeathCause }
  /** The sunglasses absorbed a crash; the doughnut carries on in first gear. */
  | { type: "save"; index: number }
  | { type: "finish" };

const R = DOUGHNUT.outerRadius;
// How far below the surface the doughnut may sink within one step and still
// be caught by the ground rather than counted as having fallen past it.
const SURFACE_TOLERANCE = 2;
// How far a surface may fall away within one step and still hold a rolling
// doughnut: far more than any hill curves, far less than a ramp's lip drops.
const STICK = 4;

export function createRunner(level: LevelData, options: RunnerOptions = PLAIN): RunnerState {
  const x = level.ground[0]?.x ?? 0;
  return {
    x: x + 80,
    y: VIEW.groundY - R,
    vy: 0,
    gear: 0,
    grounded: true,
    coyote: TUNING.coyoteTime,
    buffer: 0,
    canCutJump: false,
    airJumpsLeft: options.airJumps,
    grinds: [],
    nextSausage: 0,
    threaded: [],
    score: 0,
    chain: 0,
    airGrinds: 0,
    smashed: [],
    boostPad: -1,
    dead: null,
    finished: false,
  };
}

export function cloneRunner(s: RunnerState): RunnerState {
  return {
    ...s,
    grinds: s.grinds.map((g) => ({ ...g })),
    threaded: [...s.threaded],
    smashed: [...s.smashed],
  };
}

export function gradeFor(offset: number) {
  return GRIND.grades.find((g) => offset <= g.maxOffset) ?? GRIND.grades[GRIND.grades.length - 1];
}

/** Advances the simulation by one fixed step, mutating the state. */
export function stepRunner(
  s: RunnerState,
  input: RunnerInput,
  level: LevelData,
  options: RunnerOptions = PLAIN,
  dt: number = TUNING.fixedStep,
): RunnerEvent[] {
  const events: RunnerEvent[] = [];
  if (s.dead || s.finished) return events;

  const prevX = s.x;
  s.x += speedOf(s) * dt;
  if (s.boostPad >= 0 && s.x > boostEnd(level.boosts[s.boostPad])) s.boostPad = -1;
  s.buffer = input.pressed ? TUNING.jumpBufferTime : Math.max(0, s.buffer - dt);
  s.coyote = s.grounded ? TUNING.coyoteTime : Math.max(0, s.coyote - dt);

  if (s.buffer > 0 && (s.grounded || s.coyote > 0)) {
    // A jump from a ramp gets the ramp's kick: the upward speed of its lip,
    // wherever on the ramp the jump is taken. Just off the lip, the doughnut
    // still carries that speed.
    const ramp = s.grounded ? rampAt(level, s.x) : null;
    const kick = ramp ? -speedOf(s) * rampSlope(ramp, ramp.x + ramp.width) : Math.min(0, s.vy);
    s.vy = -TUNING.jumpVelocity + kick;
    s.grounded = false;
    s.coyote = 0;
    s.buffer = 0;
    s.canCutJump = true;
    events.push({ type: "jump" });
  } else if (input.pressed && !s.grounded && s.airJumpsLeft > 0) {
    s.vy = -TUNING.jumpVelocity;
    s.airJumpsLeft -= 1;
    s.buffer = 0;
    s.canCutJump = true;
    events.push({ type: "airJump" });
  }

  if (!input.held && s.canCutJump && s.vy < 0) {
    s.vy *= TUNING.jumpCutFactor;
    s.canCutJump = false;
  }

  const prevBottom = s.y + R;
  // A jump held all the way up hangs at the top, whether or not the button
  // is let go once it has stopped rising. So the only choice a jump offers is
  // when to cut it, which keeps the solver's search small.
  const hanging = s.canCutJump && Math.abs(s.vy) < TUNING.apexHangSpeed;
  const gravity = hanging ? TUNING.gravity * TUNING.apexHangGravityFactor : TUNING.gravity;
  s.vy = Math.min(s.vy + gravity * dt, TUNING.maxFallSpeed);
  s.y += s.vy * dt;
  const bottom = s.y + R;

  const surface = surfaceAt(level, s.x);
  let touching = false;
  if (surface !== null) {
    // Rolling up a ramp or off its lip, the surface moves between steps, so
    // the doughnut is measured against the lower of the two surfaces.
    const prevSurface = surfaceAt(level, prevX) ?? surface;
    if (prevBottom > Math.max(surface, prevSurface) + SURFACE_TOLERANCE) {
      // Already below the surface when the ground arrived: the doughnut has
      // run into the side of a cliff.
      return die(s, "wall", events);
    }
    // A rolling doughnut hugs a surface that curves away beneath it, as over
    // the top of a hill; only a drop, such as a ramp's lip, throws it clear.
    const hugging = s.grounded && surface - bottom <= STICK;
    if (bottom >= surface || hugging) {
      s.y = surface - R;
      // On a slope the surface itself rises or falls; the doughnut rides it
      // at that speed, and keeps it when it leaves a ramp's lip.
      const surfaceVy = -speedOf(s) * slopeAt(level, s.x);
      if (s.vy >= surfaceVy || hugging) {
        touching = true;
        s.vy = surfaceVy;
        if (!s.grounded) events.push({ type: "land" });
        s.grounded = true;
        s.airGrinds = 0;
        s.canCutJump = false;
        s.airJumpsLeft = options.airJumps;
      }
    }
  }
  if (!touching && s.grounded) {
    s.grounded = false;
    if (s.vy < 0) events.push({ type: "launch" });
  }

  if (s.grounded) {
    for (let i = 0; i < level.boosts.length; i++) {
      const b = level.boosts[i];
      if (b.x > s.x) break;
      if (s.x <= b.x + b.width && s.boostPad !== i) {
        s.boostPad = i;
        events.push({ type: "boost", index: i });
      }
    }
  }

  if (s.y - R > VIEW.height) return die(s, "fell", events);

  const ring = ringAt(s.x, s.y);
  for (let i = s.nextSausage; i < level.sausages.length; i++) {
    const sausage = level.sausages[i];
    if (sausage.x > ring.cx + ring.halfWidth) break;
    if (s.smashed.includes(i)) continue;
    const result = checkSausage(ring, sausage);
    const grind = s.grinds.find((g) => g.index === i);
    if (result === "hit") {
      if (!shielded(s, options)) return die(s, "sausage", events);
      // The sunglasses take the hit: the doughnut smashes through this sausage.
      s.smashed.push(i);
      s.grinds = s.grinds.filter((g) => g.index !== i);
      s.gear = 0;
      s.chain = 0;
      events.push({ type: "save", index: i });
      continue;
    }
    if (result === "threaded") {
      if (grind) {
        grind.offsetSum += centreOffset(ring, sausage);
        grind.steps += 1;
      } else {
        s.grinds.push({ index: i, offsetSum: centreOffset(ring, sausage), steps: 1 });
        if (!s.threaded.includes(i)) s.threaded.push(i);
        events.push({ type: "grindStart", index: i });
      }
    } else if (grind) {
      events.push(finishGrind(s, grind, level.sausages[i].length));
    }
  }

  // Sausages now wholly behind the doughnut are settled.
  while (s.nextSausage < level.sausages.length) {
    const sausage = level.sausages[s.nextSausage];
    if (sausage.x + sausage.length > ring.cx - ring.halfWidth) break;
    // A sausage smashed by the sunglasses counts as dealt with.
    if (!s.threaded.includes(s.nextSausage) && !s.smashed.includes(s.nextSausage)) return die(s, "arrested", events);
    s.nextSausage += 1;
  }

  if (s.x >= level.length) {
    s.finished = true;
    events.push({ type: "finish" });
  }
  return events;
}

function finishGrind(s: RunnerState, grind: Grind, length: number): RunnerEvent {
  s.grinds = s.grinds.filter((g) => g !== grind);
  const offset = grind.offsetSum / grind.steps;
  const g = gradeFor(offset);
  s.chain = g.keepsChain ? Math.min(GRIND.maxChain, s.chain + 1) : 0;
  const multiplier = g.points * (1 + GRIND.chainStep * Math.max(0, s.chain - 1));
  // Threading a second sausage before touching the ground multiplies the
  // points by the number of grinds in that one flight.
  if (!s.grounded) s.airGrinds += 1;
  const airCombo = s.airGrinds >= 2 ? s.airGrinds : 0;
  const points = Math.round(length * GRIND.pointsPerPixel * multiplier * Math.max(1, airCombo));
  s.score += points;
  shiftGear(s, g.gears);
  return { type: "grindEnd", index: grind.index, grade: g.grade, offset, points, chain: s.chain, airCombo };
}

export function speedOf(s: RunnerState): number {
  return s.boostPad >= 0 ? TUNING.boostSpeed : TUNING.gears[s.gear];
}

function shiftGear(s: RunnerState, by: number): void {
  s.gear = Math.max(0, Math.min(TUNING.gears.length - 1, s.gear + by));
}

/** True in top gear, when the sunglasses are on and can absorb a sausage crash. */
export function shielded(s: RunnerState, options: RunnerOptions): boolean {
  return options.shield !== false && s.gear === TUNING.gears.length - 1;
}

function die(s: RunnerState, cause: DeathCause, events: RunnerEvent[]): RunnerEvent[] {
  s.dead = cause;
  events.push({ type: "die", cause });
  return events;
}
