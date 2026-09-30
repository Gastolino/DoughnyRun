import { describe, expect, it } from "vitest";
import { migrate } from "../src/progress";

describe("saved progress", () => {
  it("follows Glaze Heights from 1-2 to 1-4 in progress from the first campaign", () => {
    const old = { completed: ["1-1", "1-2"], best: { "1-1": 900, "1-2": 1500 }, custom: [] };
    expect(migrate(old)).toEqual({ campaign: 3, completed: ["1-1", "1-4"], best: { "1-1": 900, "1-4": 1500 }, custom: [] });
  });

  it("follows Glaze Heights from 1-3 to 1-4, and keeps Sugar Rush at 1-2, in progress from the second", () => {
    const old = { campaign: 2, completed: ["1-1", "1-2", "1-3"], best: { "1-2": 700, "1-3": 1500 }, custom: [] };
    expect(migrate(old)).toEqual({ campaign: 3, completed: ["1-1", "1-2", "1-4"], best: { "1-2": 700, "1-4": 1500 }, custom: [] });
  });

  it("leaves progress saved under the current numbering alone", () => {
    const current = { campaign: 3, completed: ["1-3"], best: { "1-3": 400 }, custom: [] };
    expect(migrate(current)).toBe(current);
  });
});
