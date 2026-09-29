import { DOUGHNUT, VIEW } from "../logic/tuning";
import type { GroundSegment, LevelData, Sausage } from "../logic/types";

/** Height of the hole's centre for a doughnut rolling along the ground. */
export const RUN_HEIGHT = VIEW.groundY - DOUGHNUT.outerRadius;

export const COCKTAIL_THICKNESS = 16;

export interface Gap {
  x: number;
  width: number;
}

export interface LevelPlan {
  name: string;
  length: number;
  gaps: Gap[];
  sausages: Sausage[];
}

/** Turns a list of gaps into ground segments and sorts the sausages. */
export function buildLevel(plan: LevelPlan): LevelData {
  const gaps = [...plan.gaps].sort((a, b) => a.x - b.x);
  const ground: GroundSegment[] = [];
  let x = 0;
  for (const gap of gaps) {
    if (gap.x > x) ground.push({ x, width: gap.x - x });
    x = Math.max(x, gap.x + gap.width);
  }
  ground.push({ x, width: plan.length + VIEW.width - x });
  const sausages = [...plan.sausages].sort((a, b) => a.x - b.x);
  return { name: plan.name, length: plan.length, ground, sausages };
}

export function sausage(x: number, y: number, length: number): Sausage {
  return { x, y, length, thickness: COCKTAIL_THICKNESS };
}

/** True when the ground beneath the whole sausage is missing. */
export function isOverVoid(level: LevelData, s: Sausage): boolean {
  return !level.ground.some((g) => g.x < s.x + s.length && g.x + g.width > s.x);
}
