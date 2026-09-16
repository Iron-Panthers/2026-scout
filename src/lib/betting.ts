import { supabase } from "@/lib/supabase";
import { getGameProfile } from "@/lib/gameProfiles";
import { getActiveEvent, isEventWithinWindow } from "@/lib/matches";
import type { Bet, BetAlliance, BetCurrency, MatchOdds, OddsHistoryPoint, BetWithMatch } from "@/types/betting";

/** Which game_profiles column a currency's balance lives in. */
function balanceColumn(currency: BetCurrency): "points" | "event_points" {
  return currency === "event" ? "event_points" : "points";
}

function balanceOf(profile: { points: number; event_points: number }, currency: BetCurrency): number {
  return currency === "event" ? profile.event_points : profile.points;
}

// ---------------------------------------------------------------------------
// Local cache (offline support)
// ---------------------------------------------------------------------------
const CACHE_PREFIX = "betting_odds_";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedEntry {
  odds: MatchOdds;
  ts: number;
}

function cacheKey(matchId: string, currency: BetCurrency): string {
  return `${CACHE_PREFIX}${currency}_${matchId}`;
}

export function cacheMatchOdds(matchId: string, odds: MatchOdds, currency: BetCurrency = "points"): void {
  try {
    localStorage.setItem(
      cacheKey(matchId, currency),
      JSON.stringify({ odds, ts: Date.now() } satisfies CachedEntry)
    );
  } catch { /* ignore quota errors */ }
}

