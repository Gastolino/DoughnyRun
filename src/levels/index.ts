import { buildLevel, parseLevelFile } from "./format";
import type { LevelFile } from "./format";
import type { LevelData } from "../logic/types";
import level11 from "./1-1.json";
import level12 from "./1-2.json";
import level13 from "./1-3.json";
import level14 from "./1-4.json";
import level15 from "./1-5.json";
import bonus1 from "./b-1.json";
import bonus2 from "./b-2.json";
import level21 from "./2-1.json";
import level22 from "./2-2.json";
import level23 from "./2-3.json";

// The campaign. Each file goes through the same checks as a pasted editor
// export, so a hand-edited file with a mistake fails at start-up with a
// message rather than misbehaving in play.
//
// Each level belongs to a world and opens when the level it requires has
// been finished: by default the one listed before it.

export interface CampaignLevel {
  id: string;
  world: number;
  /** The level that must be finished first, or null for the first level. */
  requires: string | null;
  file: LevelFile;
  level: LevelData;
}

export interface World {
  id: number;
  name: string;
  /** The level that opens the world. */
  opensAfter: string | null;
}

export const WORLDS: World[] = [
  { id: 1, name: "Sugar Land", opensAfter: null },
  { id: 2, name: "The Big Apple", opensAfter: "1-5" },
];

const entry = (id: string, world: number, raw: unknown, requires?: string | null): CampaignLevel => {
  const file = parseLevelFile(raw);
  return { id, world, requires: requires === undefined ? "" : requires, file, level: buildLevel(file) };
};

const list: CampaignLevel[] = [
  entry("1-1", 1, level11, null),
  entry("1-2", 1, level12),
  entry("1-3", 1, level13),
  entry("1-4", 1, level14),
  entry("1-5", 1, level15),
  // Bonus levels, open once the boss is beaten, that bring in the last toppings.
  entry("B-1", 1, bonus1),
  entry("B-2", 1, bonus2),
  // World 2 opens with the World 1 boss beaten.
  entry("2-1", 2, level21, "1-5"),
  entry("2-2", 2, level22),
  entry("2-3", 2, level23),
];

// An empty "requires" means the level listed before it.
list.forEach((c, i) => {
  if (c.requires === "") c.requires = list[i - 1].id;
});

export const CAMPAIGN: CampaignLevel[] = list;

export function worldLevels(world: number): CampaignLevel[] {
  return CAMPAIGN.filter((c) => c.world === world);
}
