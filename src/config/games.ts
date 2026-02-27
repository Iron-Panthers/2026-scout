import type { GameDefinition } from "@/types";

// Points awarded per completed scouting submission
export const POINTS_PER_MATCH = 25;

// Static game catalog — games are iframe embeds, no DB table needed.
// To add a game: append an entry here and provide a real iframeUrl.
export const GAMES: GameDefinition[] = [
  {
    id: "2048",
    name: "2048",
    description: "Slide tiles to reach the 2048 tile.",
    cost: 0,
    iframeUrl: "https://play2048.co/",
    thumbnailUrl: "https://play2048.co/favicon.png",
  },
  {
    id: "tetris",
    name: "Tetris",
    description: "Classic block-stacking puzzle game.",
    cost: 100,
    iframeUrl: "https://tetris.com/play-tetris",
    thumbnailUrl: "https://www.tetris.com/favicon.ico",
  },
  {
    id: "block-blast",
    name: "Block Blast",
    description: "Fit blocks onto the board to clear lines.",
    cost: 150,
    iframeUrl: "https://blockblast.io/",
    thumbnailUrl: "https://blockblast.io/favicon.ico",
  },
  {
    id: "subway-surfers",
    name: "Subway Surfers",
    description: "Run, dodge, and surf through the subway.",
    cost: 200,
    iframeUrl: "https://poki.com/en/g/subway-surfers",
    thumbnailUrl: "https://poki.com/favicon.ico",
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
