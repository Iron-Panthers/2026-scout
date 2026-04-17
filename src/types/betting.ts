export type BetAlliance = "red" | "blue";
export type BetStatus = "pending" | "won" | "lost" | "cancelled";

export interface Bet {
  id: string;
  user_id: string;
  match_id: string;
  alliance: BetAlliance;
  amount: number;
  status: BetStatus;
  payout: number | null;
  created_at: string;
  updated_at: string;
}

/** One data point in the odds-over-time history. */
export interface OddsHistoryPoint {
  index: number;
  time: string;
  redPct: number;
  bluePct: number;
  redTotal: number;
  blueTotal: number;
}

/** Computed odds for a single match. */
export interface MatchOdds {
  redTotal: number;
  blueTotal: number;
  redPct: number;
  bluePct: number;
  totalPool: number;
  betCount: number;
  history: OddsHistoryPoint[];
}

/** Bet row joined with its parent match (for "My Bets" list). */
export interface BetWithMatch extends Bet {
  match?: {
    id: string;
    name: string;
    match_number: number;
    winning_alliance?: string | null;
    event_id?: string | null;
  };
}