export function getCachedMatchOdds(matchId: string, currency: BetCurrency = "points"): MatchOdds | null {
  try {
    const raw = localStorage.getItem(cacheKey(matchId, currency));
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
// Blended display odds (bet pool + Statbotics)
// ---------------------------------------------------------------------------

/**
 * Blend bet-based red% with Statbotics predicted red win probability.
 *
 * Uses a pool-weighted formula so Statbotics dominates when few bets have
 * been placed and smoothly shifts toward pure bet-based odds as the pool grows.
 *
 *   betWeight = pool / (pool + ALPHA)
 *
 * At pool = 0   → 100% Statbotics
 * At pool = ALPHA → 50 / 50 blend
 * At pool → ∞   → 100% bet-based
 */
const BLEND_ALPHA = 50; // pts of pool = 50 / 50 crossover

export function blendOddsRedPct(
  betRedPct: number,
  sbRedWinProb: number, // 0–1
  totalPool: number
): number {
  const betWeight = totalPool / (totalPool + BLEND_ALPHA);
  return betWeight * betRedPct + (1 - betWeight) * sbRedWinProb * 100;
}

// ---------------------------------------------------------------------------
// Time-decay: bets placed close to pred_time are worth less
// ---------------------------------------------------------------------------

/**
 * How far before pred_time bets still get full value (60 minutes).
 * Within this window, value decays via a sqrt curve down to 0 at pred_time.
 */
export const FULL_VALUE_MS = 60 * 60 * 1000; // 60 min

/**
 * Returns a multiplier (0–1) based on when the bet was placed relative to pred_time.
 *
 * - Bet placed > 60 min before pred_time → 1.0 (full value)
 * - Bet placed 0–60 min before pred_time → sqrt(minutesLeft / 60) decay curve
 * - Bet placed at/after pred_time        → 0.0  (should be blocked at placement)
 * - pred_time is null/unknown            → 1.0 (no decay)
 */
export function computeTimeDecayFactor(
  betCreatedAt: string,
  predTime: string | null
): number {
  if (!predTime) return 1.0;
  const betTs = new Date(betCreatedAt).getTime();
  const predTs = new Date(predTime).getTime();
  const timeRemaining = -(betTs - predTs); // ms between bet placement and match start

  if (timeRemaining <= 0) return 0;
  if (timeRemaining >= FULL_VALUE_MS) return 1.0;
  return Math.sqrt(timeRemaining / FULL_VALUE_MS);
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
 *
 * @param timeDecayFactor - 0–1 multiplier from computeTimeDecayFactor (default 1.0)
 */
export function calcPayout(
  amount: number,
  winnerPool: number,
  totalPool: number,
  winnerPredictedProb: number,  // Statbotics predicted prob for the winning side
  timeDecayFactor: number = 1.0
): number {
  if (amount <= 0 || winnerPool <= 0) return amount; // refund edge case
  const p = Math.max(0, Math.min(1, winnerPredictedProb)); // clamp
  const multiplier = 2 * Math.pow(1 - p, 1.6) + 1.6; // baseline 0.2x
  // return Math.floor(amount * multiplier * Math.max(0, Math.min(1, timeDecayFactor * 4)));

  const inputPercent = amount / winnerPool;// * Math.min(1, Math.max(timeDecayFactor * 0.2 + 0.8, 0));
  const outputMoney = Math.floor(inputPercent * totalPool * multiplier);
  return Math.max(outputMoney, amount + 10);
}

/**
 * Estimated payout if the user places `amount` on `alliance` right now.
 * Uses the same probability-adjusted formula as settlement, including time decay.
 *
 * @param statboticsRedWinProb - Statbotics prediction (for red). Pass undefined for 50/50.
 * @param predTime - ISO string of predicted match start. Used to compute time decay.
 */
export function estimatePayout(
  amount: number,
  alliance: BetAlliance,
  odds: MatchOdds,
  statboticsRedWinProb?: number,
  predTime?: string | null
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

  const timeDecayFactor = predTime
    ? computeTimeDecayFactor(new Date().toISOString(), predTime)
    : 1.0;

  return Math.max(calcPayout(amount, newAllianceTotal, newTotalPool, p, timeDecayFactor), amount + 10);
}

// ---------------------------------------------------------------------------
// Supabase queries
// ---------------------------------------------------------------------------

/** Fetch odds for a single match, with optional offline fallback. */
export async function getMatchOdds(matchId: string, currency: BetCurrency = "points"): Promise<MatchOdds> {
  const { data: bets, error } = await supabase
    .from("bets")
    .select("id, user_id, alliance, amount, status, created_at")
    .eq("match_id", matchId)
    .eq("currency", currency)
    .in("status", ["pending", "won", "lost"]);

  if (error || !bets) {
    return getCachedMatchOdds(matchId, currency) ?? FLAT_ODDS;
  }

  const odds = computeOddsFromBets(bets as Bet[]);
  cacheMatchOdds(matchId, odds, currency);
  return odds;
}

/** Fetch raw bets for a match sorted by time (both currencies — filter client-side if needed). */
export async function getMatchBets(matchId: string): Promise<Bet[]> {
  const { data, error } = await supabase
    .from("bets")
    .select("id, user_id, alliance, amount, status, created_at, updated_at, payout, match_id, currency")
    .eq("match_id", matchId)
    .in("status", ["pending", "won", "lost"])
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data as Bet[];
}

/** Get the current user's non-cancelled bet on a match for a given currency (null if none). */
export async function getMatchUserBet(
  matchId: string,
  userId: string,
  currency: BetCurrency = "points"
): Promise<Bet | null> {
  const { data } = await supabase
    .from("bets")
    .select("*")
    .eq("match_id", matchId)
    .eq("user_id", userId)
    .eq("currency", currency)
    .neq("status", "cancelled")
    .limit(1)
    .maybeSingle();

  return (data as Bet) ?? null;
}

/** All bets for a user across all matches (both currencies). */
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

/** Fetch odds for every match in a list, for one currency (single DB query). */
export async function getBulkMatchOdds(
  matchIds: string[],
  currency: BetCurrency = "points"
): Promise<Map<string, MatchOdds>> {
  const map = new Map<string, MatchOdds>();
  if (matchIds.length === 0) return map;

  const { data: bets, error } = await supabase
    .from("bets")
    .select("match_id, alliance, amount, status, created_at")
    .in("match_id", matchIds)
    .eq("currency", currency)
    .in("status", ["pending", "won", "lost"]);

  if (error || !bets) {
    matchIds.forEach((id) => map.set(id, getCachedMatchOdds(id, currency) ?? FLAT_ODDS));
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
    cacheMatchOdds(matchId, odds, currency);
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
  amount: number,
  currency: BetCurrency = "points"
): Promise<{ success: boolean; error?: string }> {
  const profile = await getGameProfile(userId);
  if (!profile) return { success: false, error: "Could not load your game profile." };
  const balance = balanceOf(profile, currency);
  if (balance < amount) {
    const label = currency === "event" ? "event points" : "points";
    return { success: false, error: `Not enough ${label} — you have ${balance}.` };
  }

  const { data: match } = await supabase
    .from("matches")
    .select("winning_alliance, pred_time, event_id")
    .eq("id", matchId)
    .maybeSingle();

  if (match?.winning_alliance) {
    return { success: false, error: "This match has already been settled." };
  }

  if (currency === "event") {
    const activeEvent = await getActiveEvent();
    if (!activeEvent || match?.event_id !== activeEvent.id || !isEventWithinWindow(activeEvent)) {
      return { success: false, error: "Event points can only be bet on the active event's own matches." };
    }
  }

  // if (match?.pred_time && new Date(match.pred_time) <= new Date()) {
  //   return { success: false, error: "Betting is closed — this match has already started." };
  // }

  const existing = await getMatchUserBet(matchId, userId, currency);
  if (existing) {
    return { success: false, error: "You already have an active bet on this match." };
  }

  const column = balanceColumn(currency);
  const { error: balanceErr } = await supabase
    .from("game_profiles")
    .update({ [column]: balance - amount })
    .eq("user_id", userId);

  if (balanceErr) return { success: false, error: "Failed to deduct balance." };

  const { error: betErr } = await supabase.from("bets").insert({
    user_id: userId,
    match_id: matchId,
    alliance,
    amount,
    currency,
    status: "pending",
  });

  if (betErr) {
    await supabase
      .from("game_profiles")
      .update({ [column]: balance })
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
    const currency = (bet.currency as BetCurrency) ?? "points";
    const column = balanceColumn(currency);
    await supabase
      .from("game_profiles")
      .update({ [column]: balanceOf(profile, currency) + bet.amount })
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
    .select("winning_alliance, pred_time")
    .eq("id", matchId)
    .maybeSingle();

  // If winning_alliance is already set (e.g. by sync-match-results edge function),
  // use that as the authoritative winner rather than returning early — pending bets
  // may not have been processed yet.
  const effectiveWinner: "red" | "blue" | "tie" =
    (matchRow?.winning_alliance as "red" | "blue" | "tie" | null) ?? winningAlliance;

  const matchPredTime: string | null = matchRow?.pred_time ?? null;

  const { data: bets, error } = await supabase
    .from("bets")
    .select("*")
    .eq("match_id", matchId)
    .eq("status", "pending");

  if (error) return { success: false, error: "Failed to fetch bets." };

  // Set winning_alliance if not already set (prevents duplicate settlement races)
  if (!matchRow?.winning_alliance) {
    await supabase
      .from("matches")
      .update({ winning_alliance: effectiveWinner })
      .eq("id", matchId);
  }

  if (!bets || bets.length === 0) return { success: true };

  // Predicted probability for the winning side (same for both pools — it's
  // about the match outcome, not the currency).
  const p_winner =
    effectiveWinner === "tie"
      ? 0.5
      : (effectiveWinner === "red"
      ? statboticsRedWinProb
      : 1 - statboticsRedWinProb);

  // Points and event-points bets form entirely separate parimutuel pools —
  // an event bettor's payout must only ever come from other event bettors.
  async function settlePool(poolBets: Bet[], currency: BetCurrency) {
    if (poolBets.length === 0) return;
    const column = balanceColumn(currency);

    const redTotal = poolBets.filter((b) => b.alliance === "red").reduce((s, b) => s + b.amount, 0);
    const blueTotal = poolBets.filter((b) => b.alliance === "blue").reduce((s, b) => s + b.amount, 0);
    const totalPool = redTotal + blueTotal;
    const winnerPool = effectiveWinner === "red" ? redTotal : blueTotal;

    for (const bet of poolBets) {
      if (bet.status !== "pending") continue;

      let payout = 0;
      let status: "won" | "lost" = "lost";

      const timeDecayFactor = computeTimeDecayFactor(matchPredTime, bet.created_at);

      if (effectiveWinner === "tie") {
        // Refund on tie (no time decay on refunds)
        payout = bet.amount;
        status = "won";
      } else if (bet.alliance === effectiveWinner) {
        status = "won";
        payout = calcPayout(bet.amount, winnerPool, totalPool, p_winner, timeDecayFactor);
      }

      await supabase.from("bets").update({ status, payout }).eq("id", bet.id);

      if (payout > 0) {
        const profile = await getGameProfile(bet.user_id);
        if (profile) {
          await supabase
            .from("game_profiles")
            .update({ [column]: balanceOf(profile, currency) + payout })
            .eq("user_id", bet.user_id);
        }
      }
    }
  }

  const allBets = bets as Bet[];
  await settlePool(allBets.filter((b) => (b.currency ?? "points") === "points"), "points");
  await settlePool(allBets.filter((b) => b.currency === "event"), "event");

  return { success: true };
}
