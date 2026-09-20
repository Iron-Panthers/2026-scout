import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Coins, WifiOff, CheckCircle2, XCircle, Loader2, Zap, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { supabase } from "@/lib/supabase";
import { getGameProfile } from "@/lib/gameProfiles";
import {
  getMatchBets, getMatchUserBet, placeBet, cancelBet,
  computeOddsFromBets, estimatePayout, settleMatchBets,
  cacheMatchOdds, getCachedMatchOdds, blendOddsRedPct,
  computeTimeDecayFactor, FULL_VALUE_MS,
} from "@/lib/betting";
import { getMatchLabel, wasUpset } from "@/lib/match13";
import { getEventMatches, getEventTeams, getMatchScores } from "@/lib/blueAlliance";
import { isEventWithinWindow } from "@/lib/matches";
import { getEventCurrencyLogo } from "@/config/eventCurrency";
import type { Match, Event } from "@/types";
import type { Bet, BetCurrency, MatchOdds, OddsHistoryPoint } from "@/types/betting";
import type { Match13Match } from "@/lib/match13";
import type { TBATeamSimple } from "@/lib/blueAlliance";

// ---------------------------------------------------------------------------
// Odds Area Chart — pure SVG
// ---------------------------------------------------------------------------
interface OddsChartProps {
  history: OddsHistoryPoint[];
  isLive: boolean;
}

