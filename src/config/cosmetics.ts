export type CosmeticCategory = "hat" | "decoration";

export type EmojiType = "emoji" | "image";

export interface CosmeticDefinition {
  id: string;
  name: string;
  description: string;
  category: CosmeticCategory;
  emoji: string; // Emoji character or URL to png/gif
  emojiType?: EmojiType; // "emoji" for standard emoji, "image" for png/gif URL
  cost: number;
}

export const COSMETICS: CosmeticDefinition[] = [
  // --- Hats ---
  {
    id: "hat_cowboy",
    name: "Cowboy Hat",
    description: "Feel the Texan spirit :p",
    category: "hat",
    emoji: "🤠",
    cost: 25,
  },
  {
    id: "hat_graduation",
    name: "Graduation Cap",
    description: "Don't worry, you'll get this someday.",
    category: "hat",
    emoji: "🎓",
    cost: 15,
  },
  {
    id: "hat_crown",
    name: "Crown",
    description: "MY GLORIOUS QUEEN (OR KING)",
    category: "hat",
    emoji: "👑",
    cost: 100,
  },
  {
    id: "hat_party",
    name: "Party Hat",
    description: "Celebrateeee",
    category: "hat",
    emoji: "🎉",
    cost: 30,
  },
  {
    id: "hat_top",
    name: "Top Hat",
    description: "Haur Haur Haur Haur Haur",
    category: "hat",
    emoji: "🎩",
    cost: 50,
  },
  {
    id: "hat_santa",
    name: "Santa Hat",
    description: "Feeling quite jolly today, eh?",
    category: "hat",
    emoji: "🎅",
    cost: 40,
  },
  // --- Cosmetics ---
  {
    id: "decoration_cherry",
    name: "Cherry Blossom",
    description: "Wowwww so pretty",
    category: "decoration",
    emoji: "🌸",
    cost: 10,
  },
  {
    id: "decoration_sunflower",
    name: "Sunflower",
    description: "Wowwww so sunny",
    category: "decoration",
    emoji: "🌻",
    cost: 15,
  },
  {
    id: "decoration_cactus",
    name: "Cactus",
    description: "Wowwww so prickly",
    category: "decoration",
    emoji: "🌵",
    cost: 20,
  },
  {
    id: "decoration_potted",
    name: "Potted Plant",
    description: "Wowwww so... potted?",
    category: "decoration",
    emoji: "🪴",
    cost: 20,
  },
  {
    id: "decoration_mushroom",
    name: "Mushroom",
    description: "Wowwww so poisonous",
    category: "decoration",
    emoji: "🍄",
    cost: 25,
  },
  {
    id: "decoration_four_leaf",
    name: "Four Leaf Clover",
    description: "Wowwww so lucky",
    category: "decoration",
    emoji: "🍀",
    cost: 35,
  },
  {
    id: "decoration_six_seven",
    name: "6 7",
    description: "If gambling got you here, congratulations. You have our recognition.",
    category: "decoration",
    emoji: "6️⃣7️⃣",
    cost: 1000000,
  },
  // Example of image-based emoji (png/gif)
  {
    id: "hat_custom",
    name: "Custom Hat",
    description: "Upload your own hat image",
    category: "hat",
    emoji: "/uploads/custom-hat.png",
    emojiType: "image",
    cost: 50,
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
