import { cloneRunner, createRunner, PLAIN, speedOf, stepRunner } from "./runner";
import type { RunnerEvent, RunnerOptions, RunnerState } from "./runner";
import { slopeAt } from "./terrain";
import { DOUGHNUT, TUNING, VIEW } from "./tuning";
import type { LevelData } from "./types";

// Searches for an input sequence that clears a level. It explores depth
// first, trying "button up" before "button down" at each decision point, and
// discards any state identical, to within a pixel, to one it has already
// seen. Levels contain nothing that moves, so a doughnut that reaches a state
// later than another has the same future, and the search stays complete: it
// reports a level impossible only after every distinct state has died.
//
// Two simplifications keep the search fast. The solver never presses the
// button in mid-air when the press could do nothing but buffer a jump, since
// pressing on the landing step reaches the same states. It also treats a
// held button as released once holding it no longer affects the jump, which
// lets it press again one decision earlier than a player could: a margin of
// one sixtieth of a second.
//
// Most of the search's states are jumps in flight, so it also skips a jump
// from flat ground when nothing lies within the jump's reach: no sausage,
// void, ramp, pad or finish. Such a jump lands exactly where rolling would
// have taken the doughnut, in the same gear, so no outcome is lost.

export interface SolveResult {
  solvable: boolean;
  /** Furthest x any surviving doughnut reached; shows where a level breaks. */
  furthestX: number;
  /** Input per decision point for one winning run, when there is one. */
  inputs: DecisionInput[] | null;
}

export interface DecisionInput {
  held: boolean;
  /** The button goes down on the first step of this decision. */
  pressed: boolean;
}

interface Node {
  state: RunnerState;
  /** Button state the next decision compares against to detect a press. */
  held: boolean;
  /** Input chosen at the decision that produced this node. */
  input: DecisionInput;
  parent: Node | null;
}

export const STEPS_PER_DECISION = 2;

const clampInt = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Math.round(v)));

/**
 * A state packed into one number: position, height, fall speed, the flags,
 * air jumps left, coyote time, gear, the running boost and the button. Each
 * field has a fixed range, and together they take all 53 bits of a double's
 * exact range. Numbers
 * hash far faster than strings; building and hashing string keys took about
 * three quarters of the search's time.
 */
function numericKey(s: RunnerState, held: boolean): number {
  // Doughnuts at different speeds drift apart, so position is part of the state.
  let k = clampInt(s.x, 0, 65535);
  k = k * 2048 + clampInt(s.y + 1024, 0, 2047);
  // Fall speed in tens: from a lip jump's -2000 up to beyond the fall cap.
  k = k * 512 + clampInt(s.vy / 10 + 200, 0, 511);
  k = k * 8 + (s.grounded ? 4 : 0) + (s.canCutJump ? 2 : 0) + (held ? 1 : 0);
  k = k * 4 + clampInt(s.airJumpsLeft, 0, 3);
  k = k * 16 + clampInt(s.coyote * 100, 0, 15);
  k = k * 8 + clampInt(s.gear, 0, 7);
  k = k * 32 + clampInt(s.boostPad + 1, 0, 31);
  return k;
}

/**
 * A set of non-negative whole numbers below 2^53, kept in a typed array with
 * open addressing. A built-in Set boxes every number this large as a separate
 * object, which made the search spend most of its time in hashing and garbage
 * collection.
 */
export class NumberSet {
  private keys: Float64Array;
  private mask: number;
  size = 0;

  constructor(capacity = 1 << 20) {
    this.keys = new Float64Array(capacity).fill(-1);
    this.mask = capacity - 1;
  }

