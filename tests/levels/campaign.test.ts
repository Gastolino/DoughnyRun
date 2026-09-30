import { describe, expect, it } from "vitest";
import { CAMPAIGN } from "../../src/levels/index";

describe("campaign", () => {
  it("runs plain for three levels, then glaze up to the boss", () => {
    expect(CAMPAIGN.map((c) => c.level.topping)).toEqual(["plain", "plain", "plain", "glaze", "glaze"]);
  });

  it("ends on a boss chase", () => {
    expect(CAMPAIGN.map((c) => Boolean(c.level.chaser))).toEqual([false, false, false, false, true]);
  });

  it("gives every level a distinct id and name", () => {
    expect(new Set(CAMPAIGN.map((c) => c.id)).size).toBe(CAMPAIGN.length);
    expect(new Set(CAMPAIGN.map((c) => c.file.name)).size).toBe(CAMPAIGN.length);
  });
});
