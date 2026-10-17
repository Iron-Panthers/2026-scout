/**
 * Each FRC season's main game piece and its colour, used to colour events by year
 * (e.g. the dots on the profile page's scouting map).
 */
export interface SeasonGamePiece {
  game: string;
  piece: string;
  color: string;
}

export const SEASON_GAME_PIECES: Record<number, SeasonGamePiece> = {
  2026: { game: "REBUILT", piece: "Fuel", color: "#facc15" },
  2025: { game: "REEFSCAPE", piece: "Coral", color: "#f8fafc" },
  2024: { game: "CRESCENDO", piece: "Note", color: "#f97316" },
  // Cones and cubes were both main pieces; the purple cube stands apart from the other years
  2023: { game: "CHARGED UP", piece: "Cube", color: "#8b5cf6" },
  // Cargo came in both alliance colours
  2022: { game: "RAPID REACT", piece: "Cargo", color: "#ef4444" },
  2021: { game: "INFINITE RECHARGE", piece: "Power Cell", color: "#fde047" },
  2020: { game: "INFINITE RECHARGE", piece: "Power Cell", color: "#fde047" },
  2019: { game: "DESTINATION: DEEP SPACE", piece: "Cargo", color: "#fb923c" },
  2018: { game: "FIRST POWER UP", piece: "Power Cube", color: "#eab308" },
  2017: { game: "FIRST STEAMWORKS", piece: "Fuel", color: "#84cc16" },
  2016: { game: "FIRST STRONGHOLD", piece: "Boulder", color: "#9ca3af" },
  2015: { game: "RECYCLE RUSH", piece: "Tote", color: "#a3a3a3" },
};
