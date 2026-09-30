import { describe, expect, it } from "vitest";
import { CAMPAIGN, WORLDS, worldLevels } from "../../src/levels/index";

describe("campaign", () => {
  it("runs plain for three levels, glaze up to the boss, then rainbow and marshmallow", () => {
    expect(worldLevels(1).map((c) => c.level.topping)).toEqual(["plain", "plain", "plain", "glaze", "glaze", "rainbow", "marshmallow"]);
  });

  it("has one boss chase, closing World 1", () => {
    expect(CAMPAIGN.filter((c) => c.level.chaser).map((c) => c.id)).toEqual(["1-5"]);
  });

  it("gives every level a distinct id and name", () => {
    expect(new Set(CAMPAIGN.map((c) => c.id)).size).toBe(CAMPAIGN.length);
    expect(new Set(CAMPAIGN.map((c) => c.file.name)).size).toBe(CAMPAIGN.length);
  });
});

describe("World 2", () => {
  it("is the city, and opens once the World 1 boss is beaten", () => {
    const levels = worldLevels(2);
    expect(levels.map((c) => c.id)).toEqual(["2-1", "2-2", "2-3"]);
    expect(levels.every((c) => c.level.theme === "city")).toBe(true);
    expect(levels[0].requires).toBe("1-5");
    expect(WORLDS.find((w) => w.id === 2)?.opensAfter).toBe("1-5");
  });

  it("fills its streets with cabs and its pavements with hot dog carts", () => {
    const kinds = new Set(worldLevels(2).flatMap((c) => c.level.vehicles.map((v) => v.kind)));
    expect([...kinds].sort()).toEqual(["cab", "cart"]);
    expect(worldLevels(2).every((c) => c.level.streets.length > 0)).toBe(true);
  });
});
