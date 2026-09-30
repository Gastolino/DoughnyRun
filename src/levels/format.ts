import { isToppingId } from "../logic/toppings";
import type { ToppingId } from "../logic/toppings";
import { DOUGHNUT, VIEW } from "../logic/tuning";
import { vehicleWidth } from "../logic/terrain";
import type { Boost, Chaser, GroundSegment, Hills, LevelData, Ramp, Sausage, Street, Theme, Vehicle } from "../logic/types";

// The level file format, shared by the levels in this folder and by the
// editor's export. A level is a list of typed elements, so that new kinds of
// element (ramps, speed boosts) can be added without changing old files:
// each gets its own "type" and its own fields.
//
// {
//   "format": 1,
//   "name": "Sprinkle Hop",
//   "length": 6400,
//   "topping": "plain",
//   "chaser": { "gap": 900, "speed": 460, "speedEnd": 505 },   (a boss level only)
//   "theme": "city",                                            (World 2; "candy" by default)
//   "elements": [
//     { "type": "gap", "x": 1300, "width": 140 },
//     { "type": "sausage", "x": 2000, "y": 231, "length": 40 },
//     { "type": "ramp", "x": 2600, "width": 300, "height": 90 },
//     { "type": "boost", "x": 3400, "width": 160 },
//     { "type": "hills", "x": 4000, "width": 1200, "height": 70, "waves": 3 },
//     { "type": "street", "x": 5400, "width": 900 },
//     { "type": "cab", "x": 5600 },
//     { "type": "cart", "x": 6500 }
//   ]
// }
//
// Positions are world pixels. x grows to the right from the start; y grows
// downwards, with the ground's surface at y = 460 and the top of the screen at
// y = 0 when the camera sits at the ground.

export const FORMAT_VERSION = 1;

/** Height of the hole's centre for a doughnut rolling along the ground. */
export const RUN_HEIGHT = VIEW.groundY - DOUGHNUT.outerRadius;

export const COCKTAIL_THICKNESS = 22;

export interface GapElement {
  type: "gap";
  x: number;
  width: number;
}

export interface SausageElement {
  type: "sausage";
  x: number;
  /** Vertical centre. */
  y: number;
  length: number;
  /** Defaults to a cocktail sausage's thickness. */
  thickness?: number;
}

/** A kicker ramp: see Ramp in logic/types. */
export interface RampElement {
  type: "ramp";
  x: number;
  width: number;
  height: number;
}

export interface BoostElement {
  type: "boost";
  x: number;
  width: number;
}

/** Rolling hills: see Hills in logic/types. */
export interface HillsElement {
  type: "hills";
  x: number;
  width: number;
  height: number;
  waves: number;
}

/** A parked cab: see Vehicle in logic/types. */
export interface CabElement {
  type: "cab";
  x: number;
}

/** A parked hot dog cart. */
export interface CartElement {
  type: "cart";
  x: number;
}

export type VehicleElement = CabElement | CartElement;

/** A street crossing, scenery for the city. */
export interface StreetElement {
  type: "street";
  x: number;
  width: number;
}

export type LevelElement =
  | GapElement
  | SausageElement
  | RampElement
  | BoostElement
  | HillsElement
  | CabElement
  | CartElement
  | StreetElement;

export interface LevelFile {
  format: number;
  name: string;
  length: number;
  topping: ToppingId;
  /** The denture chase, on a boss level. */
  chaser?: Chaser;
  /** The world's look; the sugar land when absent. */
  theme?: Theme;
  elements: LevelElement[];
}

export const LIMITS = {
  minLength: 1200,
  maxLength: 60000,
  minSausageLength: 20,
  maxSausageLength: 4000,
  minGapWidth: 20,
  minRampWidth: 80,
  maxRampWidth: 1500,
  minRampHeight: 10,
  maxRampHeight: 320,
  minBoostWidth: 40,
  maxBoostWidth: 800,
  minHillsWidth: 200,
  maxHillsWidth: 20000,
  minHillsHeight: 10,
  maxHillsHeight: 200,
  maxWaves: 40,
  minStreetWidth: 100,
  minChaserGap: 200,
  maxChaserGap: 3000,
  minChaserSpeed: 100,
  maxChaserSpeed: 900,
  /** The solver keeps the running pad in five bits of its state key. */
  maxBoosts: 30,
  /** Highest a sausage may hang: far above anything a double jump reaches. */
  minY: -600,
  maxY: VIEW.groundY - 8,
} as const;

