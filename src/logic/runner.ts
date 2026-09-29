import { checkSausage, ringAt } from "./threading";
import { DOUGHNUT, TUNING, VIEW } from "./tuning";
import type { LevelData } from "./types";

// A pure simulation of the doughnut. The scene feeds it input and draws the
// result; tests and the level solver drive it directly, so that what the
// tests prove about a level is what the player experiences.

export interface RunnerOptions {
  airJumps: number;
}

export const PLAIN: RunnerOptions = { airJumps: 0 };

export interface RunnerInput {
  /** Jump button is currently down. */
  held: boolean;
  /** Jump button went down since the previous step. */
  pressed: boolean;
}

export type DeathCause = "sausage" | "missed" | "fell" | "wall";

export interface RunnerState {
  x: number;
  y: number;
  vy: number;
  grounded: boolean;
  coyote: number;
  buffer: number;
  canCutJump: boolean;
  airJumpsLeft: number;
  /** Indices of sausages currently passing through the hole. */
  threading: number[];
  /** Indices of every sausage the doughnut has threaded so far. */
  threaded: number[];
  dead: DeathCause | null;
  finished: boolean;
}

export type RunnerEvent =
  | { type: "jump" }
  | { type: "airJump" }
  | { type: "land" }
  | { type: "threadStart"; index: number }
  | { type: "threadEnd"; index: number }
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
    grounded: true,
    coyote: TUNING.coyoteTime,
    buffer: 0,
    canCutJump: false,
    airJumpsLeft: options.airJumps,
    threading: [],
    threaded: [],
    dead: null,
    finished: false,
  };
}

export function isOverGround(level: LevelData, x: number): boolean {
  return level.ground.some((g) => x >= g.x && x <= g.x + g.width);
}

export function cloneRunner(s: RunnerState): RunnerState {
  return { ...s, threading: [...s.threading], threaded: [...s.threaded] };
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

  s.x += TUNING.runSpeed * dt;
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
  const nowThreading: number[] = [];
  for (let i = 0; i < level.sausages.length; i++) {
    const sausage = level.sausages[i];
    const result = checkSausage(ring, sausage);
    if (result === "hit") return die(s, "sausage", events);
    const passed = ring.cx - ring.halfWidth >= sausage.x + sausage.length;
    if (passed && sausage.kind === "thread" && !s.threaded.includes(i)) {
      return die(s, "missed", events);
    }
    if (result === "threaded") {
      nowThreading.push(i);
      if (!s.threading.includes(i)) events.push({ type: "threadStart", index: i });
      if (!s.threaded.includes(i)) s.threaded.push(i);
    }
  }
  for (const i of s.threading) {
    if (!nowThreading.includes(i)) {
      events.push({ type: "threadEnd", index: i });
    }
  }
  s.threading = nowThreading;

  if (s.x >= level.length) {
    s.finished = true;
    events.push({ type: "finish" });
  }
  return events;
}

function die(s: RunnerState, cause: DeathCause, events: RunnerEvent[]): RunnerEvent[] {
  s.dead = cause;
  events.push({ type: "die", cause });
  return events;
}
