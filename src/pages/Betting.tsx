import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, TrendingUp, Coins, Trophy, RefreshCw, WifiOff, Zap, Target,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { getActiveEvent } from "@/lib/matches";
import { getGameProfile } from "@/lib/gameProfiles";
import { getBulkMatchOdds, getUserBets, blendOddsRedPct } from "@/lib/betting";
import { getStatboticsEventMatches, getMatchLabel, wasUpset } from "@/lib/statbotics";
import { getEventMatches } from "@/lib/blueAlliance";
import { supabase } from "@/lib/supabase";
import type { Match, Event } from "@/types";
import type { MatchOdds, BetWithMatch } from "@/types/betting";
import type { StatboticsMatch } from "@/lib/statbotics";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
interface TBAMatchData {
  match_number: number;
  comp_level: string;
  alliances: {
    red: { team_keys: string[] };
    blue: { team_keys: string[] };
  };
}

function teamNums(keys: string[]): string {
  return keys.map((k) => k.replace("frc", "")).join(" · ");
}

function getBetStatusColor(status: string) {
  switch (status) {
    case "won":       return "bg-green-600/20 text-green-400 border-green-600/30";
    case "lost":      return "bg-red-600/20 text-red-400 border-red-600/30";
    case "cancelled": return "bg-gray-600/20 text-gray-400 border-gray-600/30";
    default:          return "bg-yellow-600/20 text-yellow-400 border-yellow-600/30";
  }
}

// ---------------------------------------------------------------------------
// Interest scoring — drives spotlight selection and grid ordering
// ---------------------------------------------------------------------------
function matchInterestScore(
  match: Match,
  sb?: StatboticsMatch,
  odds?: MatchOdds,
  hasBet?: boolean
): number {
  let score = 0;
  if (sb) {
    const pMax = Math.max(sb.pred.red_win_prob, 1 - sb.pred.red_win_prob);
    if (pMax < 0.57) score += 100;   // coin flip — most interesting
    else if (pMax > 0.85) score += 70; // dominant — also dramatic
    else if (pMax > 0.70) score += 40; // heavy favourite
    else score += 20;                  // slight favourite
  }
  if (odds) score += Math.min(40, odds.betCount * 8); // activity bonus
  if (hasBet) score += 55;  // user cares about their own bets
  return score;
}

// ---------------------------------------------------------------------------
// Spotlight card — full-width, featured, shown at top of grid
// ---------------------------------------------------------------------------
interface MarketCardProps {
  match: Match;
  odds?: MatchOdds;
  tba?: TBAMatchData;
  sb?: StatboticsMatch;
  userBetAlliance?: "red" | "blue";
  onClick: () => void;
}

