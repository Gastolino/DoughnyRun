import { describe, expect, it } from "vitest";
import { migrate } from "../src/progress";

describe("saved progress", () => {
  it("follows the glaze level from 1-2 to 1-3 when the campaign gained a level", () => {
    const old = { completed: ["1-1", "1-2"], best: { "1-1": 900, "1-2": 1500 }, custom: [] };
    expect(migrate(old)).toEqual({ campaign: 2, completed: ["1-1", "1-3"], best: { "1-1": 900, "1-3": 1500 }, custom: [] });
  });

  it("leaves progress saved under the new numbering alone", () => {
    const current = { campaign: 2, completed: ["1-2"], best: { "1-2": 400 }, custom: [] };
    expect(migrate(current)).toBe(current);
  });
});
