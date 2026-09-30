import { describe, expect, it } from "vitest";
import { CAMPAIGN } from "../../src/levels/index";

describe("campaign", () => {
  it("runs plain for three levels, glaze up to the boss, then rainbow and marshmallow", () => {
    expect(CAMPAIGN.map((c) => c.level.topping)).toEqual(["plain", "plain", "plain", "glaze", "glaze", "rainbow", "marshmallow"]);
  });

  it("has one boss chase, closing World 1", () => {
    expect(CAMPAIGN.filter((c) => c.level.chaser).map((c) => c.id)).toEqual(["1-5"]);
  });

  it("gives every level a distinct id and name", () => {
    expect(new Set(CAMPAIGN.map((c) => c.id)).size).toBe(CAMPAIGN.length);
    expect(new Set(CAMPAIGN.map((c) => c.file.name)).size).toBe(CAMPAIGN.length);
  });
});
