import { supabase } from "@/lib/supabase";
import { getGameProfile } from "@/lib/gameProfiles";
import type { Bet, BetAlliance, MatchOdds, OddsHistoryPoint, BetWithMatch } from "@/types/betting";

// ---------------------------------------------------------------------------
// Local cache (offline support)
// ---------------------------------------------------------------------------
const CACHE_PREFIX = "betting_odds_";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedEntry {
  odds: MatchOdds;
  ts: number;
}

export function cacheMatchOdds(matchId: string, odds: MatchOdds): void {
  try {
    localStorage.setItem(
      CACHE_PREFIX + matchId,
      JSON.stringify({ odds, ts: Date.now() } satisfies CachedEntry)
    );
  } catch { /* ignore quota errors */ }
}

export function getCachedMatchOdds(matchId: string): MatchOdds | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + matchId);
    if (!raw) return null;
    const entry: CachedEntry = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
    return entry.odds;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Odds computation (pure, works offline from cached bets)
// ---------------------------------------------------------------------------
const FLAT_ODDS: MatchOdds = {
  redTotal: 0,
  blueTotal: 0,
  redPct: 50,
  bluePct: 50,
  totalPool: 0,
  betCount: 0,
  history: [{ index: 0, time: "", redPct: 50, bluePct: 50, redTotal: 0, blueTotal: 0 }],
};

export function computeOddsFromBets(bets: Bet[]): MatchOdds {
  if (bets.length === 0) return FLAT_ODDS;

  const sorted = [...bets].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  let redTotal = 0;
  let blueTotal = 0;
  const history: OddsHistoryPoint[] = [
    { index: 0, time: "", redPct: 50, bluePct: 50, redTotal: 0, blueTotal: 0 },
  ];

  for (const bet of sorted) {
    if (bet.alliance === "red") redTotal += bet.amount;
    else blueTotal += bet.amount;

    const total = redTotal + blueTotal;
    const redPct = total > 0 ? (redTotal / total) * 100 : 50;
    history.push({
      index: history.length,
      time: bet.created_at,
      redPct,
      bluePct: 100 - redPct,
      redTotal,
      blueTotal,
    });
  }

  const totalPool = redTotal + blueTotal;
  const redPct = totalPool > 0 ? (redTotal / totalPool) * 100 : 50;

  return {
    redTotal,
    blueTotal,
    redPct,
    bluePct: 100 - redPct,
    totalPool,
    betCount: bets.length,
    history,
  };
}

// ---------------------------------------------------------------------------
// Probability-adjusted payout formula
// ---------------------------------------------------------------------------
/**
 * Calculates the payout multiplier given Statbotics win probability.
 *
 * Formula: effectiveMultiplier = min(fairMultiplier, maxMultiplier)
 *   - fairMultiplier = 1/p_winner  (e.g. 80% fav → 1.25×, 20% underdog → 5×)
 *   - maxMultiplier  = totalPool / winnerPool  (can never exceed pool)
 *
 * This naturally rewards underdogs:
 *   • When underdog wins, winnerPool is small → maxMultiplier is high → pays fair odds
 *   • When favorite wins, fairMultiplier is small → caps payout → some points are burned
 *   • At 50/50 (no data): both equal → behaves like pure parimutuel
 */
export function calcPayout(
  amount: number,
  winnerPool: number,
  totalPool: number,
  winnerPredictedProb: number  // Statbotics predicted prob for the winning side
): number {
  if (amount <= 0 || winnerPool <= 0) return amount; // refund edge case
  const p = Math.max(0.01, Math.min(0.99, winnerPredictedProb)); // clamp
  const fairMultiplier = 1.0 / p;
  const maxMultiplier = totalPool / winnerPool;
  const effectiveMultiplier = Math.min(fairMultiplier, maxMultiplier);
  return Math.floor(amount * effectiveMultiplier);
}

/**
 * Estimated payout if the user places `amount` on `alliance` right now.
 * Uses the same probability-adjusted formula as settlement.
 *
 * @param statboticsRedWinProb - Statbotics prediction (for red). Pass undefined for 50/50.
 */
