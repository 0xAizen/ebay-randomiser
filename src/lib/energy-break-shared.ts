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
  isBulk: boolean;
};

export type EnergyBreakBuyersGiveawayState = {
  itemName: string;
  winnerUsername: string;
  winnerEnergy: EnergyBreakSpotName;
  sourceEntryCount: number;
  ranAt: string;
};

export type EnergyBreakState = {
  breakNumber: string;
  setName: string;
  savedSetNames: string[];
  spots: EnergyBreakSpot[];
  currentBuyersGiveawayItem: string;
  buyersGiveaway: EnergyBreakBuyersGiveawayState | null;
  updatedAt: string;
};
