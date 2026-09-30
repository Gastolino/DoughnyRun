import type { RunnerOptions } from "./runner";

// Each topping the doughnut can wear, and what it lets the doughnut do.
// A level names the topping it is built for; the player unlocks a topping
// by finishing the level before the first one that needs it.

export type ToppingId = "plain" | "glaze";

export interface Topping {
  id: ToppingId;
  name: string;
  /** What the topping adds, in the player's words. */
  power: string;
  airJumps: number;
}

export const TOPPINGS: Record<ToppingId, Topping> = {
  plain: { id: "plain", name: "Pink icing", power: "One jump", airJumps: 0 },
  glaze: { id: "glaze", name: "Chocolate glaze", power: "Double jump: tap again in the air", airJumps: 1 },
};

export const TOPPING_IDS = Object.keys(TOPPINGS) as ToppingId[];

export function isToppingId(value: unknown): value is ToppingId {
  return typeof value === "string" && value in TOPPINGS;
}

export function runnerOptionsFor(topping: ToppingId): RunnerOptions {
  return { airJumps: TOPPINGS[topping].airJumps };
}
