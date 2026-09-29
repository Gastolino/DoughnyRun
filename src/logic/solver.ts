import { cloneRunner, createRunner, PLAIN, stepRunner } from "./runner";
import type { RunnerOptions, RunnerState } from "./runner";
import type { LevelData } from "./types";

// Searches for an input sequence that clears a level. It advances every
// reachable doughnut state in lockstep, trying "button up" and "button down"
// at each decision point, and merges states that have become identical to
// within a pixel so that the search stays small.
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

function keyOf(n: Node): string {
  const s = n.state;
  return [
    Math.round(s.y),
    Math.round(s.vy / 10),
    s.grounded ? 1 : 0,
    s.canCutJump ? 1 : 0,
    s.airJumpsLeft,
    Math.round(s.coyote * 100),
    n.held ? 1 : 0,
  ].join(",");
}

export function solveLevel(level: LevelData, options: RunnerOptions = PLAIN): SolveResult {
  const start = createRunner(level, options);
  let frontier: Node[] = [{ state: start, held: false, input: { held: false, pressed: false }, parent: null }];
  let furthestX = start.x;

  while (frontier.length > 0) {
    const next = new Map<string, Node>();
    for (const node of frontier) {
      const s0 = node.state;
      for (const input of [false, true]) {
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
        const key = keyOf(child);
        if (!next.has(key)) next.set(key, child);
      }
    }
    frontier = [...next.values()];
  }
  return { solvable: false, furthestX, inputs: null };
}

function trace(node: Node): DecisionInput[] {
  const out: DecisionInput[] = [];
  for (let n: Node | null = node; n?.parent; n = n.parent) out.push(n.input);
  return out.reverse();
}
