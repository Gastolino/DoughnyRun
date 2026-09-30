import { describe, expect, it } from "vitest";
import { reachHeights } from "../src/logic/reach";

describe("reach heights", () => {
  it("rise from rolling to one jump to a double jump", () => {
    const r = reachHeights();
    expect(r.single).toBeLessThan(r.run - 150);
    expect(r.double).toBeLessThan(r.single - 150);
    // A double jump stays within the camera's reach of the level format.
    expect(r.double).toBeGreaterThan(-600);
  });
});