  private slot(k: number): number {
    const lo = k >>> 0;
    const hi = Math.floor(k / 4294967296) >>> 0;
    let h = Math.imul(lo ^ Math.imul(hi, 0x9e3779b1), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h & this.mask;
  }

  /** Adds k; returns false if it was already present. */
  add(k: number): boolean {
    let i = this.slot(k);
    const keys = this.keys;
    while (keys[i] !== -1) {
      if (keys[i] === k) return false;
      i = (i + 1) & this.mask;
    }
    keys[i] = k;
    this.size++;
    if (this.size * 2 > keys.length) this.grow();
    return true;
  }

  private grow(): void {
    const old = this.keys;
    const keys = new Float64Array(old.length * 2).fill(-1);
    this.keys = keys;
    this.mask = keys.length - 1;
    for (const k of old) {
      if (k === -1) continue;
      let i = this.slot(k);
      while (keys[i] !== -1) i = (i + 1) & this.mask;
      keys[i] = k;
    }
  }
}

/**
 * The rarer parts of a state, present only mid-grind or after the free
 * crash, as text. A grind in progress will change the speed when it ends.
 */
function extraKey(s: RunnerState): string | null {
  if (s.grinds.length === 0 && s.smashed.length === 0) return null;
  const grinds = s.grinds.map((g) => `${g.index}:${Math.round((g.offsetSum / g.steps) * 20)}`).join(";");
  return `${grinds}|${s.smashed.join(";")}`;
}

/** The states a search has seen. */
class Visited {
  private seen: NumberSet;
  private seenRare = new Set<string>();

  constructor(capacity?: number) {
    this.seen = new NumberSet(capacity);
  }

