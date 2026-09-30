import { CAMPAIGN } from "./levels/index";
import type { LevelFile } from "./levels/format";
import { parseLevelFile } from "./levels/format";

// What the player has finished and their best scores, plus the levels they
// have built in the editor. Kept in localStorage, which can be missing or can
// throw (a private window, a sandboxed frame), so every access falls back to
// memory and the game still works, only forgetting on reload.

const KEY = "doughnyrun.v1";

export interface Saved {
  /** Which campaign numbering the ids follow; see migrate(). */
  campaign?: number;
  completed: string[];
  best: Record<string, number>;
  custom: LevelFile[];
}

let memory: Saved = { campaign: 2, completed: [], best: {}, custom: [] };

/**
 * The first campaign had two levels; the second put a new level between
 * them, so the glaze level moved from 1-2 to 1-3. Progress saved under the
 * old numbering follows the level to its new id.
 */
export function migrate(data: Saved): Saved {
  if ((data.campaign ?? 1) >= 2) return data;
  const rename = (id: string): string => (id === "1-2" ? "1-3" : id);
  const best: Record<string, number> = {};
  for (const [id, score] of Object.entries(data.best)) best[rename(id)] = score;
  return { ...data, campaign: 2, completed: data.completed.map(rename), best };
}

function load(): Saved {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw) as Partial<Saved>;
      const custom: LevelFile[] = [];
      for (const f of data.custom ?? []) {
        try {
          custom.push(parseLevelFile(f));
        } catch {
          // A saved level that no longer passes the checks is dropped.
        }
      }
      memory = migrate({
        campaign: typeof data.campaign === "number" ? data.campaign : 1,
        completed: Array.isArray(data.completed) ? data.completed.filter((c) => typeof c === "string") : [],
        best: typeof data.best === "object" && data.best ? data.best : {},
        custom,
      });
    }
  } catch {
    // Storage unavailable: keep what is in memory.
  }
  return memory;
}

function save(data: Saved): void {
  memory = data;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage unavailable: progress lasts until the page reloads.
  }
}

/**
 * A campaign level is open once the one before it has been finished, and
 * stays open once finished itself, even when a new level is added before it.
 */
export function isUnlocked(index: number): boolean {
  if (index <= 0) return true;
  const done = load().completed;
  return done.includes(CAMPAIGN[index - 1].id) || done.includes(CAMPAIGN[index].id);
}

export function bestScore(id: string): number {
  return load().best[id] ?? 0;
}

/** Records a finished run; returns true when it beat the best score. */
export function recordFinish(id: string, score: number): boolean {
  const data = load();
  const completed = data.completed.includes(id) ? data.completed : [...data.completed, id];
  const beat = score > (data.best[id] ?? 0);
  save({ ...data, completed, best: beat ? { ...data.best, [id]: score } : data.best });
  return beat;
}

export function customLevels(): LevelFile[] {
  return load().custom;
}

/** Saves an editor level, replacing any saved level with the same name. */
export function saveCustomLevel(file: LevelFile): void {
  const data = load();
  save({ ...data, custom: [...data.custom.filter((f) => f.name !== file.name), file] });
}

export function deleteCustomLevel(name: string): void {
  const data = load();
  save({ ...data, custom: data.custom.filter((f) => f.name !== name) });
}

// The level open in the editor, kept so that a play-test or a reload never
// loses work in progress.
const DRAFT_KEY = "doughnyrun.editor-draft.v1";
let draftMemory: LevelFile | null = null;

export function loadDraft(): LevelFile | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (raw) draftMemory = parseLevelFile(JSON.parse(raw));
  } catch {
    // Missing, unreadable or invalid: fall back to memory.
  }
  return draftMemory;
}

export function saveDraft(file: LevelFile): void {
  draftMemory = file;
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(file));
  } catch {
    // Storage unavailable: the draft lasts until the page reloads.
  }
}
