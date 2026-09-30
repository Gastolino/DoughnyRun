import { describe, expect, it } from "vitest";
import { buildLevel, COCKTAIL_THICKNESS, LevelFormatError, parseLevelFile, stringifyLevelFile } from "../src/levels/format";
import type { LevelFile } from "../src/levels/format";
import { VIEW } from "../src/logic/tuning";

const sample: LevelFile = {
  format: 1,
  name: "Sample",
  length: 3000,
  topping: "glaze",
  elements: [
    { type: "sausage", x: 900, y: 231, length: 40 },
    { type: "gap", x: 800, width: 200 },
    { type: "gap", x: 1500, width: 100 },
    { type: "sausage", x: 400, y: 412, length: 120, thickness: 18 },
  ],
};

describe("level files", () => {
  it("survive a round trip through JSON text", () => {
    expect(parseLevelFile(JSON.parse(stringifyLevelFile(sample)))).toEqual(sample);
  });

  it("build ground around the gaps, running on past the finish", () => {
    const level = buildLevel(sample);
    expect(level.ground).toEqual([
      { x: 0, width: 800 },
      { x: 1000, width: 500 },
      { x: 1600, width: 3000 + VIEW.width - 1600 },
    ]);
  });

  it("build sausages sorted by x, with the default thickness filled in", () => {
    const level = buildLevel(sample);
    expect(level.sausages.map((s) => [s.x, s.thickness])).toEqual([
      [400, 18],
      [900, COCKTAIL_THICKNESS],
    ]);
    expect(level.topping).toBe("glaze");
  });

  it("merge overlapping gaps", () => {
    const level = buildLevel({ ...sample, elements: [{ type: "gap", x: 500, width: 300 }, { type: "gap", x: 700, width: 300 }] });
    expect(level.ground.slice(0, 2)).toEqual([
      { x: 0, width: 500 },
      { x: 1000, width: 3000 + VIEW.width - 1000 },
    ]);
  });

  it.each([
    [{ ...sample, format: 2 }, /format/],
    [{ ...sample, name: "  " }, /name/],
    [{ ...sample, length: 100 }, /length.*between/],
    [{ ...sample, topping: "sprinkles" }, /topping/],
    [{ ...sample, elements: "none" }, /elements/],
    [{ ...sample, elements: [{ type: "ramp", x: 1 }] }, /Element 1.*unknown "type"/],
    [{ ...sample, elements: [{ type: "sausage", x: 10, y: 600, length: 40 }] }, /Element 1.*"y"/],
    [{ ...sample, elements: [{ type: "gap", x: 10, width: "wide" }] }, /Element 1.*"width" must be a number/],
    [null, /object/],
  ])("reject a bad file with a message that says where (%#)", (input, message) => {
    expect(() => parseLevelFile(input)).toThrow(LevelFormatError);
    expect(() => parseLevelFile(input)).toThrow(message);
  });
});
