import { cloneRunner, createRunner, PLAIN, stepRunner } from "./runner";
import type { RunnerOptions, RunnerState } from "./runner";
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
 * air jumps left, coyote time, gear and the button. Each field has a fixed
 * range, and together they take 47 bits, inside a double's exact 53. Numbers
 * hash far faster than strings; building and hashing string keys took about
 * three quarters of the search's time.
 */
function numericKey(n: Node): number {
  const s = n.state;
  // Doughnuts at different speeds drift apart, so position is part of the state.
  let k = clampInt(s.x, 0, 65535);
  k = k * 2048 + clampInt(s.y + 1024, 0, 2047);
  k = k * 256 + clampInt(s.vy / 10 + 100, 0, 255);
  k = k * 8 + (s.grounded ? 4 : 0) + (s.canCutJump ? 2 : 0) + (n.held ? 1 : 0);
  k = k * 4 + clampInt(s.airJumpsLeft, 0, 3);
  k = k * 16 + clampInt(s.coyote * 100, 0, 15);
  k = k * 8 + clampInt(s.gear, 0, 7);
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

export function solveLevel(level: LevelData, options: RunnerOptions = PLAIN): SolveResult {
  const start = createRunner(level, options);
  const stack: Node[] = [{ state: start, held: false, input: { held: false, pressed: false }, parent: null }];
  let furthestX = start.x;
  const seen = new NumberSet();
  const seenRare = new Set<string>();
  /** Records a state; false when an identical one was already seen. */
  const firstVisit = (n: Node): boolean => {
    const key = numericKey(n);
    const extra = extraKey(n.state);
    if (extra === null) return seen.add(key);
    const full = `${key}|${extra}`;
    if (seenRare.has(full)) return false;
    seenRare.add(full);
    return true;
  };

  while (stack.length > 0) {
    const node = stack.pop() as Node;
    const s0 = node.state;
    // Pushed in reverse, so that "button up" is explored first.
    for (const input of [true, false]) {
      const pointlessPress =
        input && !node.held && !s0.grounded && s0.coyote <= 0 && s0.airJumpsLeft === 0;
      if (pointlessPress) continue;

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
      if (firstVisit(child)) {
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
