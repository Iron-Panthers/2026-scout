import type { CrateRarity } from "./cosmetics";

export interface CrateTier {
  id: "common" | "uncommon" | "rare";
  name: string;
  description: string;
  cost: number;
  /** Chance of each rarity, as fractions that sum to 1. */
  odds: Record<CrateRarity, number>;
}

export const CRATE_TIERS: CrateTier[] = [
  {
    id: "common",
    name: "Common Crate",
    description: "Open sesame!",
    cost: 25,
    odds: { common: 0.6, uncommon: 0.25, rare: 0.1, "ultra-rare": 0.04, legendary: 0.01 },
  },
  {
    id: "uncommon",
    name: "Uncommon Crate",
    description: "Will you lose it all?",
    cost: 100,
    odds: { common: 0.2, uncommon: 0.4, rare: 0.25, "ultra-rare": 0.1, legendary: 0.05 },
  },
  {
    id: "rare",
    name: "Rare Crate",
    description: "Maybe you can actually get a legendary :o",
    cost: 500,
    odds: { common: 0.05, uncommon: 0.2, rare: 0.4, "ultra-rare": 0.25, legendary: 0.1 },
  },
];
