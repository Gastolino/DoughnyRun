import { solveLevel } from "./solver";
import type { SolveResult } from "./solver";
import type { RunnerOptions } from "./runner";
import type { LevelData } from "./types";

// Runs the level solver off the page's main thread, so that a search taking
// seconds never freezes the game or the editor.

export interface SolveRequest {
  id: number;
  level: LevelData;
  options: RunnerOptions;
}

export interface SolveReply {
  id: number;
  result: SolveResult;
}

self.onmessage = (e: MessageEvent<SolveRequest>) => {
  const { id, level, options } = e.data;
  const reply: SolveReply = { id, result: solveLevel(level, options) };
  self.postMessage(reply);
};