export function estimatePayout(
  amount: number,
  alliance: BetAlliance,
  odds: MatchOdds,
  statboticsRedWinProb?: number
): number {
  if (amount <= 0) return 0;

  const allianceTotal = alliance === "red" ? odds.redTotal : odds.blueTotal;
  const newAllianceTotal = allianceTotal + amount;
  const newTotalPool = odds.totalPool + amount;

  // p for the alliance they're betting on
  const p =
    statboticsRedWinProb !== undefined
      ? alliance === "red"
        ? statboticsRedWinProb
        : 1 - statboticsRedWinProb
      : 0.5;

  return calcPayout(amount, newAllianceTotal, newTotalPool, p);
}

// ---------------------------------------------------------------------------
// Supabase queries
// ---------------------------------------------------------------------------

/** Fetch odds for a single match, with optional offline fallback. */
export async function getMatchOdds(matchId: string): Promise<MatchOdds> {
  const { data: bets, error } = await supabase
    .from("bets")
    .select("id, user_id, alliance, amount, status, created_at")
    .eq("match_id", matchId)
    .in("status", ["pending", "won", "lost"]);

  if (error || !bets) {
    return getCachedMatchOdds(matchId) ?? FLAT_ODDS;
  }

  const odds = computeOddsFromBets(bets as Bet[]);
  cacheMatchOdds(matchId, odds);
  return odds;
}

/** Fetch raw bets for a match sorted by time. */
export async function getMatchBets(matchId: string): Promise<Bet[]> {
  const { data, error } = await supabase
    .from("bets")
    .select("id, user_id, alliance, amount, status, created_at, updated_at, payout, match_id")
    .eq("match_id", matchId)
    .in("status", ["pending", "won", "lost"])
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data as Bet[];
}

/** Get the current user's non-cancelled bet on a match (null if none). */
export async function getMatchUserBet(
  matchId: string,
  userId: string
): Promise<Bet | null> {
  const { data } = await supabase
    .from("bets")
    .select("*")
    .eq("match_id", matchId)
    .eq("user_id", userId)
    .neq("status", "cancelled")
    .maybeSingle();

  return (data as Bet) ?? null;
}

