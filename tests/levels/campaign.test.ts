import { describe, expect, it } from "vitest";
import { CAMPAIGN } from "../../src/levels/index";

describe("campaign", () => {
  it("runs plain for three levels, then unlocks glaze", () => {
    expect(CAMPAIGN.map((c) => c.level.topping)).toEqual(["plain", "plain", "plain", "glaze"]);
  });

  it("gives every level a distinct id and name", () => {
    expect(new Set(CAMPAIGN.map((c) => c.id)).size).toBe(CAMPAIGN.length);
    expect(new Set(CAMPAIGN.map((c) => c.file.name)).size).toBe(CAMPAIGN.length);
  });
});