  /** Records a state; false when an identical one was already seen. */
  firstVisit(state: RunnerState, held: boolean): boolean {
    const key = numericKey(state, held);
    const extra = extraKey(state);
    if (extra === null) return this.seen.add(key);
    const full = `${key}|${extra}`;
    if (this.seenRare.has(full)) return false;
    this.seenRare.add(full);
    return true;
  }
}

/** A press that cannot change the outcome, which the searches skip. */
function pointlessPress(level: LevelData, s: RunnerState, options: RunnerOptions): boolean {
  return (!s.grounded && s.coyote <= 0 && s.airJumpsLeft === 0) || jumpIsIdle(level, s, options);
}

/** Stretches of a level where a jump could change something. */
type Features = Float64Array;

const featureCache = new WeakMap<LevelData, Features>();

/** Start and end of every feature, as pairs sorted by start. */
function featuresOf(level: LevelData): Features {
  let f = featureCache.get(level);
  if (f) return f;
  const spans: [number, number][] = [];
  for (const s of level.sausages) spans.push([s.x, s.x + s.length]);
  for (const r of level.ramps) spans.push([r.x, r.x + r.width]);
  for (const b of level.boosts) spans.push([b.x, b.x + b.width]);
  for (const h of level.hills) spans.push([h.x, h.x + h.width]);
  for (let i = 0; i < level.ground.length; i++) {
    const end = level.ground[i].x + level.ground[i].width;
    spans.push([end, level.ground[i + 1]?.x ?? end]);
  }
  if (level.ground.length && level.ground[0].x > 0) spans.push([0, level.ground[0].x]);
  spans.push([level.length, level.length]);
  spans.sort((a, b) => a[0] - b[0]);
  f = new Float64Array(spans.flat());
  featureCache.set(level, f);
  return f;
}

const airtimeCache = new Map<number, number>();

/**
 * An upper bound on how long a jump from flat ground stays in the air, air
 * jumps included: the time of a jump held all the way, with half again for
 * each jump as a margin for air jumps taken at the top.
 */
function airtimeBound(airJumps: number): number {
  let t = airtimeCache.get(airJumps);
  if (t !== undefined) return t;
  const flat: LevelData = {
    name: "",
    length: 1e6,
    topping: "plain",
    ground: [{ x: 0, width: 1e6 }],
    sausages: [],
    ramps: [],
    boosts: [],
    hills: [],
  };
  const s = createRunner(flat);
  let steps = 0;
  do {
    stepRunner(s, { held: true, pressed: steps === 0 }, flat);
    steps++;
  } while (!s.grounded && steps < 10000);
  t = (1 + airJumps) * 1.5 * steps * TUNING.fixedStep;
  airtimeCache.set(airJumps, t);
  return t;
}

/** True when a jump from here, rolling on flat ground, can reach no feature. */
function jumpIsIdle(level: LevelData, s: RunnerState, options: RunnerOptions): boolean {
  if (!s.grounded || slopeAt(level, s.x) !== 0) return false;
  const lo = s.x - DOUGHNUT.halfWidth - 1;
  const hi = s.x + speedOf(s) * airtimeBound(options.airJumps) + DOUGHNUT.halfWidth + 1;
  const f = featuresOf(level);
  for (let i = 0; i < f.length; i += 2) {
    if (f[i] > hi) break;
    if (f[i + 1] >= lo) return false;
  }
  return true;
}

export interface SearchStart {
  state: RunnerState;
  held: boolean;
}

export function solveLevel(level: LevelData, options: RunnerOptions = PLAIN, from?: SearchStart): SolveResult {
  const start = from ? cloneRunner(from.state) : createRunner(level, options);
  const stack: Node[] = [{ state: start, held: from?.held ?? false, input: { held: false, pressed: false }, parent: null }];
  let furthestX = start.x;
  // A search from a given state is short, so it starts with a small table.
  const visited = new Visited(from ? 1 << 10 : 1 << 20);

  while (stack.length > 0) {
    const node = stack.pop() as Node;
    const s0 = node.state;
    // Pushed in reverse, so that "button up" is explored first.
    for (const input of [true, false]) {
      if (input && !node.held && pointlessPress(level, s0, options)) continue;

      const decision: DecisionInput = { held: input, pressed: input && !node.held };
      const state = cloneRunner(s0);
      for (let i = 0; i < STEPS_PER_DECISION; i++) {
        stepRunner(state, { held: input, pressed: decision.pressed && i === 0 }, level, options);
        if (state.dead || state.finished) break;
      }
      if (state.dead) continue;

      const child: Node = { state, held: input && state.canCutJump, input: decision, parent: node };
      furthestX = Math.max(furthestX, state.x);
      if (state.finished) {
        return { solvable: true, furthestX, inputs: trace(child) };
      }
      if (visited.firstVisit(child.state, child.held)) {
        stack.push(child);
      }
    }
  }
  return { solvable: false, furthestX, inputs: null };
}

function trace(node: Node): DecisionInput[] {
  const out: DecisionInput[] = [];
  for (let n: Node | null = node; n?.parent; n = n.parent) out.push(n.input);
  return out.reverse();
}

/**
 * Finds which of the given sausages the doughnut can pass without threading
 * and still finish the level. It explores every state the level allows once,
 * noting each doughnut that passes one of the sausages untouched, and asks
 * whether that doughnut can go on to finish. One exploration answers for all
 * the sausages at once, where a search per sausage would repeat the same
 * ground again and again.
 */
export function findBypasses(level: LevelData, options: RunnerOptions, indices: readonly number[]): Set<number> {
  const wanted = new Set(indices);
  const bypassed = new Set<number>();
  // Past the last of the sausages, nothing more can be learned.
  const last = Math.max(-1, ...indices);
  const start = createRunner(level, options);
  const stack: SearchStart[] = [{ state: start, held: false }];
  const visited = new Visited();

  while (stack.length > 0 && bypassed.size < wanted.size) {
    const node = stack.pop()!;
    const s0 = node.state;
    for (const input of [true, false]) {
      const pressed = input && !node.held;
      if (pressed && pointlessPress(level, s0, options)) continue;
      const state = cloneRunner(s0);
      let skipped: number[] | null = null;
      for (let i = 0; i < STEPS_PER_DECISION; i++) {
        const events: RunnerEvent[] = stepRunner(state, { held: input, pressed: pressed && i === 0 }, level, options);
        for (const e of events) {
          if (e.type === "skip" && wanted.has(e.index) && !bypassed.has(e.index)) (skipped ??= []).push(e.index);
        }
        if (state.dead || state.finished) break;
      }
      if (state.dead) continue;
      const child = { state, held: input && state.canCutJump };
      if (skipped && !doomed(state) && (state.finished || solveLevel(level, options, child).solvable)) {
        for (const i of skipped) bypassed.add(i);
      }
      if (!state.finished && state.nextSausage <= last && visited.firstVisit(child.state, child.held)) stack.push(child);
    }
  }
  return bypassed;
}

/**
 * A doughnut already below the ground's surface, with no jump left, can only
 * fall: any ground or ramp ahead meets it side-on.
 */
function doomed(s: RunnerState): boolean {
  return !s.grounded && s.coyote <= 0 && s.airJumpsLeft === 0 && s.vy >= 0 && s.y + DOUGHNUT.outerRadius > VIEW.groundY + 2;
}
