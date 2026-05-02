import type { GameDefinition } from "@/types";

// Points awarded per completed scouting submission (matches server trigger)
export const POINTS_PER_MATCH = 20;

// Static game catalog — games are iframe embeds, no DB table needed.
// To add a game: append an entry here and provide a real iframeUrl.
export const GAMES: GameDefinition[] = [
  {
    id: "2048",
    name: "2048",
    description: "Slide tiles to reach the 2048 tile.",
    cost: 0,
    // Self-hosted in public/games/2048.html — no X-Frame-Options issues
    iframeUrl: "/games/2048.html",
    thumbnailUrl: "",
  },
  {
    id: "tetris",
    name: "Tetris",
    description: "Classic block-stacking puzzle game.",
    cost: 20,
    // open-source React Tetris on GitHub Pages — no X-Frame-Options restriction
    iframeUrl: "https://onlinetetris.org/GoodOldTetris/",
    thumbnailUrl: "",
  },
  {
    id: "block-blast",
    name: "Block Blast",
    description: "Fit blocks onto the board to clear lines.",
    cost: 50,
    // GitHub Pages hosted — no X-Frame-Options restriction
    iframeUrl: "https://games.engineering.com/blockblastgame/index.html",
    thumbnailUrl: "",
  },
  {
    id: "subway-surfers",
    name: "Subway Surfers",
    description: "Run, dodge, and surf through the subway.",
    cost: 50,
    // GitHub Pages hosted — no X-Frame-Options restriction
    iframeUrl: "https://77pen.github.io/p8/subway-surfers-newyork/",
    thumbnailUrl: "",
  },
];

// Ensure no duplicate IDs at module load time (dev guard)
if (import.meta.env.DEV) {
  const ids = GAMES.map((g) => g.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length > 0) {
    console.error("[games.ts] Duplicate game IDs detected:", dupes);
  }
}