export class LevelFormatError extends Error {}

/**
 * Checks untrusted JSON (a pasted export, a saved level) and returns a level
 * file, or throws a LevelFormatError that says what is wrong and where.
 */
export function parseLevelFile(input: unknown): LevelFile {
  const fail = (message: string): never => {
    throw new LevelFormatError(message);
  };
  const obj = (v: unknown, where: string): Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : fail(`${where} must be an object.`);
  const num = (o: Record<string, unknown>, key: string, where: string, min: number, max: number): number => {
    const v = o[key];
    if (typeof v !== "number" || !Number.isFinite(v)) return fail(`${where}: "${key}" must be a number.`);
    if (v < min || v > max) return fail(`${where}: "${key}" is ${v}, but must be between ${min} and ${max}.`);
    return v;
  };

  const root = obj(input, "The level");
  if (root.format !== FORMAT_VERSION) fail(`The level's "format" must be ${FORMAT_VERSION}.`);
  const name = typeof root.name === "string" && root.name.trim() ? root.name.trim().slice(0, 60) : fail('The level needs a "name".');
  const length = num(root, "length", "The level", LIMITS.minLength, LIMITS.maxLength);
  const topping = isToppingId(root.topping) ? root.topping : fail(`The level's "topping" must be "plain" or "glaze".`);
  if (!Array.isArray(root.elements)) fail('The level needs an "elements" list.');

  const elements = (root.elements as unknown[]).map((raw, i): LevelElement => {
    const where = `Element ${i + 1}`;
    const e = obj(raw, where);
    switch (e.type) {
      case "gap":
        return {
          type: "gap",
          x: num(e, "x", where, 0, length),
          width: num(e, "width", where, LIMITS.minGapWidth, LIMITS.maxLength),
        };
      case "sausage": {
        const s: SausageElement = {
          type: "sausage",
          x: num(e, "x", where, 0, length),
          y: num(e, "y", where, LIMITS.minY, LIMITS.maxY),
          length: num(e, "length", where, LIMITS.minSausageLength, LIMITS.maxSausageLength),
        };
        if (e.thickness !== undefined) s.thickness = num(e, "thickness", where, 8, 44);
        return s;
      }
      case "ramp":
        return {
          type: "ramp",
          x: num(e, "x", where, 0, length),
          width: num(e, "width", where, LIMITS.minRampWidth, LIMITS.maxRampWidth),
          height: num(e, "height", where, LIMITS.minRampHeight, LIMITS.maxRampHeight),
        };
      case "boost":
        return {
          type: "boost",
          x: num(e, "x", where, 0, length),
          width: num(e, "width", where, LIMITS.minBoostWidth, LIMITS.maxBoostWidth),
        };
      case "hills": {
        const waves = num(e, "waves", where, 1, LIMITS.maxWaves);
        if (!Number.isInteger(waves)) return fail(`${where}: "waves" must be a whole number.`);
        return {
          type: "hills",
          x: num(e, "x", where, 0, length),
          width: num(e, "width", where, LIMITS.minHillsWidth, LIMITS.maxHillsWidth),
          height: num(e, "height", where, LIMITS.minHillsHeight, LIMITS.maxHillsHeight),
          waves,
        };
      }
      case "cab":
      case "cart":
        return { type: e.type, x: num(e, "x", where, 0, length) };
      case "street":
        return {
          type: "street",
          x: num(e, "x", where, 0, length),
          width: num(e, "width", where, LIMITS.minStreetWidth, LIMITS.maxLength),
        };
      default:
        return fail(`${where} has an unknown "type": ${JSON.stringify(e.type)}.`);
    }
  });
  // Ramps, hills and vehicles each shape the surface, so no two may overlap.
  const shaped = elements
    .flatMap((e) => {
      if (e.type === "ramp" || e.type === "hills") return [{ name: e.type === "ramp" ? "ramp" : "hills", x: e.x, width: e.width }];
      if (e.type === "cab" || e.type === "cart") return [{ name: e.type, x: e.x, width: vehicleWidth({ kind: e.type, x: e.x }) }];
      return [];
    })
    .sort((a, b) => a.x - b.x);
  for (let i = 1; i < shaped.length; i++) {
    const [a, b] = [shaped[i - 1], shaped[i]];
    if (b.x <= a.x + a.width) fail(`The ${a.name} at x = ${a.x} and the ${b.name} at x = ${b.x} overlap.`);
  }
  if (elements.filter((e) => e.type === "boost").length > LIMITS.maxBoosts) {
    fail(`A level can have at most ${LIMITS.maxBoosts} speed pads.`);
  }
  const file: LevelFile = { format: FORMAT_VERSION, name, length, topping, elements };
  if (root.theme !== undefined) {
    if (root.theme !== "candy" && root.theme !== "city") fail('The level\'s "theme" must be "candy" or "city".');
    if (root.theme === "city") file.theme = "city";
  }
  if (root.chaser !== undefined) {
    const c = obj(root.chaser, 'The level\'s "chaser"');
    const where = "The chaser";
    file.chaser = {
      gap: num(c, "gap", where, LIMITS.minChaserGap, LIMITS.maxChaserGap),
      speed: num(c, "speed", where, LIMITS.minChaserSpeed, LIMITS.maxChaserSpeed),
      speedEnd: num(c, "speedEnd", where, LIMITS.minChaserSpeed, LIMITS.maxChaserSpeed),
    };
  }
  return file;
}