/** All bets for a user across all matches. */
export async function getUserBets(userId: string): Promise<BetWithMatch[]> {
  const { data, error } = await supabase
    .from("bets")
    .select(
      `*, match:matches(id, name, match_number, winning_alliance, event_id)`
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data as BetWithMatch[];
}

/** Fetch odds for every match in a list (single DB query). */
export async function getBulkMatchOdds(
  matchIds: string[]
): Promise<Map<string, MatchOdds>> {
  const map = new Map<string, MatchOdds>();
  if (matchIds.length === 0) return map;

  const { data: bets, error } = await supabase
    .from("bets")
    .select("match_id, alliance, amount, status, created_at")
    .in("match_id", matchIds)
    .in("status", ["pending", "won", "lost"]);

  if (error || !bets) {
    matchIds.forEach((id) => map.set(id, getCachedMatchOdds(id) ?? FLAT_ODDS));
    return map;
  }

  const grouped = new Map<string, Bet[]>();
  for (const bet of bets) {
    const arr = grouped.get(bet.match_id) ?? [];
    arr.push(bet as Bet);
    grouped.set(bet.match_id, arr);
  }

  for (const matchId of matchIds) {
    const odds = computeOddsFromBets(grouped.get(matchId) ?? []);
    cacheMatchOdds(matchId, odds);
    map.set(matchId, odds);
  }

  return map;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function placeBet(
  userId: string,
  matchId: string,
  alliance: BetAlliance,
  amount: number
): Promise<{ success: boolean; error?: string }> {
  const profile = await getGameProfile(userId);
  if (!profile) return { success: false, error: "Could not load your game profile." };
  if (profile.points < amount) {
    return { success: false, error: `Not enough points — you have ${profile.points} pts.` };
  }

  const { data: match } = await supabase
    .from("matches")
    .select("winning_alliance")
    .eq("id", matchId)
    .maybeSingle();

  if (match?.winning_alliance) {
    return { success: false, error: "This match has already been settled." };
  }

  const existing = await getMatchUserBet(matchId, userId);
  if (existing) {
    return { success: false, error: "You already have an active bet on this match." };
  }

  const { error: pointsErr } = await supabase
    .from("game_profiles")
    .update({ points: profile.points - amount })
    .eq("user_id", userId);

  if (pointsErr) return { success: false, error: "Failed to deduct points." };

  const { error: betErr } = await supabase.from("bets").insert({
    user_id: userId,
    match_id: matchId,
    alliance,
    amount,
    status: "pending",
  });

  if (betErr) {
    await supabase
      .from("game_profiles")
      .update({ points: profile.points })
      .eq("user_id", userId);
    return { success: false, error: "Failed to place bet." };
  }

  return { success: true };
}

export async function cancelBet(
  betId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const { data: bet } = await supabase
    .from("bets")
    .select("*")
    .eq("id", betId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!bet) return { success: false, error: "Bet not found." };
  if (bet.status !== "pending") return { success: false, error: "Can only cancel pending bets." };

  const { error: updateErr } = await supabase
    .from("bets")
    .update({ status: "cancelled" })
    .eq("id", betId)
    .eq("user_id", userId);

  if (updateErr) return { success: false, error: "Failed to cancel bet." };

  const profile = await getGameProfile(userId);
  if (profile) {
    await supabase
      .from("game_profiles")
      .update({ points: profile.points + bet.amount })
      .eq("user_id", userId);
  }

  return { success: true };
}

/**
 * Settle all pending bets for a match using probability-adjusted payouts.
 *
 * @param winningAlliance - The actual match result
 * @param statboticsRedWinProb - Statbotics predicted red win probability (0–1).
 *   Pass 0.5 if unavailable. This adjusts payouts so upsets reward more than favorites.
 */
export async function settleMatchBets(
  matchId: string,
  winningAlliance: "red" | "blue" | "tie",
  statboticsRedWinProb: number = 0.5
): Promise<{ success: boolean; error?: string }> {
  // Check not already settled
  const { data: matchRow } = await supabase
    .from("matches")
    .select("winning_alliance")
    .eq("id", matchId)
    .maybeSingle();

  if (matchRow?.winning_alliance) {
    return { success: true }; // already done
  }

  const { data: bets, error } = await supabase
    .from("bets")
    .select("*")
    .eq("match_id", matchId)
    .eq("status", "pending");

  if (error) return { success: false, error: "Failed to fetch bets." };

  // Update match result first (prevents duplicate settlement races)
  await supabase
    .from("matches")
    .update({ winning_alliance: winningAlliance })
    .eq("id", matchId);

  if (!bets || bets.length === 0) return { success: true };

  const redTotal = (bets as Bet[])
    .filter((b) => b.alliance === "red")
    .reduce((s, b) => s + b.amount, 0);
  const blueTotal = (bets as Bet[])
    .filter((b) => b.alliance === "blue")
    .reduce((s, b) => s + b.amount, 0);
  const totalPool = redTotal + blueTotal;

  const winnerPool = winningAlliance === "red" ? redTotal : blueTotal;

  // Predicted probability for the winning side
  const p_winner =
    winningAlliance === "tie"
      ? 0.5
      : winningAlliance === "red"
      ? statboticsRedWinProb
      : 1 - statboticsRedWinProb;

  for (const bet of bets as Bet[]) {
    let payout = 0;
    let status: "won" | "lost" = "lost";

    if (winningAlliance === "tie") {
      // Refund on tie
      payout = bet.amount;
      status = "won";
    } else if (bet.alliance === winningAlliance) {
      status = "won";
      payout = calcPayout(bet.amount, winnerPool, totalPool, p_winner);
    }

    await supabase.from("bets").update({ status, payout }).eq("id", bet.id);

    if (payout > 0) {
      const profile = await getGameProfile(bet.user_id);
      if (profile) {
        await supabase
          .from("game_profiles")
          .update({ points: profile.points + payout })
          .eq("user_id", bet.user_id);
      }
    }
  }

  return { success: true };
}
