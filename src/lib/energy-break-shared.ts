export const ENERGY_BREAK_SPOTS = [
  "Water",
  "Fire",
  "Leaf",
  "Electric",
  "Psychic",
  "Fighting",
  "Dark",
  "Steel",
] as const;

export type EnergyBreakSpotName = (typeof ENERGY_BREAK_SPOTS)[number];

export type EnergyBreakSpot = {
  energy: EnergyBreakSpotName;
  username: string;
};

export type EnergyBreakState = {
  spots: EnergyBreakSpot[];
  updatedAt: string;
};
