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
   * Treats threading this sausage as a crash. Level checks use it to prove
   * that a sausage cannot be bypassed: with it set, the level must become
   * impossible.
   */
  solidSausage?: number;
}

export const PLAIN: RunnerOptions = { airJumps: 0 };

export interface RunnerInput {
  /** Jump button is currently down. */
  held: boolean;
  /** Jump button went down since the previous step. */
  pressed: boolean;
}

export type DeathCause = "sausage" | "fell" | "wall";

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
  canCutJump: boolean;
  airJumpsLeft: number;
  grinds: Grind[];
  /** Index of the first sausage the doughnut has not yet passed. */
  nextSausage: number;
  /** Indices of every sausage threaded so far. */
  threaded: number[];
  score: number;
  chain: number;
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
}

export type RunnerEvent =
  | { type: "jump" }
  | { type: "airJump" }
  | { type: "land" }
  | { type: "grindStart"; index: number }
  | ({ type: "grindEnd" } & GrindResult)
  | { type: "skip"; index: number }
  | { type: "die"; cause: DeathCause }
  | { type: "finish" };

const R = DOUGHNUT.outerRadius;
// How far below the surface the doughnut may sink within one step and still
// be caught by the ground rather than counted as having fallen past it.
const SURFACE_TOLERANCE = 2;

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
    dead: null,
    finished: false,
  };
}

export function isOverGround(level: LevelData, x: number): boolean {
  return level.ground.some((g) => x >= g.x && x <= g.x + g.width);
}

export function cloneRunner(s: RunnerState): RunnerState {
  return {
    ...s,
    grinds: s.grinds.map((g) => ({ ...g })),
    threaded: [...s.threaded],
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

  s.x += speedOf(s) * dt;
  s.buffer = input.pressed ? TUNING.jumpBufferTime : Math.max(0, s.buffer - dt);
  s.coyote = s.grounded ? TUNING.coyoteTime : Math.max(0, s.coyote - dt);

  if (s.buffer > 0 && (s.grounded || s.coyote > 0)) {
    s.vy = -TUNING.jumpVelocity;
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
  const hanging = input.held && Math.abs(s.vy) < TUNING.apexHangSpeed;
  const gravity = hanging ? TUNING.gravity * TUNING.apexHangGravityFactor : TUNING.gravity;
  s.vy = Math.min(s.vy + gravity * dt, TUNING.maxFallSpeed);
  s.y += s.vy * dt;
  const bottom = s.y + R;

  if (isOverGround(level, s.x)) {
    if (prevBottom > VIEW.groundY + SURFACE_TOLERANCE) {
      // Already below the surface when the ground arrived: the doughnut has
      // run into the side of a cliff.
      return die(s, "wall", events);
    }
    if (s.vy >= 0 && bottom >= VIEW.groundY) {
      s.y = VIEW.groundY - R;
      s.vy = 0;
      if (!s.grounded) events.push({ type: "land" });
      s.grounded = true;
      s.canCutJump = false;
      s.airJumpsLeft = options.airJumps;
    }
  } else {
    s.grounded = false;
  }

  if (s.y - R > VIEW.height) return die(s, "fell", events);

  const ring = ringAt(s.x, s.y);
  for (let i = s.nextSausage; i < level.sausages.length; i++) {
    const sausage = level.sausages[i];
    if (sausage.x > ring.cx + ring.halfWidth) break;
    const result = checkSausage(ring, sausage);
    const grind = s.grinds.find((g) => g.index === i);
    if (result === "hit" || (result === "threaded" && options.solidSausage === i)) {
      return die(s, "sausage", events);
    }
    if (result === "threaded") {
      if (grind) {
        grind.offsetSum += centreOffset(ring, sausage);
        grind.steps += 1;
      } else {
        s.grinds.push({ index: i, offsetSum: centreOffset(ring, sausage), steps: 1 });
        s.threaded.push(i);
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
    if (!s.threaded.includes(s.nextSausage)) {
      s.chain = 0;
      shiftGear(s, GRIND.skipGears);
      events.push({ type: "skip", index: s.nextSausage });
    }
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
  const points = Math.round(length * GRIND.pointsPerPixel * multiplier);
  s.score += points;
  shiftGear(s, g.gears);
  return { type: "grindEnd", index: grind.index, grade: g.grade, offset, points, chain: s.chain };
}

export function speedOf(s: RunnerState): number {
  return TUNING.gears[s.gear];
}

function shiftGear(s: RunnerState, by: number): void {
  s.gear = Math.max(0, Math.min(TUNING.gears.length - 1, s.gear + by));
}

function die(s: RunnerState, cause: DeathCause, events: RunnerEvent[]): RunnerEvent[] {
  s.dead = cause;
  events.push({ type: "die", cause });
  return events;
}
