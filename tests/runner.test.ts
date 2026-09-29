import { describe, expect, it } from "vitest";
import { createRunner, stepRunner } from "../src/logic/runner";
import type { RunnerEvent, RunnerState } from "../src/logic/runner";
import { DOUGHNUT, TUNING, VIEW } from "../src/logic/tuning";
import type { LevelData } from "../src/logic/types";

const flat: LevelData = { name: "flat", length: 100000, ground: [{ x: 0, width: 100000 }], sausages: [] };
const restY = VIEW.groundY - DOUGHNUT.outerRadius;

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

describe("runner", () => {
  it("rests on the ground and runs forward at constant speed", () => {
    const s = createRunner(flat);
    const x0 = s.x;
    run(s, flat, 120);
    expect(s.y).toBe(restY);
    expect(s.grounded).toBe(true);
    expect(s.x - x0).toBeCloseTo(TUNING.runSpeed, 5);
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
    // Run until just past the edge, inside the coyote window.
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
    run(s, flat, 1, true, true); // press while still airborne
    const events = run(s, flat, 20, true);
    expect(events.map((e) => e.type)).toEqual(["land", "jump"]);
  });

  it("falls to its death in a gap", () => {
    const gap: LevelData = { ...flat, ground: [{ x: 0, width: 300 }, { x: 900, width: 100000 }] };
    const s = createRunner(gap);
    const events = run(s, gap, 600);
    expect(s.dead).not.toBeNull();
    expect(events.at(-1)).toEqual({ type: "die", cause: s.dead });
  });

  it("threads a sausage at running height without jumping", () => {
    const level: LevelData = { ...flat, sausages: [{ kind: "thread", x: 300, y: restY, length: 200, thickness: 16 }] };
    const s = createRunner(level);
    const types = run(s, level, 240).map((e) => e.type);
    expect(types).toEqual(["threadStart", "threadEnd"]);
    expect(s.threaded).toEqual([0]);
  });

  it("crashes into a sausage lying on the ground", () => {
    const level: LevelData = { ...flat, sausages: [{ kind: "hurdle", x: 300, y: VIEW.groundY - 8, length: 60, thickness: 16 }] };
    const s = createRunner(level);
    run(s, level, 240);
    expect(s.dead).toBe("sausage");
  });

  it("counts running under a raised sausage as a miss", () => {
    const level: LevelData = { ...flat, sausages: [{ kind: "thread", x: 300, y: restY - 150, length: 60, thickness: 16 }] };
    const s = createRunner(level);
    run(s, level, 240);
    expect(s.dead).toBe("missed");
  });

  it("lets the doughnut pass a hurdle it jumps over", () => {
    const level: LevelData = { ...flat, sausages: [{ kind: "hurdle", x: 300, y: VIEW.groundY - 8, length: 60, thickness: 16 }] };
    const s = createRunner(level);
    while (s.x < 220) stepRunner(s, { held: false, pressed: false }, level);
    run(s, level, 30, true, true);
    run(s, level, 120);
    expect(s.dead).toBeNull();
    expect(s.x).toBeGreaterThan(400);
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