/** Turns a level file into a playable level: ground from the gaps, sorted sausages. */
export function buildLevel(file: LevelFile): LevelData {
  const gaps = file.elements.filter((e): e is GapElement => e.type === "gap").sort((a, b) => a.x - b.x);
  const ground: GroundSegment[] = [];
  let x = 0;
  for (const gap of gaps) {
    if (gap.x > x) ground.push({ x, width: gap.x - x });
    x = Math.max(x, gap.x + gap.width);
  }
  // The ground runs on past the finish so the doughnut has somewhere to land.
  ground.push({ x, width: Math.max(0, file.length + VIEW.width - x) });
  const sausages: Sausage[] = file.elements
    .filter((e): e is SausageElement => e.type === "sausage")
    .map((e) => ({ x: e.x, y: e.y, length: e.length, thickness: e.thickness ?? COCKTAIL_THICKNESS }))
    .sort((a, b) => a.x - b.x);
  const ramps: Ramp[] = file.elements
    .filter((e): e is RampElement => e.type === "ramp")
    .map((e) => ({ x: e.x, width: e.width, height: e.height }))
    .sort((a, b) => a.x - b.x);
  const boosts: Boost[] = file.elements
    .filter((e): e is BoostElement => e.type === "boost")
    .map((e) => ({ x: e.x, width: e.width }))
    .sort((a, b) => a.x - b.x);
  const hills: Hills[] = file.elements
    .filter((e): e is HillsElement => e.type === "hills")
    .map((e) => ({ x: e.x, width: e.width, height: e.height, waves: e.waves }))
    .sort((a, b) => a.x - b.x);
  const vehicles: Vehicle[] = file.elements
    .filter((e): e is VehicleElement => e.type === "cab" || e.type === "cart")
    .map((e) => ({ kind: e.type, x: e.x }))
    .sort((a, b) => a.x - b.x);
  const streets: Street[] = file.elements
    .filter((e): e is StreetElement => e.type === "street")
    .map((e) => ({ x: e.x, width: e.width }))
    .sort((a, b) => a.x - b.x);
  const level: LevelData = {
    name: file.name,
    length: file.length,
    topping: file.topping,
    ground,
    sausages,
    ramps,
    boosts,
    hills,
    vehicles,
    streets,
    theme: file.theme ?? "candy",
  };
  if (file.chaser) level.chaser = { ...file.chaser };
  return level;
}

/** Writes a level file as tidy JSON, one element per line. */
export function stringifyLevelFile(file: LevelFile): string {
  const { elements, ...head } = file;
  const lines = elements.map((e) => "    " + JSON.stringify(e));
  const top = JSON.stringify(head, null, 2).slice(0, -2);
  return `${top},\n  "elements": [\n${lines.join(",\n")}\n  ]\n}\n`;
}
