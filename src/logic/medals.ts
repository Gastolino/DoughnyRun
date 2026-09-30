import { GRIND } from "./tuning";
import type { LevelData } from "./types";

// Medals for a finished level, set against its perfect score: every sausage
// graded perfect, in one unbroken chain. Air combos come on top, so a
// daring run can beat the perfect score. Any finish earns bronze.

export type Medal = "gold" | "silver" | "bronze";

/** Shares of the perfect score that each medal asks for. */
export const MEDAL_SHARE = { gold: 0.8, silver: 0.55 } as const;

export function perfectScore(level: LevelData): number {
  const perfect = GRIND.grades[0];
  let total = 0;
  level.sausages.forEach((s, i) => {
    const chain = Math.min(GRIND.maxChain, i + 1);
    total += Math.round(s.length * GRIND.pointsPerPixel * perfect.points * (1 + GRIND.chainStep * (chain - 1)));
  });
  return total;
}

export interface MedalTargets {
  gold: number;
  silver: number;
}

export function medalTargets(level: LevelData): MedalTargets {
  const perfect = perfectScore(level);
  // Rounded to tens so that targets read cleanly.
  const round = (v: number) => Math.round(v / 10) * 10;
  return { gold: round(perfect * MEDAL_SHARE.gold), silver: round(perfect * MEDAL_SHARE.silver) };
}

/** The medal a finish with this score earns; null for a level not finished. */
export function medalFor(level: LevelData, score: number | null): Medal | null {
  if (score === null) return null;
  const t = medalTargets(level);
  return score >= t.gold ? "gold" : score >= t.silver ? "silver" : "bronze";
}
