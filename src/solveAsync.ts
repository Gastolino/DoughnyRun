import type { RunnerOptions } from "./logic/runner";
import { solveLevel } from "./logic/solver";
import type { SolveResult } from "./logic/solver";
import type { SolveReply, SolveRequest } from "./logic/solver.worker";
import type { LevelData } from "./logic/types";
import SolverWorker from "./logic/solver.worker?worker&inline";

// Solves a level in a background worker. Where a worker cannot start, it
// solves on the main thread after letting the page paint its "working" state.

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, (r: SolveResult) => void>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new SolverWorker();
    worker.onmessage = (e: MessageEvent<SolveReply>) => {
      pending.get(e.data.id)?.(e.data.result);
      pending.delete(e.data.id);
    };
    worker.onerror = () => {
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

export function solveAsync(level: LevelData, options: RunnerOptions): Promise<SolveResult> {
  const w = getWorker();
  if (!w) {
    return new Promise((resolve) => setTimeout(() => resolve(solveLevel(level, options)), 30));
  }
  const id = nextId++;
  const request: SolveRequest = { id, level, options };
  return new Promise((resolve) => {
    pending.set(id, resolve);
    w.postMessage(request);
  });
}
