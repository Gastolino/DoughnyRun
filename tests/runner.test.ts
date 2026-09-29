import { describe, expect, it } from "vitest";
import { createRunner, gradeFor, speedOf, stepRunner } from "../src/logic/runner";
import type { RunnerEvent, RunnerState } from "../src/logic/runner";
import { DOUGHNUT, TUNING, VIEW } from "../src/logic/tuning";
import type { LevelData, Sausage } from "../src/logic/types";

const flat: LevelData = { name: "flat", length: 100000, ground: [{ x: 0, width: 100000 }], sausages: [] };
const restY = VIEW.groundY - DOUGHNUT.outerRadius;
const withSausages = (...sausages: Sausage[]): LevelData => ({ ...flat, sausages });
const cocktail = (x: number, y: number, length = 200): Sausage => ({ x, y, length, thickness: 16 });

function run(s: RunnerState, level: LevelData, steps: number, held = false, pressed = false) {
  const events: RunnerEvent[] = [];
  for (let i = 0; i < steps; i++) {
    events.push(...stepRunner(s, { held, pressed: pressed && i === 0 }, level));
  }
  return events;
}

function apexOf(holdSteps: number): number {
  const s = createRunner(flat);
  let top = s.y;
  for (let i = 0; i < 240; i++) {
    stepRunner(s, { held: i < holdSteps, pressed: i === 0 }, flat);
    top = Math.min(top, s.y);
  }
  return restY - top;
}

describe("runner movement", () => {
  it("rests on the ground and runs forward at the base speed", () => {
    const s = createRunner(flat);
    const x0 = s.x;
    run(s, flat, 120);
    expect(s.y).toBe(restY);
    expect(s.grounded).toBe(true);
    expect(s.x - x0).toBeCloseTo(TUNING.gears[0], 5);
  });

  it("jumps higher when the button is held longer", () => {
    const tap = apexOf(1);
    const half = apexOf(15);
    const full = apexOf(240);
    expect(tap).toBeGreaterThan(20);
    expect(half).toBeGreaterThan(tap);
    expect(full).toBeGreaterThan(half);
  });

  it("lands and reports it", () => {
    const s = createRunner(flat);
    const events = run(s, flat, 240, true, true);
    expect(events.map((e) => e.type)).toEqual(["jump", "land"]);
    expect(s.grounded).toBe(true);
  });

  it("allows a jump shortly after running off a ledge", () => {
    const ledge: LevelData = { ...flat, ground: [{ x: 0, width: 200 }, { x: 600, width: 100000 }] };
    const s = createRunner(ledge);
    while (s.x <= 200) stepRunner(s, { held: false, pressed: false }, ledge);
    run(s, ledge, 4);
    expect(s.grounded).toBe(false);
    const events = run(s, ledge, 1, true, true);
    expect(events.map((e) => e.type)).toContain("jump");
  });

  it("buffers a press made just before touching down", () => {
    const s = createRunner(flat);
    run(s, flat, 1, true, true);
    while (s.vy < 0 || s.y < restY - 10) stepRunner(s, { held: false, pressed: false }, flat);
    run(s, flat, 1, true, true);
    const events = run(s, flat, 20, true);
    expect(events.map((e) => e.type)).toEqual(["land", "jump"]);
  });

  it("falls to its death in a void", () => {
    const gap: LevelData = { ...flat, ground: [{ x: 0, width: 300 }, { x: 900, width: 100000 }] };
    const s = createRunner(gap);
    const events = run(s, gap, 600);
    expect(s.dead).not.toBeNull();
    expect(events.at(-1)).toEqual({ type: "die", cause: s.dead });
  });

  it("uses air jumps when the options grant them", () => {
    const s = createRunner(flat, { airJumps: 1 });
    run(s, flat, 1, true, true);
    run(s, flat, 20);
    const events = run(s, flat, 1, true, true);
    expect(events.map((e) => e.type)).toEqual(["airJump"]);
    expect(run(s, flat, 1, true, true)).toEqual([]);
  });
});

describe("grinding", () => {
  it("grades a dead-centre grind as perfect, scores it and shifts up two gears", () => {
    const level = withSausages(cocktail(300, restY));
    const s = createRunner(level);
    const events = run(s, level, 240);
    const end = events.find((e) => e.type === "grindEnd");
    expect(end).toMatchObject({ grade: "perfect", offset: 0, chain: 1, points: 200 * 3 });
    expect(s.score).toBe(600);
    expect(s.gear).toBe(2);
    expect(speedOf(s)).toBe(TUNING.gears[2]);
  });

  it("grades an off-centre grind lower", () => {
    const slack = DOUGHNUT.holeRadius + DOUGHNUT.holeForgiveness - 8;
    const level = withSausages(cocktail(300, restY - slack * 0.9));
    const s = createRunner(level);
    const end = run(s, level, 240).find((e) => e.type === "grindEnd");
    expect(end).toMatchObject({ grade: "sloppy", chain: 0 });
    expect(s.gear).toBe(0);
  });

  it("maps offsets to grades at the boundaries", () => {
    expect(gradeFor(0).grade).toBe("perfect");
    expect(gradeFor(0.15).grade).toBe("perfect");
    expect(gradeFor(0.2).grade).toBe("great");
    expect(gradeFor(0.5).grade).toBe("good");
    expect(gradeFor(0.9).grade).toBe("sloppy");
  });

  it("multiplies points along an unbroken chain", () => {
    const level = withSausages(cocktail(300, restY), cocktail(700, restY), cocktail(1100, restY));
    const s = createRunner(level);
    const ends = run(s, level, 600).filter((e) => e.type === "grindEnd");
    expect(ends.map((e) => e.chain)).toEqual([1, 2, 3]);
    expect(ends.map((e) => e.points)).toEqual([600, 900, 1200]);
  });

  it("never exceeds the top speed", () => {
    const many = Array.from({ length: 12 }, (_, i) => cocktail(300 + i * 300, restY, 100));
    const level = withSausages(...many);
    const s = createRunner(level);
    run(s, level, 2400);
    expect(s.threaded).toHaveLength(12);
    expect(s.gear).toBe(TUNING.gears.length - 1);
  });

  it("breaks the chain and slows down when a sausage is jumped over", () => {
    const level = withSausages(cocktail(300, restY, 100), cocktail(900, VIEW.groundY - 8, 40));
    const s = createRunner(level);
    while (s.x < 780) run(s, level, 1);
    const before = s.gear;
    run(s, level, 1, true, true);
    const events = run(s, level, 120, true);
    expect(events).toContainEqual({ type: "skip", index: 1 });
    expect(s.chain).toBe(0);
    expect(s.dead).toBeNull();
    expect(before).toBe(2);
    expect(s.gear).toBe(1);
  });

  it("treats threading as a crash for the sausage named solid", () => {
    const level = withSausages(cocktail(300, restY));
    const s = createRunner(level);
    for (let i = 0; i < 240; i++) stepRunner(s, { held: false, pressed: false }, level, { airJumps: 0, solidSausage: 0 });
    expect(s.dead).toBe("sausage");
  });
});