function SpotlightCard({ match, odds, tba, sb, userBetAlliance, onClick }: MarketCardProps) {
  const rawRedPct = odds?.redPct ?? 50;
  const redPct = sb
    ? blendOddsRedPct(rawRedPct, sb.pred.red_win_prob, odds?.totalPool ?? 0)
    : rawRedPct;
  const bluePct = 100 - redPct;

  const { label: matchLabel, flavor } = sb
    ? getMatchLabel(sb.pred.red_win_prob)
    : { label: "Match", flavor: "slight" as const };

  const sbRedPct = sb ? sb.pred.red_win_prob * 100 : null;
  const betFavour = redPct > 50 ? "red" : "blue";
  const sbFavour = sbRedPct !== null ? (sbRedPct > 50 ? "red" : "blue") : null;
  const isUpsetAlert = sbFavour !== null && betFavour !== sbFavour;

  const borderGlow =
    flavor === "coinflip" ? "border-yellow-500/50 shadow-yellow-500/5" :
    flavor === "dominant" ? "border-pink-500/40 shadow-pink-500/5" :
    flavor === "heavy"    ? "border-purple-500/40 shadow-purple-500/5" :
    "border-primary/30 shadow-primary/5";

  const flavorBadgeClass =
    flavor === "coinflip" ? "bg-yellow-600/20 text-yellow-300 border-yellow-600/30" :
    flavor === "dominant" ? "bg-pink-600/20 text-pink-300 border-pink-600/30" :
    flavor === "heavy"    ? "bg-purple-600/20 text-purple-300 border-purple-600/30" :
    "bg-gray-600/20 text-gray-300 border-gray-600/30";

  return (
    <div
      className={`relative cursor-pointer rounded-xl border-2 p-5 shadow-lg bg-card overflow-hidden transition-all duration-500 hover:scale-[1.005] ${borderGlow}`}
      onClick={onClick}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.015] to-transparent pointer-events-none" />

      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-lg">{match.name}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/30 animate-pulse">
            ★ Featured
          </Badge>
          {sb && (
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${flavorBadgeClass}`}>
              {flavor === "coinflip" ? "🪙 " : flavor === "dominant" ? "⚡ " : ""}{matchLabel}
            </Badge>
          )}
          {isUpsetAlert && (
            <Badge variant="outline" className="text-orange-300 border-orange-600/30 bg-orange-900/10 text-[10px] px-1.5 py-0">
              ⚡ Upset Alert
            </Badge>
          )}
          {userBetAlliance && (
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
              userBetAlliance === "red" ? "text-red-400 border-red-600/30 bg-red-900/10" : "text-blue-400 border-blue-600/30 bg-blue-900/10"}`}>
              Your bet: {userBetAlliance.toUpperCase()}
            </Badge>
          )}
        </div>
        <div className="text-right text-xs text-muted-foreground shrink-0 ml-2">
          <div>{odds?.betCount ?? 0} bets</div>
          <div>{odds?.totalPool ?? 0} pts pool</div>
        </div>
      </div>

      {/* Teams */}
      {tba && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
          <span className="text-red-400 font-medium">{teamNums(tba.alliances.red.team_keys)}</span>
          <span className="text-muted-foreground/30">vs</span>
          <span className="text-blue-400 font-medium">{teamNums(tba.alliances.blue.team_keys)}</span>
        </div>
      )}

      {/* Big split */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-4 text-center">
          <div className="text-[10px] text-red-400 font-semibold uppercase tracking-wider mb-1">Red</div>
          <div className="text-4xl font-black text-red-300">{Math.round(redPct)}%</div>
          <div className="text-[9px] text-muted-foreground/40 mt-0.5">combined odds</div>
        </div>
        <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-4 text-center">
          <div className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider mb-1">Blue</div>
          <div className="text-4xl font-black text-blue-300">{Math.round(bluePct)}%</div>
          <div className="text-[9px] text-muted-foreground/40 mt-0.5">combined odds</div>
        </div>
      </div>

      {/* Combined odds bar */}
      <div className="flex h-5 rounded overflow-hidden text-[10px] font-bold leading-5 mb-1">
        <div className="flex items-center justify-center bg-red-600/80 transition-all duration-500"
          style={{ width: `${redPct}%`, minWidth: redPct > 0 ? "2rem" : 0 }}>
          {redPct >= 20 && `${Math.round(redPct)}%`}
        </div>
        <div className="flex items-center justify-center bg-blue-600/80 transition-all duration-500"
          style={{ width: `${bluePct}%`, minWidth: bluePct > 0 ? "2rem" : 0 }}>
          {bluePct >= 20 && `${Math.round(bluePct)}%`}
        </div>
      </div>

      {/* Statbotics thin bar */}
      {sbRedPct !== null && (
        <>
          <div className="flex h-1.5 rounded overflow-hidden mt-2">
            <div className="bg-red-500/40 transition-all" style={{ width: `${sbRedPct}%` }} />
            <div className="bg-blue-500/40 transition-all" style={{ width: `${100 - sbRedPct}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground/50 mt-0.5">
            <span>Statbotics {sbRedPct.toFixed(1)}%</span>
            {sb && <span>Pred. {Math.round(sb.pred.red_score)}–{Math.round(sb.pred.blue_score)}</span>}
            <span>{(100 - sbRedPct).toFixed(1)}%</span>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grid card — compact, lives in the 2-col grid below the spotlight
// ---------------------------------------------------------------------------
function GridCard({ match, odds, tba, sb, userBetAlliance, onClick }: MarketCardProps) {
  const rawRedPct = odds?.redPct ?? 50;
  const redPct = sb
    ? blendOddsRedPct(rawRedPct, sb.pred.red_win_prob, odds?.totalPool ?? 0)
    : rawRedPct;
  const bluePct = 100 - redPct;

  const { flavor } = sb
    ? getMatchLabel(sb.pred.red_win_prob)
    : { flavor: "slight" as const };

  const borderClass =
    flavor === "coinflip" ? "border-yellow-700/40" :
    flavor === "dominant" ? "border-pink-700/30" :
    flavor === "heavy"    ? "border-purple-700/30" :
    "border-border";

  return (
    <div
      className={`cursor-pointer rounded-xl border p-3 transition-all hover:scale-[1.02] hover:shadow-md bg-card ${borderClass}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-1.5">
        <span className="font-bold text-sm leading-tight">{match.name}</span>
        {userBetAlliance && (
          <span className={`text-[9px] font-bold px-1 py-0.5 rounded shrink-0 ml-1 ${
            userBetAlliance === "red" ? "bg-red-600/20 text-red-400" : "bg-blue-600/20 text-blue-400"}`}>
            BET
          </span>
        )}
      </div>

      {tba && (
        <div className="text-[10px] text-muted-foreground mb-2 leading-tight">
          <span className="text-red-400">{teamNums(tba.alliances.red.team_keys)}</span>
          <span className="text-muted-foreground/30"> vs </span>
          <span className="text-blue-400">{teamNums(tba.alliances.blue.team_keys)}</span>
        </div>
      )}

      {/* Split */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-2xl font-black text-red-300">{Math.round(redPct)}%</span>
        <span className="text-[9px] text-muted-foreground/40">vs</span>
        <span className="text-2xl font-black text-blue-300">{Math.round(bluePct)}%</span>
      </div>

      {/* Mini bar */}
      <div className="flex h-2 rounded overflow-hidden mb-1.5">
        <div className="bg-red-600/70 transition-all" style={{ width: `${redPct}%` }} />
        <div className="bg-blue-600/70 transition-all" style={{ width: `${bluePct}%` }} />
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground/60">
        <span>
          {flavor === "coinflip" && <span className="text-yellow-400">🪙 Coin Flip</span>}
          {flavor === "dominant" && <span className="text-pink-400">⚡ Dominant</span>}
          {flavor === "heavy"    && <span className="text-purple-400">Heavy Fav.</span>}
        </span>
        <span>{odds?.betCount ?? 0} bets · {odds?.totalPool ?? 0} pts</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Market grid — spotlight rotation + 2-col grid
// ---------------------------------------------------------------------------
interface MarketGridProps {
  openMatches: Match[];
  oddsMap: Map<string, MatchOdds>;
  tbaMap: Map<number, TBAMatchData>;
  sbMap: Map<number, StatboticsMatch>;
  myBetByMatch: Map<string, BetWithMatch>;
  navigate: (path: string) => void;
}

function MarketGrid({ openMatches, oddsMap, tbaMap, sbMap, myBetByMatch, navigate }: MarketGridProps) {
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const [fading, setFading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Score and sort by interest
  const ordered = [...openMatches]
    .map((m) => ({
      m,
      score: matchInterestScore(m, sbMap.get(m.match_number), oddsMap.get(m.id), !!myBetByMatch.get(m.id)),
    }))
    .sort((a, b) => b.score - a.score)
    .map((s) => s.m);

  const poolSize = Math.min(5, ordered.length);
  const safeIndex = poolSize > 0 ? spotlightIndex % poolSize : 0;

  // Schedules the next auto-advance after DELAY ms. Cancels any pending timer first.
  const scheduleNext = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (poolSize <= 1) return;
    timerRef.current = setTimeout(() => {
      setFading(true);
      setTimeout(() => {
        setSpotlightIndex((i) => (i + 1) % poolSize);
        setFading(false);
        scheduleNext();
      }, 300);
    }, 8000);
  }, [poolSize]);

  // Start auto-rotation on mount / poolSize change
  useEffect(() => {
    scheduleNext();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [scheduleNext]);

  // Manual prev / next — fade transition, then restart the 8s timer from now
  const goNext = useCallback(() => {
    if (fading || poolSize <= 1) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setFading(true);
    setTimeout(() => {
      setSpotlightIndex((i) => (i + 1) % poolSize);
      setFading(false);
      scheduleNext();
    }, 250);
  }, [fading, poolSize, scheduleNext]);

  const goPrev = useCallback(() => {
    if (fading || poolSize <= 1) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setFading(true);
    setTimeout(() => {
      setSpotlightIndex((i) => ((i - 1) % poolSize + poolSize) % poolSize);
      setFading(false);
      scheduleNext();
    }, 250);
  }, [fading, poolSize, scheduleNext]);

  const jumpTo = useCallback((i: number) => {
    if (fading || i === safeIndex) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setFading(true);
    setTimeout(() => {
      setSpotlightIndex(i);
      setFading(false);
      scheduleNext();
    }, 250);
  }, [fading, safeIndex, scheduleNext]);

  if (ordered.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12">
        <Target className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p>No open markets right now.</p>
      </div>
    );
  }

  const spotlight = ordered[safeIndex];
  const rest = ordered.filter((_, i) => i !== safeIndex);

  return (
    <div className="space-y-3">
      {/* Spotlight */}
      <div className={`transition-opacity duration-300 ${fading ? "opacity-0" : "opacity-100"}`}>
        <SpotlightCard
          match={spotlight}
          odds={oddsMap.get(spotlight.id)}
          tba={tbaMap.get(spotlight.match_number)}
          sb={sbMap.get(spotlight.match_number)}
          userBetAlliance={myBetByMatch.get(spotlight.id)?.alliance as "red" | "blue" | undefined}
          onClick={() => navigate(`/betting/${spotlight.id}`)}
        />
      </div>

      {/* Carousel controls */}
      {poolSize > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={goPrev}
            className="h-7 w-7 rounded-full flex items-center justify-center bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {Array.from({ length: poolSize }).map((_, i) => (
            <button
              key={i}
              onClick={() => jumpTo(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === safeIndex ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
              }`}
            />
          ))}

          <button
            onClick={goNext}
            className="h-7 w-7 rounded-full flex items-center justify-center bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Responsive grid — 2 cols on mobile, 3 on md, 4 on lg+ */}
      {rest.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {rest.map((match) => (
            <GridCard
              key={match.id}
              match={match}
              odds={oddsMap.get(match.id)}
              tba={tbaMap.get(match.match_number)}
              sb={sbMap.get(match.match_number)}
              userBetAlliance={myBetByMatch.get(match.id)?.alliance as "red" | "blue" | undefined}
              onClick={() => navigate(`/betting/${match.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Open match card (kept for legacy — MarketGrid replaces it in the main view)
// ---------------------------------------------------------------------------
interface OpenMatchCardProps {
  match: Match;
  odds?: MatchOdds;
  tba?: TBAMatchData;
  sb?: StatboticsMatch;
  userBetAlliance?: "red" | "blue";
  onClick: () => void;
}

function OpenMatchCard({ match, odds, tba, sb, userBetAlliance, onClick }: OpenMatchCardProps) {
  const rawRedPct = odds?.redPct ?? 50;
  const redPct = sb
    ? blendOddsRedPct(rawRedPct, sb.pred.red_win_prob, odds?.totalPool ?? 0)
    : rawRedPct;
  const sbRedPct = sb ? sb.pred.red_win_prob * 100 : null;

  const { label: matchLabel, flavor } = sb
    ? getMatchLabel(sb.pred.red_win_prob)
    : { label: "Unknown", flavor: "slight" as const };

  const flavorBorder: Record<string, string> = {
    coinflip:  "border-yellow-700/40",
    slight:    "border-border",
    heavy:     "border-purple-700/30",
    dominant:  "border-pink-700/30",
  };
  const flavorBadge: Record<string, string> = {
    coinflip:  "bg-yellow-600/20 text-yellow-300 border-yellow-600/30",
    slight:    "bg-gray-600/20 text-gray-300 border-gray-600/30",
    heavy:     "bg-purple-600/20 text-purple-300 border-purple-600/30",
    dominant:  "bg-pink-600/20 text-pink-300 border-pink-600/30",
  };

  const betFavour = redPct > 50 ? "red" : "blue";
  const sbFavour = sbRedPct !== null ? (sbRedPct > 50 ? "red" : "blue") : null;
  const isUpsetAlert = sbFavour !== null && betFavour !== sbFavour;

  return (
    <Card
      className={`cursor-pointer transition-all hover:scale-[1.01] hover:shadow-md border ${flavorBorder[flavor]}`}
      onClick={onClick}
    >
      <CardContent className="pt-4 pb-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-base">{match.name}</span>
            {sb && (
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${flavorBadge[flavor]}`}>
                {flavor === "coinflip" && "🪙 "}
                {flavor === "dominant" && "⚡ "}
                {matchLabel}
              </Badge>
            )}
            {isUpsetAlert && (
              <Badge variant="outline" className="text-orange-300 border-orange-600/30 bg-orange-900/10 text-[10px] px-1.5 py-0">
                ⚡ Upset Alert
              </Badge>
            )}
            {userBetAlliance && (
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                userBetAlliance === "red"
                  ? "text-red-400 border-red-600/30 bg-red-900/10"
                  : "text-blue-400 border-blue-600/30 bg-blue-900/10"}`}>
                Your bet: {userBetAlliance.toUpperCase()}
              </Badge>
            )}
          </div>
          <div className="text-right text-xs text-muted-foreground shrink-0">
            <div>{odds?.betCount ?? 0} bets</div>
            <div>{odds?.totalPool ?? 0} pts</div>
          </div>
        </div>

        {tba && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="text-red-400 font-medium">{teamNums(tba.alliances.red.team_keys)}</span>
            <span className="text-muted-foreground/40">vs</span>
            <span className="text-blue-400 font-medium">{teamNums(tba.alliances.blue.team_keys)}</span>
          </div>
        )}

        <OddsBar redPct={redPct} />
        <div className="flex justify-between text-xs text-muted-foreground -mt-1">
          <span className="text-red-400 font-medium">Red {Math.round(redPct)}%</span>
          <span className="text-xs text-muted-foreground/50">bet odds</span>
          <span className="text-blue-400 font-medium">Blue {Math.round(100 - redPct)}%</span>
        </div>

        {sbRedPct !== null && (
          <>
            <div className="flex h-1.5 rounded overflow-hidden">
              <div className="bg-red-500/50 transition-all" style={{ width: `${sbRedPct}%` }} />
              <div className="bg-blue-500/50 transition-all" style={{ width: `${100 - sbRedPct}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground/60 -mt-1">
              <span>Statbotics: Red {sbRedPct.toFixed(1)}%</span>
              {sb && (
                <span>Pred. {Math.round(sb.pred.red_score)} – {Math.round(sb.pred.blue_score)}</span>
              )}
              <span>Blue {(100 - sbRedPct).toFixed(1)}%</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Completed match card
// ---------------------------------------------------------------------------
interface CompletedMatchCardProps {
  match: Match;
  odds?: MatchOdds;
  tba?: TBAMatchData;
  sb?: StatboticsMatch;
  userBet?: BetWithMatch;
  onClick: () => void;
}

function CompletedMatchCard({ match, odds, tba, sb, userBet, onClick }: CompletedMatchCardProps) {
  const winner = (match.winning_alliance ?? sb?.result?.winner) as "red" | "blue" | "tie" | null | undefined;
  const red = sb?.result?.red_score;
  const blue = sb?.result?.blue_score;
  const isUpset = sb && winner && winner !== "tie"
    ? wasUpset(winner, sb.pred.red_win_prob) : false;

  const winnerBorder = winner === "red" ? "border-red-700/40 bg-red-900/5"
    : winner === "blue" ? "border-blue-700/40 bg-blue-900/5"
    : "border-border";

  return (
    <Card className={`cursor-pointer transition-all hover:scale-[1.005] border ${winnerBorder}`} onClick={onClick}>
      <CardContent className="pt-3 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-bold text-sm">{match.name}</span>
              {winner && winner !== "tie" && (
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                  winner === "red" ? "text-red-400 border-red-600/30" : "text-blue-400 border-blue-600/30"}`}>
                  {winner.toUpperCase()} WIN
                </Badge>
              )}
              {isUpset && (
                <Badge className="bg-yellow-600/20 text-yellow-300 border-yellow-600/30 text-[10px] px-1.5 py-0">
                  ⚡ UPSET
                </Badge>
              )}
              {userBet && (
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getBetStatusColor(userBet.status)}`}>
                  {userBet.status === "won" ? "🎉 Won" : userBet.status === "lost" ? "Lost" : userBet.status}
                  {userBet.status === "won" && userBet.payout !== null
                    ? ` +${userBet.payout - userBet.amount}`
                    : userBet.status === "lost" ? ` −${userBet.amount}` : ""}
                </Badge>
              )}
            </div>
            {tba && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className={`font-medium ${winner === "red" ? "text-red-400" : "text-red-400/60"}`}>
                  {teamNums(tba.alliances.red.team_keys)}
                </span>
                <span className="text-muted-foreground/40">vs</span>
                <span className={`font-medium ${winner === "blue" ? "text-blue-400" : "text-blue-400/60"}`}>
                  {teamNums(tba.alliances.blue.team_keys)}
                </span>
              </div>
            )}
          </div>

          {red !== null && blue !== null && red !== undefined && blue !== undefined ? (
            <div className="flex items-center gap-2 shrink-0">
              <div className={`text-center w-12 ${winner === "red" ? "text-red-300" : "text-muted-foreground"}`}>
                <div className="text-xl font-black leading-none">{red}</div>
                <div className="text-[9px] text-red-400/60 mt-0.5">RED</div>
              </div>
              <div className="text-muted-foreground/40 text-xs">–</div>
              <div className={`text-center w-12 ${winner === "blue" ? "text-blue-300" : "text-muted-foreground"}`}>
                <div className="text-xl font-black leading-none">{blue}</div>
                <div className="text-[9px] text-blue-400/60 mt-0.5">BLUE</div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground shrink-0">
              {odds?.betCount ?? 0} bets · {odds?.totalPool ?? 0} pts
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------
interface LeaderEntry {
  userId: string;
  name: string;
  net: number;
  wins: number;
  total: number;
}

function Leaderboard({ userId }: { userId?: string }) {
  const [entries, setEntries] = useState<LeaderEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("bets")
        .select("user_id, amount, payout, status")
        .in("status", ["won", "lost"]);

      if (!data) { setLoading(false); return; }

      const map = new Map<string, { won: number; lost: number; wins: number; total: number }>();
      for (const b of data) {
        const cur = map.get(b.user_id) ?? { won: 0, lost: 0, wins: 0, total: 0 };
        cur.total += 1;
        if (b.status === "won") { cur.won += (b.payout ?? 0) - b.amount; cur.wins += 1; }
        else cur.lost += b.amount;
        map.set(b.user_id, cur);
      }

      const ids = [...map.keys()];
      const profileMap = new Map<string, string>();
      if (ids.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles").select("id, name").in("id", ids);
        profiles?.forEach((p: { id: string; name: string | null }) =>
          profileMap.set(p.id, p.name ?? "Scout")
        );
      }

      const list: LeaderEntry[] = [...map.entries()].map(([uid, stats]) => ({
        userId: uid,
        name: profileMap.get(uid) ?? "Scout",
        net: stats.won - stats.lost,
        wins: stats.wins,
        total: stats.total,
      }));
      list.sort((a, b) => b.net - a.net);
      setEntries(list);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="text-center text-muted-foreground py-8">Loading…</div>;
  if (entries.length === 0) return (
    <div className="text-center text-muted-foreground py-12">
      <Trophy className="h-10 w-10 mx-auto mb-3 opacity-30" />
      <p>No settled bets yet — be the first!</p>
    </div>
  );

  return (
    <div className="space-y-2">
      {entries.map((e, i) => (
        <Card key={e.userId} className={e.userId === userId ? "border-primary/50 bg-primary/5" : ""}>
          <CardContent className="pt-3 pb-3 flex items-center gap-3">
            <span className="text-xl font-bold w-7 text-center text-muted-foreground">
              {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
            </span>
            <div className="flex-1">
              <div className="font-semibold text-sm">
                {e.userId === userId ? `${e.name} (you)` : e.name}
              </div>
              <div className="text-xs text-muted-foreground">{e.wins}/{e.total} wins</div>
            </div>
            <div className={`font-bold text-base ${e.net >= 0 ? "text-green-400" : "text-red-400"}`}>
              {e.net >= 0 ? "+" : ""}{e.net} pts
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function Betting() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const [searchParams] = useSearchParams();
  const isInIframe = searchParams.get('isIframe') ?? false;

  const [event, setEvent] = useState<Event | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [oddsMap, setOddsMap] = useState<Map<string, MatchOdds>>(new Map());
  const [tbaMap, setTbaMap] = useState<Map<number, TBAMatchData>>(new Map());
  const [sbMap, setSbMap] = useState<Map<number, StatboticsMatch>>(new Map());
  const [myBets, setMyBets] = useState<BetWithMatch[]>([]);
  const [points, setPoints] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;

    // Sync match results from TBA + Statbotics before reading local DB state,
    // so winning_alliance is current before we render bets/settled state.
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.functions.invoke("sync-match-results", {
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
    } catch {
      // Non-fatal — page still loads from DB even if sync fails
    }

    const [activeEvent, gameProfile, userBets] = await Promise.all([
      getActiveEvent(),
      getGameProfile(user.id),
      getUserBets(user.id),
    ]);

    setPoints(gameProfile?.points ?? 0);
    setMyBets(userBets);
    setEvent(activeEvent);

    if (!activeEvent) { setLoading(false); return; }

    const { data: matchRows } = await supabase
      .from("matches")
      .select("*")
      .eq("event_id", activeEvent.id)
      .order("match_number");

    const rows = (matchRows ?? []) as Match[];
    setMatches(rows);

    const ids = rows.map((m) => m.id);
    const odds = await getBulkMatchOdds(ids);
    setOddsMap(odds);

    if (activeEvent.event_code) {
      const code = activeEvent.event_code;
      const [tba, sb] = await Promise.all([
        getEventMatches(code),
        getStatboticsEventMatches(code),
      ]);

      if (tba) {
        const map = new Map<number, TBAMatchData>();
        (tba as TBAMatchData[]).forEach((m) => {
          if (m.comp_level === "qm" || (m as any).key?.includes("_qm")) map.set(m.match_number, m);
        });
        setTbaMap(map);
      }

      if (sb && sb.length > 0) {
        const map = new Map<number, StatboticsMatch>();
        sb.forEach((m) => {
          if (m.key?.includes("_qm")) map.set(m.match_number, m);
        });
        if (map.size > 0) setSbMap(map);
      }
    }

    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30 s to pick up new bets from other users
  useEffect(() => {
    const id = setInterval(() => { if (isOnline) load(); }, 30_000);
    return () => clearInterval(id);
  }, [isOnline, load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // ---------------------------------------------------------------------------
  // Categorise
  // ---------------------------------------------------------------------------
  const completedMatches = matches.filter((m) => {
    if (m.winning_alliance) return true;
    return !!sbMap.get(m.match_number)?.result?.winner;
  });

  const openMatches = matches.filter((m) => {
    if (m.winning_alliance) return false;
    return !sbMap.get(m.match_number)?.result?.winner;
  });

  const myBetByMatch = new Map<string, BetWithMatch>();
  myBets.forEach((b) => myBetByMatch.set(b.match_id, b));

  const pendingBetCount = myBets.filter((b) => b.status === "pending").length;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading markets…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto p-4 pb-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            {!isInIframe && (
              <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <TrendingUp className="h-6 w-6 text-primary" />
                Betting Markets
              </h1>
              {event && <p className="text-sm text-muted-foreground">{event.name}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isOnline && (
              <Badge variant="outline" className="text-yellow-400 border-yellow-600/30 gap-1">
                <WifiOff className="h-3 w-3" /> Offline
              </Badge>
            )}
            <Button variant="ghost" size="icon" onClick={refresh} disabled={refreshing || !isOnline}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
            <div className="flex items-center gap-1.5 bg-muted rounded-full px-3 py-1.5">
              <Coins className="h-4 w-4 text-yellow-400" />
              <span className="font-bold text-sm">{points ?? "—"}</span>
            </div>
          </div>
        </div>

        {!event ? (
          <div className="max-w-2xl mx-auto">
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                No active event. Ask a manager to set one up.
              </CardContent>
            </Card>
          </div>
        ) : (
          <Tabs defaultValue="markets">
            <TabsList className="w-full mb-4 max-w-2xl mx-auto">
              <TabsTrigger value="markets" className="flex-1">
                <Target className="h-3.5 w-3.5 mr-1" />
                Markets
                {openMatches.length > 0 && (
                  <Badge className="ml-1.5 h-5 px-1.5 text-xs">{openMatches.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="results" className="flex-1">
                <Zap className="h-3.5 w-3.5 mr-1" />
                Results
                {completedMatches.length > 0 && (
                  <Badge className="ml-1.5 h-5 px-1.5 text-xs bg-muted text-muted-foreground">
                    {completedMatches.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="mybets" className="flex-1">
                My Bets
                {pendingBetCount > 0 && (
                  <Badge className="ml-1.5 h-5 px-1.5 text-xs bg-yellow-600">{pendingBetCount}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="leaderboard" className="flex-1">
                <Trophy className="h-3.5 w-3.5" />
              </TabsTrigger>
            </TabsList>

            {/* ── OPEN MARKETS ── */}
            <TabsContent value="markets">
              <MarketGrid
                openMatches={openMatches}
                oddsMap={oddsMap}
                tbaMap={tbaMap}
                sbMap={sbMap}
                myBetByMatch={myBetByMatch}
                navigate={navigate}
              />
            </TabsContent>

            {/* ── RESULTS ── */}
            <TabsContent value="results" className="space-y-3 max-w-2xl mx-auto">
              {completedMatches.length === 0 && (
                <div className="text-center text-muted-foreground py-12">
                  <Zap className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>No completed matches yet.</p>
                </div>
              )}

              {completedMatches.length > 0 && (() => {
                const upsets = completedMatches.filter((m) => {
                  const sb = sbMap.get(m.match_number);
                  const winner = m.winning_alliance ?? sb?.result?.winner;
                  return sb && winner && winner !== "tie" &&
                    wasUpset(winner as "red" | "blue", sb.pred.red_win_prob);
                });
                const normal = completedMatches.filter((m) => !upsets.includes(m));

                return (
                  <>
                    {upsets.length > 0 && (
                      <>
                        <div className="flex items-center gap-2 text-xs text-yellow-400 font-semibold uppercase tracking-wider">
                          <span className="h-px flex-1 bg-yellow-700/30" />
                          ⚡ Upsets
                          <span className="h-px flex-1 bg-yellow-700/30" />
                        </div>
                        {upsets.map((match) => (
                          <CompletedMatchCard key={match.id} match={match}
                            odds={oddsMap.get(match.id)} tba={tbaMap.get(match.match_number)}
                            sb={sbMap.get(match.match_number)} userBet={myBetByMatch.get(match.id)}
                            onClick={() => navigate(`/betting/${match.id}`)} />
                        ))}
                      </>
                    )}
                    {normal.length > 0 && (
                      <>
                        {upsets.length > 0 && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground font-semibold uppercase tracking-wider pt-1">
                            <span className="h-px flex-1 bg-border" />
                            Results
                            <span className="h-px flex-1 bg-border" />
                          </div>
                        )}
                        {normal.map((match) => (
                          <CompletedMatchCard key={match.id} match={match}
                            odds={oddsMap.get(match.id)} tba={tbaMap.get(match.match_number)}
                            sb={sbMap.get(match.match_number)} userBet={myBetByMatch.get(match.id)}
                            onClick={() => navigate(`/betting/${match.id}`)} />
                        ))}
                      </>
                    )}
                  </>
                );
              })()}
            </TabsContent>

            {/* ── MY BETS ── */}
            <TabsContent value="mybets" className="space-y-3 max-w-2xl mx-auto">
              {myBets.length === 0 && (
                <div className="text-center text-muted-foreground py-12">
                  <Coins className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>You haven't placed any bets yet.</p>
                </div>
              )}
              {myBets.map((bet) => {
                const sb = bet.match?.match_number ? sbMap.get(bet.match.match_number) : undefined;
                return (
                  <Card key={bet.id}
                    className="cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => bet.match_id && navigate(`/betting/${bet.match_id}`)}>
                    <CardContent className="pt-4 pb-4 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-sm">
                          {bet.match?.name ?? `Match #${bet.match?.match_number}`}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                            bet.alliance === "red" ? "bg-red-600/20 text-red-400" : "bg-blue-600/20 text-blue-400"}`}>
                            {bet.alliance.toUpperCase()}
                          </span>
                          <span className="text-xs text-muted-foreground">{bet.amount} pts</span>
                          {sb && (
                            <span className="text-[10px] text-muted-foreground/60">
                              ({bet.alliance === "red"
                                ? (sb.pred.red_win_prob * 100).toFixed(0)
                                : ((1 - sb.pred.red_win_prob) * 100).toFixed(0)}% predicted)
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className={`text-xs ${getBetStatusColor(bet.status)}`}>
                          {bet.status}
                        </Badge>
                        {bet.status === "won" && bet.payout !== null && (
                          <div className="text-sm font-bold text-green-400 mt-1">
                            +{bet.payout - bet.amount} pts
                          </div>
                        )}
                        {bet.status === "lost" && (
                          <div className="text-sm font-bold text-red-400 mt-1">
                            −{bet.amount} pts
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </TabsContent>

            {/* ── LEADERBOARD ── */}
            <TabsContent value="leaderboard" className="max-w-2xl mx-auto">
              <Leaderboard userId={user?.id} />
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
