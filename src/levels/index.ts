import { buildLevel, parseLevelFile } from "./format";
import type { LevelFile } from "./format";
import type { LevelData } from "../logic/types";
import level11 from "./1-1.json";
import level12 from "./1-2.json";

// The campaign, in the order it unlocks. Each file goes through the same
// checks as a pasted editor export, so a hand-edited file with a mistake
// fails at start-up with a message rather than misbehaving in play.

export interface CampaignLevel {
  id: string;
  file: LevelFile;
  level: LevelData;
}

const entry = (id: string, raw: unknown): CampaignLevel => {
  const file = parseLevelFile(raw);
  return { id, file, level: buildLevel(file) };
};

export const CAMPAIGN: CampaignLevel[] = [entry("1-1", level11), entry("1-2", level12)];
