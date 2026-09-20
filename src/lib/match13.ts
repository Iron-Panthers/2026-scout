/**
 * Types + generic helpers for match13 (https://match13.com) predictions.
 *
 * match13's API sends no CORS headers and its key must stay server-side
 * ("Call it from a server, where your key stays out of sight" — match13 docs),
 * so there is no direct client fetch here. Predictions are synced into the
 * `matches` table by the sync-match-results edge function (which calls
 * match13 directly, server-side, using the actions.match13.com REST API) and
 * read back from the DB / that function's response by the betting pages,
 * then combined with TBA for actual results (match13 only forecasts —
 * it never reports what actually happened).
 */

export interface Match13Pred {
  winner: "red" | "blue" | null;
  red_win_prob: number; // 0–1, match13's `pred.winProb`
  red_score: number;
  blue_score: number;
}

export interface Match13Result {
  winner: "red" | "blue" | "tie" | null;
  red_score: number | null;
  blue_score: number | null;
}

export interface Match13Match {
  key: string;
  event: string;
  match_number: number;
  comp_level: string;
  pred: Match13Pred;
  result: Match13Result;
}

/** Returns label for how lopsided a match is predicted to be. */
export function getMatchLabel(redWinProb: number): {
  label: string;
  flavor: "coinflip" | "slight" | "heavy" | "dominant";
} {
  const pMax = Math.max(redWinProb, 1 - redWinProb);
  if (pMax < 0.57) return { label: "Coin Flip", flavor: "coinflip" };
  if (pMax < 0.70) return { label: "Slight Favorite", flavor: "slight" };
  if (pMax < 0.85) return { label: "Heavy Favorite", flavor: "heavy" };
  return { label: "Dominant Favorite", flavor: "dominant" };
}

/** Whether the winning side was the predicted underdog. */
export function wasUpset(
  winner: "red" | "blue" | "tie",
  redWinProb: number
): boolean {
  if (winner === "tie") return false;
  const winnerProb = winner === "red" ? redWinProb : 1 - redWinProb;
  return winnerProb < 0.45;
}
