export type CosmeticCategory = "hat" | "plant";

export interface CosmeticDefinition {
  id: string;
  name: string;
  description: string;
  category: CosmeticCategory;
  emoji: string;
  cost: number;
}

export const COSMETICS: CosmeticDefinition[] = [
  // --- Hats ---
  {
    id: "hat_cowboy",
    name: "Cowboy Hat",
    description: "Yeehaw! The classic ranch look.",
    category: "hat",
    emoji: "🤠",
    cost: 25,
  },
  {
    id: "hat_graduation",
    name: "Graduation Cap",
    description: "Certified genius on the field.",
    category: "hat",
    emoji: "🎓",
    cost: 15,
  },
  {
    id: "hat_crown",
    name: "Crown",
    description: "Reserved for the most dedicated scouts.",
    category: "hat",
    emoji: "👑",
    cost: 100,
  },
  {
    id: "hat_party",
    name: "Party Hat",
    description: "Every match is a celebration.",
    category: "hat",
    emoji: "🎉",
    cost: 30,
  },
  {
    id: "hat_top",
    name: "Top Hat",
    description: "Exceedingly distinguished.",
    category: "hat",
    emoji: "🎩",
    cost: 50,
  },
  {
    id: "hat_santa",
    name: "Santa Hat",
    description: "Ho ho ho! Spreading cheer on the field.",
    category: "hat",
    emoji: "🎅",
    cost: 40,
  },
  // --- Plants ---
  {
    id: "plant_cherry",
    name: "Cherry Blossom",
    description: "A fleeting moment of beauty.",
    category: "plant",
    emoji: "🌸",
    cost: 10,
  },
  {
    id: "plant_sunflower",
    name: "Sunflower",
    description: "Always looking on the bright side.",
    category: "plant",
    emoji: "🌻",
    cost: 15,
  },
  {
    id: "plant_cactus",
    name: "Cactus",
    description: "Low maintenance. High personality.",
    category: "plant",
    emoji: "🌵",
    cost: 20,
  },
  {
    id: "plant_potted",
    name: "Potted Plant",
    description: "Brings life to any corner.",
    category: "plant",
    emoji: "🪴",
    cost: 20,
  },
  {
    id: "plant_mushroom",
    name: "Mushroom",
    description: "Fungi to be around.",
    category: "plant",
    emoji: "🍄",
    cost: 25,
  },
  {
    id: "plant_four_leaf",
    name: "Four Leaf Clover",
    description: "Bring a little luck to your bets.",
    category: "plant",
    emoji: "🍀",
    cost: 35,
  },
];

// Dev guard: catch duplicate IDs
if (import.meta.env.DEV) {
  const ids = COSMETICS.map((c) => c.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length > 0) {
    console.error("[cosmetics.ts] Duplicate cosmetic IDs detected:", dupes);
  }
}