function OddsChart({ history, isLive }: OddsChartProps) {
  const W = 500, H = 180;
  const PL = 36, PR = 14, PT = 12, PB = 28;
  const cw = W - PL - PR, ch = H - PT - PB;

  const pts = history.length >= 2
    ? history
    : [{ redPct: 50, index: 0 }, { redPct: 50, index: 1 }];
  const n = pts.length;

  const px = (i: number) => PL + (i / (n - 1)) * cw;
  const py = (pct: number) => PT + (pct / 100) * ch;

  const redD = [
    `M ${px(0)} ${PT}`,
    ...pts.map((p, i) => `L ${px(i)} ${py(p.redPct)}`),
    `L ${px(n - 1)} ${PT}`, "Z",
  ].join(" ");

  const blueD = [
    ...pts.map((p, i) => `${i === 0 ? "M" : "L"} ${px(i)} ${py(p.redPct)}`),
    `L ${px(n - 1)} ${PT + ch}`,
    `L ${px(0)} ${PT + ch}`, "Z",
  ].join(" ");

  const linePoints = pts.map((p, i) => `${px(i)},${py(p.redPct)}`).join(" ");
  const last = pts[n - 1];
  const dotX = px(n - 1), dotY = py(last.redPct);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" aria-label="Odds history">
        <rect x={PL} y={PT} width={cw} height={ch} fill="#0f172a" rx="4" />
        <path d={redD} fill="rgba(220,38,38,0.28)" />
        <path d={blueD} fill="rgba(37,99,235,0.28)" />

        {[25, 50, 75].map((pct) => (
          <g key={pct}>
            <line x1={PL} y1={py(pct)} x2={PL + cw} y2={py(pct)}
              stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
            <text x={PL - 4} y={py(pct) + 3} textAnchor="end" fontSize="9" fill="#475569">{pct}</text>
          </g>
        ))}
        <text x={PL - 3} y={PT + 5} textAnchor="end" fontSize="8" fill="#ef4444">R</text>
        <text x={PL - 3} y={PT + ch} textAnchor="end" fontSize="8" fill="#3b82f6">B</text>

        <polyline points={linePoints} fill="none" stroke="white" strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" />

        <circle cx={dotX} cy={dotY} r="4" fill="white" />
        {isLive && <circle cx={dotX} cy={dotY} r="7" fill="none" stroke="white" strokeWidth="1" opacity="0.4" />}

        {/* Right-edge current % labels */}
        <text x={PL + cw + 3} y={PT + 10} fontSize="8" fill="rgba(220,38,38,0.85)">
          {Math.round(last.redPct)}%
        </text>
        <text x={PL + cw + 3} y={PT + ch - 2} fontSize="8" fill="rgba(37,99,235,0.85)">
          {Math.round(100 - last.redPct)}%
        </text>

        <text x={PL + cw / 2} y={H - 6} textAnchor="middle" fontSize="9" fill="#475569">
          {history.length <= 1
            ? "No bets yet — starting at 50/50"
            : `${history.length - 1} bet${history.length - 1 === 1 ? "" : "s"} placed`}
        </text>
      </svg>

      {isLive && (
        <span className="absolute top-1 right-1 flex items-center gap-1 text-[10px] text-green-400 font-semibold">
          <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
          LIVE
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// match13 probability bar (shows prediction vs bet-based odds)
// ---------------------------------------------------------------------------
interface PredictionBarProps {
  m13Match: Match13Match;
}

function PredictionBar({ m13Match }: PredictionBarProps) {
  const rp = m13Match.pred.red_win_prob * 100;
  const bp = 100 - rp;
  const { label, flavor } = getMatchLabel(m13Match.pred.red_win_prob);

  const flavorColor: Record<string, string> = {
    coinflip:  "text-yellow-400 border-yellow-600/30 bg-yellow-900/10",
    slight:    "text-orange-400 border-orange-600/30 bg-orange-900/10",
    heavy:     "text-purple-400 border-purple-600/30 bg-purple-900/10",
    dominant:  "text-pink-400 border-pink-600/30 bg-pink-900/10",
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium text-red-400">
          match13: Red {rp.toFixed(1)}%
        </span>
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${flavorColor[flavor]}`}>
          {label}
        </Badge>
        <span className="font-medium text-blue-400">
          Blue {bp.toFixed(1)}%
        </span>
      </div>
      <div className="flex h-2.5 rounded overflow-hidden">
        <div className="bg-red-600/70 transition-all" style={{ width: `${rp}%` }} />
        <div className="bg-blue-600/70 transition-all" style={{ width: `${bp}%` }} />
      </div>
      {(m13Match.pred.red_score > 0 || m13Match.pred.blue_score > 0) && (
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Predicted: <span className="text-red-400">{Math.round(m13Match.pred.red_score)}</span></span>
          <span>vs</span>
          <span>Predicted: <span className="text-blue-400">{Math.round(m13Match.pred.blue_score)}</span></span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alliance team card
// ---------------------------------------------------------------------------
interface AllianceCardProps {
  alliance: "red" | "blue";
  teamKeys: string[];
  teamInfo: Map<number, TBATeamSimple>;
}

function AllianceCard({ alliance, teamKeys, teamInfo }: AllianceCardProps) {
  const isRed = alliance === "red";
  return (
    <Card className={`flex-1 ${isRed ? "bg-red-900/10 border-red-700/40" : "bg-blue-900/10 border-blue-700/40"} border p-6`}>
      <CardHeader className="pb-0 pt-3 px-3">
        <CardTitle className={`text-xs font-bold uppercase tracking-wider ${isRed ? "text-red-400" : "text-blue-400"}`}>
          {isRed ? "Red Alliance" : "Blue Alliance"}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 pb-4 px-3 space-y-3">
        {teamKeys.map((key) => {
          const num = parseInt(key.replace("frc", ""));
          const info = teamInfo.get(num);
          return (
            <div key={key} className="flex items-start gap-2">
              <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${isRed ? "bg-red-500" : "bg-blue-500"}`} />
              <div>
                <div className="font-bold text-sm leading-tight">{num}</div>
                {info && (
                  <div className="text-xs text-muted-foreground leading-tight">
                    {info.nickname}{info.city && `, ${info.city}`}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Result card (shown when match is complete)
// ---------------------------------------------------------------------------
interface ResultCardProps {
  m13Match: Match13Match;
  winner: "red" | "blue" | "tie";
  dbRedScore?: number | null;
  dbBlueScore?: number | null;
}

function ResultCard({ m13Match, winner, dbRedScore, dbBlueScore }: ResultCardProps) {
  const upset = wasUpset(winner, m13Match.pred.red_win_prob);
  // match13 only forecasts — it has no actual result, so `m13Match.result`
  // here is always just a copy of the TBA-sourced score/winner.
  const m13Red = m13Match.result.red_score;
  const m13Blue = m13Match.result.blue_score;
  // Guard the DB-cached fallback too (a stale/bad -1 — TBA's "not played"
  // sentinel — should never render), not just the match13-sourced value.
  const safeDbRed = dbRedScore != null && dbRedScore >= 0 ? dbRedScore : 0;
  const safeDbBlue = dbBlueScore != null && dbBlueScore >= 0 ? dbBlueScore : 0;
  const red = (m13Red != null && m13Red >= 0) ? m13Red : safeDbRed;
  const blue = (m13Blue != null && m13Blue >= 0) ? m13Blue : safeDbBlue;

  return (
    <Card className={`border-2 ${winner === "red" ? "border-red-600/50 bg-red-900/10"
        : winner === "blue" ? "border-blue-600/50 bg-blue-900/10"
        : "border-gray-600/50 bg-gray-900/10"}`}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
            Final Score
          </span>
          <div className="flex gap-2">
            {upset && (
              <Badge className="bg-yellow-600/20 text-yellow-300 border-yellow-600/30 text-xs">
                UPSET
              </Badge>
            )}
            <Badge className={winner === "red" ? "bg-red-600/20 text-red-300 border-red-600/30 text-xs"
                : winner === "blue" ? "bg-blue-600/20 text-blue-300 border-blue-600/30 text-xs"
                : "bg-gray-600/20 text-gray-300 text-xs"}>
              {winner.toUpperCase()} WINS
            </Badge>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-center">
            <div className={`text-4xl font-black ${winner === "red" ? "text-red-300" : "text-muted-foreground"}`}>
              {red}
            </div>
            <div className="text-xs text-red-400 font-medium">RED</div>
          </div>
          <div className="text-2xl font-bold text-muted-foreground">vs</div>
          <div className="text-center">
            <div className={`text-4xl font-black ${winner === "blue" ? "text-blue-300" : "text-muted-foreground"}`}>
              {blue}
            </div>
            <div className="text-xs text-blue-400 font-medium">BLUE</div>
          </div>
        </div>
        {(m13Match.pred.red_score > 0) && (
          <div className="text-center text-[10px] text-muted-foreground mt-2">
            Predicted: {Math.round(m13Match.pred.red_score)} – {Math.round(m13Match.pred.blue_score)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Amount picker
// ---------------------------------------------------------------------------
const PRESETS = [5, 10, 25, 50];

interface AmountPickerProps {
  value: number;
  onChange: (v: number) => void;
  max: number;
}

function AmountPicker({ value, onChange, max }: AmountPickerProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-9 w-9"
          onClick={() => onChange(Math.max(1, value - 5))}>–</Button>
        <Input type="number" min={1} max={max} value={value}
          onChange={(e) => { const n = parseInt(e.target.value) || 1; onChange(Math.min(max, Math.max(1, n))); }}
          className="h-9 text-center font-bold text-base w-24" />
        <Button variant="outline" size="icon" className="h-9 w-9"
          onClick={() => onChange(Math.min(max, value + 5))}>+</Button>
      </div>
      <div className="flex gap-2 flex-wrap">
        {PRESETS.map((p) => (
          <Button key={p} variant={value === p ? "default" : "outline"} size="sm"
            className="h-7 px-3 text-xs" onClick={() => onChange(Math.min(max, p))} disabled={p > max}>
            {p}
          </Button>
        ))}
        <Button variant={value === max ? "default" : "outline"} size="sm"
          className="h-7 px-3 text-xs" onClick={() => onChange(max)} disabled={max <= 0}>
          MAX ({max})
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
interface TBAMatchFull {
  match_number: number;
  comp_level: string;
  /** Unix timestamp (seconds) of the scheduled/predicted match start */
  predicted_time?: number | null;
  alliances: {
    red: { team_keys: string[]; score: number };
    blue: { team_keys: string[]; score: number };
  };
}

export default function MatchBetting() {
  const { match_id } = useParams<{ match_id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isOnline = useOnlineStatus();

  const [match, setMatch] = useState<Match | null>(null);
  const [event, setEvent] = useState<Event | null>(null);
  const [bets, setBets] = useState<Bet[]>([]);
  const [offlineOdds, setOfflineOdds] = useState<MatchOdds | null>(null);
  const [userBet, setUserBet] = useState<Bet | null>(null);
  const [points, setPoints] = useState<number>(0);
  const [eventPoints, setEventPoints] = useState<number>(0);
  const [betCurrency, setBetCurrency] = useState<BetCurrency>("points");

  const [m13Match, setM13Match] = useState<Match13Match | null>(null);
  const [tbaMatch, setTbaMatch] = useState<TBAMatchFull | null>(null);
  const [teamInfo, setTeamInfo] = useState<Map<number, TBATeamSimple>>(new Map());

  const [timeUntilMatch, setTimeUntilMatch] = useState<number | null>(null); // ms remaining

  const [loading, setLoading] = useState(true);
  const [autoSettling, setAutoSettling] = useState(false);
  const [selectedAlliance, setSelectedAlliance] = useState<"red" | "blue" | null>(null);
  const [betAmount, setBetAmount] = useState(10);
  const [placing, setPlacing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const settledRef = useRef(false); // prevent double auto-settle

  // ---------------------------------------------------------------------------
  // Data loading + auto-settle
  // ---------------------------------------------------------------------------
  const refreshPoints = useCallback(async () => {
    if (!user?.id) return;
    const gp = await getGameProfile(user.id);
    setPoints(gp?.points ?? 0);
    setEventPoints(gp?.event_points ?? 0);
  }, [user?.id]);

  const refreshUserBet = useCallback(async () => {
    if (!match_id || !user?.id) return;
    const ub = await getMatchUserBet(match_id, user.id, betCurrency);
    setUserBet(ub);
  }, [match_id, user?.id, betCurrency]);

  // Refetch this match's active bet whenever the selected currency changes.
  useEffect(() => {
    refreshUserBet();
  }, [refreshUserBet]);

  useEffect(() => {
    if (!match_id || !user?.id) return;
    let cancelled = false;

    async function load() {
      // Match row
      const { data: matchData } = await supabase
        .from("matches").select("*").eq("id", match_id).maybeSingle();
      if (!matchData || cancelled) { setLoading(false); return; }
      const m = matchData as Match;
      if (!cancelled) setMatch(m);

      // Event
      let eventCode: string | null = null;
      if (m.event_id) {
        const { data: ev } = await supabase
          .from("events").select("*").eq("id", m.event_id).maybeSingle();
        if (ev && !cancelled) {
          setEvent(ev as Event);
          eventCode = (ev as Event).event_code;
        }
      }

      // TBA — best-effort. Fetched up front since it's the only source of
      // actual scores/winner and of the scheduled match time (match13 has
      // neither — it only forecasts).
      let m13: Match13Match | null = null;
      if (eventCode) {
        const [tbaMatches, teams] = await Promise.all([
          getEventMatches(eventCode),
          getEventTeams(eventCode),
        ]);

        let found: TBAMatchFull | undefined;
        if (tbaMatches) {
          found = (tbaMatches as TBAMatchFull[]).find(
            (t) => t.comp_level === "qm" && t.match_number === m.match_number
          );
          if (found && !cancelled) setTbaMatch(found);
        }
        if (teams && !cancelled) {
          const map = new Map<number, TBATeamSimple>();
          teams.forEach((t) => map.set(t.team_number, t));
          setTeamInfo(map);
        }

        const tba_scores = await getMatchScores(eventCode, m.match_number);
        let results: Match13Match["result"] = { winner: null, red_score: null, blue_score: null };
        if (tba_scores !== null && tba_scores.length == 2 && tba_scores[0] > 0 && tba_scores[1] > 0) {
          results = {
            winner: tba_scores[0] > tba_scores[1] ? 'red' : 'blue', red_score: tba_scores[0], blue_score: tba_scores[1]
          };
          // Cache scores in DB to avoid repeated API calls
          if (isOnline && (m.red_score !== tba_scores[0] || m.blue_score !== tba_scores[1])) {
            void supabase.from("matches")
              .update({ red_score: tba_scores[0], blue_score: tba_scores[1] })
              .eq("id", match_id);
          }
        }

        // match13 sends no CORS headers and its key must stay off the client,
        // so predictions come from sync-match-results — which calls match13
        // directly, server-side — instead of a direct browser fetch.
        let redWinProb: number | null = null;
        if (isOnline) {
          try {
            const { data: session } = await supabase.auth.getSession();
            const { data } = await supabase.functions.invoke("sync-match-results", {
              headers: session.session
                ? { Authorization: `Bearer ${session.session.access_token}` }
                : undefined,
            });
            const predictions = (data?.predictions ?? []) as Array<{
              matchNumber: number; redWinProb: number;
            }>;
            redWinProb = predictions.find((p) => p.matchNumber === m.match_number)?.redWinProb ?? null;
          } catch { /* fall through to DB value below */ }
        }
        if (redWinProb == null) redWinProb = m.match13_red_win_prob;

        if (redWinProb != null) {
          m13 = {
            key: `${eventCode}_qm${m.match_number}`,
            event: eventCode,
            match_number: m.match_number,
            comp_level: "qm",
            pred: { winner: null, red_win_prob: redWinProb, red_score: 0, blue_score: 0 },
            result: results,
          };
          if (!cancelled) setM13Match(m13);
        }

        const predTimeSeconds = found?.predicted_time;
        if (!predTimeSeconds && !m.pred_time) {
          setLoading(true);
          return;
        }
        // Save pred_time to DB once TBA provides the scheduled match time
        if (predTimeSeconds && isOnline && !cancelled) {
          const predTimeIso = new Date(predTimeSeconds * 1000).toISOString();
          if (m.pred_time !== predTimeIso) {
            const { data: updatedMatch } = await supabase
              .from("matches")
              .update({ pred_time: predTimeIso })
              .eq("id", match_id)
              .select()
              .maybeSingle();
            if (updatedMatch && !cancelled) setMatch(updatedMatch as Match);
          }
        }
      }

      // Bets — offline uses cache. `bets` holds every currency; odds are
      // derived per-currency below via `currentOdds`.
      let loadedBets: Bet[] = [];
      if (isOnline) {
        loadedBets = await getMatchBets(match_id!);
        if (!cancelled) setBets(loadedBets);
      } else {
        const cached = getCachedMatchOdds(match_id!, "points");
        if (cached && !cancelled) setOfflineOdds(cached);
      }

      // User bet + balances — check both currencies so an existing event-currency
      // bet is detected even though the toggle defaults to "points".
      if (!cancelled) {
        const [ubPoints, ubEvent, gp] = await Promise.all([
          getMatchUserBet(match_id!, user!.id, "points"),
          getMatchUserBet(match_id!, user!.id, "event"),
          getGameProfile(user!.id),
        ]);
        if (ubPoints) {
          setUserBet(ubPoints);
          setBetCurrency("points");
        } else if (ubEvent) {
          setUserBet(ubEvent);
          setBetCurrency("event");
        } else {
          setUserBet(null);
        }
        setPoints(gp?.points ?? 0);
        setEventPoints(gp?.event_points ?? 0);
      }

      setLoading(false);

      // Auto-settle: fire when a winner is known (from match13/TBA or already stored
      // in the DB by sync-match-results) AND there are still pending bets to process.
      const knownWinner = (m.winning_alliance ?? m13?.result?.winner) as "red" | "blue" | "tie" | null | undefined;
      const hasPendingBets = loadedBets.some((b) => b.status === "pending");
      if (
        isOnline &&
        !settledRef.current &&
        knownWinner &&
        hasPendingBets
      ) {
        settledRef.current = true;
        if (!cancelled) setAutoSettling(true);
        const prob = m13?.pred?.red_win_prob ?? 0.5;
        await settleMatchBets(match_id!, knownWinner, prob);
        // Reload match + user data
        const { data: refreshed } = await supabase
          .from("matches").select("*").eq("id", match_id).maybeSingle();
        if (refreshed && !cancelled) setMatch(refreshed as Match);
        if (!cancelled) {
          setAutoSettling(false);
          await refreshUserBet();
          await refreshPoints();
        }
      }
    }

    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match_id, user?.id]);

  // ---------------------------------------------------------------------------
  // Realtime subscription
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!match_id || !isOnline) return;

    channelRef.current = supabase
      .channel(`bets-match-${match_id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "bets",
        filter: `match_id=eq.${match_id}`,
      }, (payload) => {
        const newBet = payload.new as Bet;
        setBets((prev) => [...prev, newBet]);
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "matches",
        filter: `id=eq.${match_id}`,
      }, (payload) => {
        setMatch((prev) => prev ? { ...prev, ...(payload.new as Partial<Match>) } : prev);
      })
      .subscribe();

    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
  }, [match_id, isOnline]);

  // ---------------------------------------------------------------------------
  // Countdown timer — ticks every second while pred_time is in the future
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const predTime = match?.pred_time;
    if (!predTime) { setTimeUntilMatch(null); return; }

    const predTs = new Date(predTime).getTime();
    const update = () => setTimeUntilMatch(predTs - Date.now());

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [match?.pred_time]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  async function handlePlaceBet() {
    if (!user?.id || !match_id || !selectedAlliance) return;
    setPlacing(true);
    setFeedback(null);

    const result = await placeBet(user.id, match_id, selectedAlliance, betAmount, betCurrency);

    if (result.success) {
      const unit = betCurrency === "event" ? "event points" : "pts";
      setFeedback({ ok: true, msg: `Bet placed! ${betAmount} ${unit} on ${selectedAlliance.toUpperCase()}.` });
      if (betCurrency === "event") setEventPoints((p) => p - betAmount);
      else setPoints((p) => p - betAmount);
      await refreshUserBet();
      setSelectedAlliance(null);
    } else {
      setFeedback({ ok: false, msg: result.error ?? "Failed to place bet." });
    }
    setPlacing(false);
  }

  async function handleCancelBet() {
    if (!user?.id || !userBet) return;
    setCancelling(true);
    setFeedback(null);
    const result = await cancelBet(userBet.id, user.id);
    if (result.success) {
      const unit = userBet.currency === "event" ? "event points" : "pts";
      setFeedback({ ok: true, msg: `Bet cancelled — ${userBet.amount} ${unit} refunded.` });
      if (userBet.currency === "event") setEventPoints((p) => p + userBet.amount);
      else setPoints((p) => p + userBet.amount);
      setUserBet(null);
    } else {
      setFeedback({ ok: false, msg: result.error ?? "Failed to cancel." });
    }
    setCancelling(false);
  }

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------
  const isSettled = !!match?.winning_alliance && userBet?.status !== "pending";

  // Points and event-points bets form separate pools, so odds are derived
  // per-currency from the raw bet list (online) or a cached snapshot (offline).
  const currentOdds: MatchOdds = useMemo(() => {
    if (isOnline) {
      return computeOddsFromBets(bets.filter((b) => (b.currency ?? "points") === betCurrency));
    }
    return offlineOdds ?? { redPct: 50, bluePct: 50, totalPool: 0, betCount: 0, history: [], redTotal: 0, blueTotal: 0 };
  }, [bets, betCurrency, isOnline, offlineOdds]);

  useEffect(() => {
    if (isOnline && match_id) cacheMatchOdds(match_id, currentOdds, betCurrency);
  }, [currentOdds, isOnline, betCurrency, match_id]);

  const currentBalance = betCurrency === "event" ? eventPoints : points;

  // Event points can only be bet on the active event's own matches.
  const eventBettingAvailable = !!event && event.is_active && isEventWithinWindow(event);
  const m13RedProb = m13Match?.pred.red_win_prob;

  // Blended display odds: combines match13 prediction with bet-pool distribution.
  // When few bets are placed, match13 dominates; as pool grows, bets take over.
  const blendedRedPct = m13RedProb !== undefined
    ? blendOddsRedPct(currentOdds.redPct, m13RedProb, currentOdds.totalPool)
    : currentOdds.redPct;
  const blendedBluePct = 100 - blendedRedPct;

  const blendedHistory = m13RedProb !== undefined
    ? (currentOdds.history ?? []).map((pt) => {
        const pool = pt.redTotal + pt.blueTotal;
        const blended = blendOddsRedPct(pt.redPct, m13RedProb, pool);
        return { ...pt, redPct: blended, bluePct: 100 - blended };
      })
    : (currentOdds.history ?? []);

  // Time-decay derived values
  const predTime = match?.pred_time ?? null;
  const bettingClosed = !!predTime && Date.now() >= new Date(predTime).getTime();
  const currentDecayFactor = predTime && !bettingClosed
    ? computeTimeDecayFactor(new Date().toISOString(), predTime)
    : bettingClosed ? 0 : 1.0;
  const inDecayWindow = currentDecayFactor < 1.0 && !bettingClosed;

  const estPayout = selectedAlliance
    ? estimatePayout(betAmount, selectedAlliance, currentOdds as MatchOdds, m13RedProb, predTime)
    : null;

  // Winning alliance is complete if match13 result says so OR match row says so
  const effectiveWinner = (match?.winning_alliance ?? m13Match?.result?.winner) as
    | "red" | "blue" | "tie" | null | undefined;
  const matchComplete = !!effectiveWinner;

  // Is the current user's bet an upset win?
  const betWasUpset =
    userBet?.status === "won" &&
    m13RedProb !== undefined &&
    wasUpset(userBet.alliance as "red" | "blue", m13RedProb);

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  function formatTimeRemaining(ms: number): string {
    if (ms <= 0) return "Match started";
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  /** Returns the predicted start time formatted in the user's local timezone. */
  function formatLocalMatchTime(isoString: string): string {
    return new Date(isoString).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center flex-col gap-4">
        <p className="text-muted-foreground">Match not found.</p>
        <Button onClick={() => navigate("/dashboard?page=betting")}>Back to markets</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background my-5">
      <main className="container mx-auto p-4 max-w-2xl space-y-4 pb-10">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard?page=betting")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">{match.name}</h1>
              {event && <p className="text-xs text-muted-foreground">{event.name}</p>}
              {predTime && (
                <p className="text-xs text-muted-foreground">
                  {bettingClosed ? "Started" : "Starts"} {formatLocalMatchTime(predTime)}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Time remaining badge — always shown when pred_time is known */}
            {predTime && (
              bettingClosed ? (
                <Badge variant="outline" className="text-red-400 border-red-600/30 gap-1 text-xs">
                  <Clock className="h-3 w-3" /> BETTING CLOSED
                </Badge>
              ) : timeUntilMatch !== null ? (
                <Badge
                  variant="outline"
                  className={`gap-1 text-xs ${
                    timeUntilMatch < 5 * 60 * 1000
                      ? "text-red-400 border-red-600/30"
                      : timeUntilMatch < FULL_VALUE_MS
                      ? "text-yellow-400 border-yellow-600/30"
                      : "text-green-400 border-green-600/30"
                  }`}
                >
                  <Clock className="h-3 w-3" /> {formatTimeRemaining(timeUntilMatch)}
                </Badge>
              ) : null
            )}
            {!isOnline && (
              <Badge variant="outline" className="text-yellow-400 border-yellow-600/30 gap-1 text-xs">
                <WifiOff className="h-3 w-3" /> Cached
              </Badge>
            )}
            {autoSettling && (
              <Badge variant="outline" className="text-green-400 border-green-600/30 gap-1 text-xs">
                <Loader2 className="h-3 w-3 animate-spin" /> Settling…
              </Badge>
            )}
            {isSettled ? (
              <Badge variant="outline" className={`text-xs ${
                match.winning_alliance === "red" ? "text-red-400 border-red-600/30"
                : match.winning_alliance === "blue" ? "text-blue-400 border-blue-600/30"
                : "text-gray-400"}`}>
                {match.winning_alliance?.toUpperCase()} WINS
              </Badge>
            ) : matchComplete ? (
              <Badge variant="outline" className="text-orange-400 border-orange-600/30 text-xs">
                RESULT IN
              </Badge>
            ) : (
              <Badge variant="outline" className="text-green-400 border-green-600/30 text-xs">
                OPEN
              </Badge>
            )}
            <div className="flex items-center gap-1 bg-muted rounded-full px-2.5 py-1">
              <Coins className="h-3.5 w-3.5 text-yellow-400" />
              <span className="font-bold text-sm">{points}</span>
            </div>
            {eventBettingAvailable && (
              <div className="flex items-center gap-1 rounded-full bg-sky-500/10 border border-sky-500/40 px-2.5 py-1">
                <img src={getEventCurrencyLogo(event?.event_code)} alt="Event currency" className="h-3.5 w-3.5" />
                <span className="font-bold text-sm text-sky-300">{eventPoints}</span>
              </div>
            )}
          </div>
        </div>

        {!tbaMatch && (
          <div className="p-3 bg-yellow-900/20 border border-yellow-700/40 rounded-lg">
            <p className="text-sm text-yellow-400">Match data is loading... (percentages only represent betting, not predicted outcomes)</p>
          </div>
        )}

        {/* Result card (if match is complete) */}
        {m13Match && effectiveWinner && effectiveWinner !== "tie" && (
          <ResultCard m13Match={m13Match} winner={effectiveWinner} dbRedScore={match?.red_score} dbBlueScore={match?.blue_score} />
        )}

        {/* match13 prediction bar */}
        {m13Match && !matchComplete && (
          <Card>
            <CardContent className="pt-3 pb-3">
              <PredictionBar m13Match={m13Match} />
            </CardContent>
          </Card>
        )}

        {/* Combined odds display */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-4 text-center">
            <div className="text-[10px] text-red-400 font-semibold uppercase tracking-wider mb-1">
              Red Alliance
            </div>
            <div className="text-4xl font-black text-red-300">
              {Math.round(blendedRedPct)}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {currentOdds.redTotal} {betCurrency === "event" ? "evt" : "pts"} bet
            </div>
          </div>
          <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-4 text-center">
            <div className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider mb-1">
              Blue Alliance
            </div>
            <div className="text-4xl font-black text-blue-300">
              {Math.round(blendedBluePct)}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {currentOdds.blueTotal} {betCurrency === "event" ? "evt" : "pts"} bet
            </div>
          </div>
        </div>

        {/* Odds chart */}
        <Card className="overflow-hidden p-0">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground font-medium">
                Combined win probability (bets + match13)
              </span>
              <span className="text-xs text-muted-foreground">
                Pool: {currentOdds.totalPool} {betCurrency === "event" ? "evt" : "pts"}
              </span>
            </div>
            <OddsChart history={blendedHistory} isLive={!matchComplete && isOnline} />
          </CardContent>
        </Card>

        {/* Teams */}
        {tbaMatch && (
          <div className="flex gap-3">
            <AllianceCard alliance="red" teamKeys={tbaMatch.alliances.red.team_keys} teamInfo={teamInfo} />
            <AllianceCard alliance="blue" teamKeys={tbaMatch.alliances.blue.team_keys} teamInfo={teamInfo} />
          </div>
        )}

        {/* Feedback banner */}
        {feedback && (
          <div className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
            feedback.ok ? "bg-green-900/30 border border-green-700/40 text-green-300"
              : "bg-red-900/30 border border-red-700/40 text-red-300"}`}>
            {feedback.ok
              ? <CheckCircle2 className="h-4 w-4 shrink-0" />
              : <XCircle className="h-4 w-4 shrink-0" />}
            {feedback.msg}
          </div>
        )}

        {/* User bet result (settled) */}
        {userBet && isSettled && (
          <Card className={userBet.status === "won"
            ? "border-green-700/30 bg-green-900/10"
            : "border-red-700/30 bg-red-900/10"}>
            <CardContent className="pt-4 pb-4 flex items-center justify-between">
              <div>
                <div className={`font-semibold text-base ${userBet.status === "won" ? "text-green-300" : "text-red-300"}`}>
                  {userBet.status === "won"
                    ? betWasUpset ? "Upset winner! You called it!" : "You won!"
                    : "Better luck next time"}
                </div>
                <div className="text-sm text-muted-foreground mt-0.5">
                  Bet {userBet.amount} {userBet.currency === "event" ? "evt" : "pts"} on {userBet.alliance.toUpperCase()}
                </div>
                {m13RedProb !== undefined && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {userBet.alliance === "red"
                      ? `${Math.round(m13RedProb * 100)}% predicted win chance`
                      : `${Math.round((1 - m13RedProb) * 100)}% predicted win chance`}
                  </div>
                )}
              </div>
              <div className="text-right">
                {userBet.status === "won" && userBet.payout !== null ? (
                  <>
                    <div className="text-2xl font-black text-green-400">
                      +{userBet.payout - userBet.amount}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Payout: {userBet.payout} {userBet.currency === "event" ? "evt" : "pts"}
                    </div>
                  </>
                ) : (
                  <div className="text-2xl font-black text-red-400">−{userBet.amount}</div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* User bet (pending) */}
        {userBet && !isSettled && !matchComplete && (
          <Card className="border-yellow-700/30 bg-yellow-900/10">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-yellow-300">Your active bet</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                      userBet.alliance === "red" ? "bg-red-600/20 text-red-400" : "bg-blue-600/20 text-blue-400"}`}>
                      {userBet.alliance.toUpperCase()}
                    </span>
                    <span className="text-sm">
                      {userBet.amount} {userBet.currency === "event" ? "evt" : "pts"} wagered
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Est. payout:{" "}
                    {estimatePayout(userBet.amount, userBet.alliance as "red" | "blue",
                      currentOdds as MatchOdds, m13RedProb)} {userBet.currency === "event" ? "evt" : "pts"} if {userBet.alliance} wins
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-yellow-700/40 text-yellow-300 hover:bg-yellow-900/20 shrink-0"
                  disabled={cancelling || !isOnline}
                  onClick={handleCancelBet}
                >
                  {cancelling && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Match already played — betting locked */}
        {matchComplete && !isSettled && !userBet && (
          <Card className="border-orange-700/30 bg-orange-900/10">
            <CardContent className="pt-4 pb-4 flex items-center gap-3 text-sm text-orange-300">
              <Zap className="h-4 w-4 shrink-0" />
              This match has already been played. Bets are locked and being settled…
            </CardContent>
          </Card>
        )}

        {/* Betting closed — pred_time has passed */}
        {!matchComplete && !isSettled && !userBet && bettingClosed && (
          <Card className="border-red-700/30 bg-red-900/10">
            <CardContent className="pt-4 pb-4 flex items-center gap-3 text-sm text-red-300">
              <Clock className="h-4 w-4 shrink-0" />
              Betting is closed — this match has started or is about to. No new bets can be placed.
            </CardContent>
          </Card>
        )}

        {/* Bet form — only when open, pred_time not passed, and no existing bet */}
        {!matchComplete && !isSettled && !userBet && !bettingClosed && isOnline && (
          <Card>
            <CardHeader className="pb-0 pt-0">
              <CardTitle className="text-base">Place a Bet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Currency toggle — event points only offered on the active event's own matches */}
              {eventBettingAvailable && (
                <div className="flex items-center gap-1 rounded-lg border p-1">
                  <button
                    onClick={() => setBetCurrency("points")}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      betCurrency === "points"
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Points
                  </button>
                  <button
                    onClick={() => setBetCurrency("event")}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      betCurrency === "event"
                        ? "bg-sky-500/20 text-sky-300"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <img src={getEventCurrencyLogo(event?.event_code)} alt="" className="h-3.5 w-3.5" />
                    {event?.name ?? "Event"} Points
                  </button>
                </div>
              )}

              {/* Time decay warning */}
              {inDecayWindow && timeUntilMatch !== null && (
                <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs bg-yellow-900/20 border border-yellow-700/30 text-yellow-300">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    Betting closes in <span className="font-bold">{formatTimeRemaining(timeUntilMatch)}</span>.
                  </span>
                </div>
              )}

              {/* Alliance selector */}
              <div className="grid grid-cols-2 gap-3">
                {(["red", "blue"] as const).map((side) => {
                  const pct = side === "red" ? currentOdds.redPct : currentOdds.bluePct;
                  const m13Pct = m13RedProb !== undefined
                    ? side === "red" ? m13RedProb * 100 : (1 - m13RedProb) * 100
                    : null;
                  const isSelected = selectedAlliance === side;
                  return (
                    <button key={side} onClick={() => setSelectedAlliance(side)}
                      className={`rounded-xl border-2 p-4 text-center transition-all ${isSelected
                        ? side === "red" ? "border-red-500 bg-red-900/30 scale-[1.02]" : "border-blue-500 bg-blue-900/30 scale-[1.02]"
                        : side === "red" ? "border-red-700/30 bg-red-900/10 hover:border-red-600/50" : "border-blue-700/30 bg-blue-900/10 hover:border-blue-600/50"}`}>
                      <div className={`text-lg font-black ${side === "red" ? "text-red-300" : "text-blue-300"}`}>
                        {side.toUpperCase()}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Bet odds: {Math.round(pct)}%
                      </div>
                      {m13Pct !== null && (
                        <div className={`text-[10px] mt-0.5 ${
                          side === "red" ? "text-red-400/70" : "text-blue-400/70"}`}>
                          match13: {m13Pct.toFixed(1)}%
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-2 block">
                  Amount (you have {currentBalance} {betCurrency === "event" ? "event pts" : "pts"})
                </label>
                <AmountPicker value={betAmount} onChange={setBetAmount} max={currentBalance} />
              </div>

              {selectedAlliance && estPayout !== null && (
                <div className="bg-muted/30 rounded-lg px-3 py-2 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Est. payout if {selectedAlliance} wins</span>
                    <span className="font-bold">{estPayout} {betCurrency === "event" ? "evt" : "pts"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Est. profit</span>
                    <span className={`font-bold ${estPayout - betAmount >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {estPayout - betAmount >= 0 ? "+" : ""}{estPayout - betAmount} {betCurrency === "event" ? "evt" : "pts"}
                    </span>
                  </div>
                  {m13RedProb !== undefined && (
                    <p className="text-[10px] text-muted-foreground">
                      Adjusted for match13 prediction. Upsets pay more than favorites.
                    </p>
                  )}
                </div>
              )}

              <Button className="w-full" size="lg"
                disabled={!selectedAlliance || betAmount <= 0 || betAmount > currentBalance || placing}
                onClick={handlePlaceBet}>
                {placing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {selectedAlliance
                  ? `Bet ${betAmount} ${betCurrency === "event" ? "evt" : "pts"} on ${selectedAlliance.toUpperCase()}`
                  : "Select an alliance"}
              </Button>
            </CardContent>
          </Card>
        )}

        {!matchComplete && !isSettled && !userBet && !bettingClosed && !isOnline && (
          <Card className="border-yellow-700/30">
            <CardContent className="pt-4 pb-4 flex items-center gap-3 text-sm text-muted-foreground">
              <WifiOff className="h-4 w-4 text-yellow-400 shrink-0" />
              You need an internet connection to place bets.
            </CardContent>
          </Card>
        )}

      </main>
    </div>
  );
}
