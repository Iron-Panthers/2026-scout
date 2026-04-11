import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, TrendingUp, Coins, Trophy, RefreshCw, WifiOff, Zap, Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { getActiveEvent } from "@/lib/matches";
import { getGameProfile } from "@/lib/gameProfiles";
import { getBulkMatchOdds, getUserBets } from "@/lib/betting";
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
// Odds bar
// ---------------------------------------------------------------------------
function OddsBar({ redPct }: { redPct: number }) {
  const r = Math.round(redPct), b = 100 - r;
  return (
    <div className="flex h-5 rounded overflow-hidden text-[10px] font-bold leading-5">
      <div className="flex items-center justify-center bg-red-600/80 transition-all duration-500"
        style={{ width: `${r}%`, minWidth: r > 0 ? "1.5rem" : 0 }}>
        {r >= 20 && `${r}%`}
      </div>
      <div className="flex items-center justify-center bg-blue-600/80 transition-all duration-500"
        style={{ width: `${b}%`, minWidth: b > 0 ? "1.5rem" : 0 }}>
        {b >= 20 && `${b}%`}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Open match card
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
  const redPct = odds?.redPct ?? 50;
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
          if (m.comp_level === "qm") map.set(m.match_number, m);
        });
        setTbaMap(map);
      }

      if (sb && sb.length > 0) {
        const map = new Map<number, StatboticsMatch>();
        sb.forEach((m) => { if (m.comp_level === "qm") map.set(m.match_number, m); });
        setSbMap(map);
      }
    }

    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

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

  // Sort open by interestingness: closest to 50/50 first
  const sortedOpen = [...openMatches].sort((a, b) => {
    const sbA = sbMap.get(a.match_number);
    const sbB = sbMap.get(b.match_number);
    const pA = sbA ? Math.abs(sbA.pred.red_win_prob - 0.5) : 0.5;
    const pB = sbB ? Math.abs(sbB.pred.red_win_prob - 0.5) : 0.5;
    return pA - pB;
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
      <main className="container mx-auto p-4 max-w-2xl pb-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
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
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              No active event. Ask a manager to set one up.
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="markets">
            <TabsList className="w-full mb-4">
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
            <TabsContent value="markets" className="space-y-3">
              {sortedOpen.length === 0 && (
                <div className="text-center text-muted-foreground py-12">
                  <Target className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>No open markets right now.</p>
                  {completedMatches.length > 0 && (
                    <p className="text-sm mt-1 text-muted-foreground/60">
                      Check the Results tab for completed matches.
                    </p>
                  )}
                </div>
              )}

              {sortedOpen.length > 0 && (() => {
                const coinFlips = sortedOpen.filter((m) => {
                  const sb = sbMap.get(m.match_number);
                  return sb ? getMatchLabel(sb.pred.red_win_prob).flavor === "coinflip" : false;
                });
                const others = sortedOpen.filter((m) => !coinFlips.includes(m));

                return (
                  <>
                    {coinFlips.length > 0 && (
                      <>
                        <div className="flex items-center gap-2 text-xs text-yellow-400 font-semibold uppercase tracking-wider">
                          <span className="h-px flex-1 bg-yellow-700/30" />
                          🪙 Coin Flips — Anything could happen
                          <span className="h-px flex-1 bg-yellow-700/30" />
                        </div>
                        {coinFlips.map((match) => (
                          <OpenMatchCard key={match.id} match={match}
                            odds={oddsMap.get(match.id)} tba={tbaMap.get(match.match_number)}
                            sb={sbMap.get(match.match_number)}
                            userBetAlliance={myBetByMatch.get(match.id)?.alliance as "red" | "blue" | undefined}
                            onClick={() => navigate(`/betting/${match.id}`)} />
                        ))}
                      </>
                    )}
                    {others.length > 0 && (
                      <>
                        {coinFlips.length > 0 && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground font-semibold uppercase tracking-wider pt-1">
                            <span className="h-px flex-1 bg-border" />
                            Other Matches
                            <span className="h-px flex-1 bg-border" />
                          </div>
                        )}
                        {others.map((match) => (
                          <OpenMatchCard key={match.id} match={match}
                            odds={oddsMap.get(match.id)} tba={tbaMap.get(match.match_number)}
                            sb={sbMap.get(match.match_number)}
                            userBetAlliance={myBetByMatch.get(match.id)?.alliance as "red" | "blue" | undefined}
                            onClick={() => navigate(`/betting/${match.id}`)} />
                        ))}
                      </>
                    )}
                  </>
                );
              })()}
            </TabsContent>

            {/* ── RESULTS ── */}
            <TabsContent value="results" className="space-y-3">
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
            <TabsContent value="mybets" className="space-y-3">
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
            <TabsContent value="leaderboard">
              <Leaderboard userId={user?.id} />
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
