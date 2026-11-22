import { simulateCategory } from "./simulation-core.mjs";

export { SIMULATION_START_RATING, SIMULATION_QUALIFIERS, SIMULATION_ROUNDS } from "./simulation-core.mjs";
export type { SimulatedMatch, SimulatedPlayer } from "./simulation-core.mjs";

export function simulateSinglesMen() {
  return simulateCategory(12);
}

export function simulateSinglesMen24() {
  return simulateCategory(24);
}