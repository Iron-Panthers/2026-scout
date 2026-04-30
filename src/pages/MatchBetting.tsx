import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Coins, WifiOff, CheckCircle2, XCircle, Loader2, Zap,
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
} from "@/lib/betting";
import {
  getStatboticsMatch, getCachedStatboticsMatch, getMatchLabel, wasUpset,
} from "@/lib/statbotics";
import { getEventMatches, getEventTeams } from "@/lib/blueAlliance";
import type { Match, Event } from "@/types";
import type { Bet, MatchOdds, OddsHistoryPoint } from "@/types/betting";
import type { StatboticsMatch } from "@/lib/statbotics";
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
  const py = (pct: number) => PT + (1 - pct / 100) * ch;

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
// Statbotics probability bar (shows prediction vs bet-based odds)
// ---------------------------------------------------------------------------
interface PredictionBarProps {
  sbMatch: StatboticsMatch;
}

function PredictionBar({ sbMatch }: PredictionBarProps) {
  const rp = sbMatch.pred.red_win_prob * 100;
  const bp = 100 - rp;
  const { label, flavor } = getMatchLabel(sbMatch.pred.red_win_prob);

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
          Statbotics: Red {rp.toFixed(1)}%
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
      {(sbMatch.pred.red_score > 0 || sbMatch.pred.blue_score > 0) && (
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Predicted: <span className="text-red-400">{Math.round(sbMatch.pred.red_score)}</span></span>
          <span>vs</span>
          <span>Predicted: <span className="text-blue-400">{Math.round(sbMatch.pred.blue_score)}</span></span>
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
  sbMatch: StatboticsMatch;
  winner: "red" | "blue" | "tie";
}

function ResultCard({ sbMatch, winner }: ResultCardProps) {
  const upset = wasUpset(winner, sbMatch.pred.red_win_prob);
  const red = sbMatch.result.red_score ?? 0;
  const blue = sbMatch.result.blue_score ?? 0;

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
                ⚡ UPSET
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
        {(sbMatch.pred.red_score > 0) && (
          <div className="text-center text-[10px] text-muted-foreground mt-2">
            Predicted: {Math.round(sbMatch.pred.red_score)} – {Math.round(sbMatch.pred.blue_score)}
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
  alliances: {
    red: { team_keys: string[]; score: number };
    blue: { team_keys: string[]; score: number };
  };
}

export default function MatchBetting() {
  const { match_id } = useParams<{ match_id: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const isOnline = useOnlineStatus();

  const [match, setMatch] = useState<Match | null>(null);
  const [event, setEvent] = useState<Event | null>(null);
  const [bets, setBets] = useState<Bet[]>([]);
  const [odds, setOdds] = useState<MatchOdds | null>(null);
  const [userBet, setUserBet] = useState<Bet | null>(null);
  const [points, setPoints] = useState<number>(0);

  const [sbMatch, setSbMatch] = useState<StatboticsMatch | null>(null);
  const [tbaMatch, setTbaMatch] = useState<TBAMatchFull | null>(null);
  const [teamInfo, setTeamInfo] = useState<Map<number, TBATeamSimple>>(new Map());

  const [loading, setLoading] = useState(true);
  const [autoSettling, setAutoSettling] = useState(false);
  const [selectedAlliance, setSelectedAlliance] = useState<"red" | "blue" | null>(null);
  const [betAmount, setBetAmount] = useState(10);
  const [placing, setPlacing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [settling, setSettling] = useState(false);
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
  }, [user?.id]);

  const refreshUserBet = useCallback(async () => {
    if (!match_id || !user?.id) return;
    const ub = await getMatchUserBet(match_id, user.id);
    setUserBet(ub);
  }, [match_id, user?.id]);

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

      // Statbotics — try API first, then localStorage cache, then DB-stored value
      let sb: StatboticsMatch | null = null;
      if (eventCode) {
        sb = isOnline
          ? await getStatboticsMatch(eventCode, m.match_number)
          : getCachedStatboticsMatch(eventCode, m.match_number);
        console.log(sb)

        // Fall back to DB-stored prediction when API and cache both miss
        if (!sb && m.statbotics_red_win_prob != null) {
          sb = {
            key: `${eventCode}_qm${m.match_number}`,
            event: eventCode,
            match_number: m.match_number,
            comp_level: "qm",
            pred: {
              winner: null,
              red_win_prob: m.statbotics_red_win_prob,
              red_score: 0,
              blue_score: 0,
            },
            result: { winner: null, red_score: null, blue_score: null, red_auto_points: null, blue_auto_points: null },
          };
        }

        console.log(sb)
        if (sb && !cancelled) setSbMatch(sb);
      }

      // TBA — best-effort
      if (eventCode) {
        const [tbaMatches, teams] = await Promise.all([
          getEventMatches(eventCode),
          getEventTeams(eventCode),
        ]);
        if (!cancelled) {
          if (tbaMatches) {
            const found = (tbaMatches as TBAMatchFull[]).find(
              (t) => t.comp_level === "qm" && t.match_number === m.match_number
            );
            if (found) setTbaMatch(found);
          }
          if (teams) {
            const map = new Map<number, TBATeamSimple>();
            teams.forEach((t) => map.set(t.team_number, t));
            setTeamInfo(map);
          }
        }
      }

      // Bets — offline uses cache
      if (isOnline) {
        const fresh = await getMatchBets(match_id!);
        if (!cancelled) {
          setBets(fresh);
          const computed = computeOddsFromBets(fresh);
          setOdds(computed);
          cacheMatchOdds(match_id!, computed);
        }
      } else {
        const cached = getCachedMatchOdds(match_id!);
        if (cached && !cancelled) setOdds(cached);
      }

      // User bet + points
      if (!cancelled) {
        const [ub, gp] = await Promise.all([
          getMatchUserBet(match_id!, user!.id),
          getGameProfile(user!.id),
        ]);
        console.log(ub, gp)
        setUserBet(ub);
        setPoints(gp?.points ?? 0);
      }

      setLoading(false);

      // Auto-settle if Statbotics has a result and match isn't settled yet
      if (
        isOnline &&
        !settledRef.current &&
        sb?.result?.winner &&
        !m.winning_alliance
      ) {
        settledRef.current = true;
        if (!cancelled) setAutoSettling(true);
        const prob = sb.pred.red_win_prob;
        await settleMatchBets(match_id!, sb.result.winner, prob);
        // Reload match + user data
        const { data: refreshed } = await supabase
          .from("matches").select("*").eq("id", match_id).maybeSingle();
        if (refreshed && !cancelled) setMatch(refreshed as Match);
        if (!cancelled) {
          setAutoSettling(false);
          await refreshUserBet();
          await refreshPoints();
        }
        console.log('match settled', data);
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
        setBets((prev) => {
          const updated = [...prev, newBet];
          const computed = computeOddsFromBets(updated);
          setOdds(computed);
          cacheMatchOdds(match_id, computed);
          return updated;
        });
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
  // Actions
  // ---------------------------------------------------------------------------
  async function handlePlaceBet() {
    if (!user?.id || !match_id || !selectedAlliance) return;
    setPlacing(true);
    setFeedback(null);

    const result = await placeBet(user.id, match_id, selectedAlliance, betAmount);

    if (result.success) {
      setFeedback({ ok: true, msg: `Bet placed! ${betAmount} pts on ${selectedAlliance.toUpperCase()}.` });
      setPoints((p) => p - betAmount);
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
      setFeedback({ ok: true, msg: `Bet cancelled — ${userBet.amount} pts refunded.` });
      setPoints((p) => p + userBet.amount);
      setUserBet(null);
    } else {
      setFeedback({ ok: false, msg: result.error ?? "Failed to cancel." });
    }
    setCancelling(false);
  }

  async function handleSettle(winner: "red" | "blue" | "tie") {
    if (!match_id) return;
    setSettling(true);
    const prob = sbMatch?.pred.red_win_prob ?? 0.5;
    const result = await settleMatchBets(match_id, winner, prob);
    if (result.success) {
      setMatch((prev) => prev ? { ...prev, winning_alliance: winner } : prev);
      setFeedback({ ok: true, msg: `Match settled — ${winner.toUpperCase()} wins!` });
      await refreshPoints();
      await refreshUserBet();
    } else {
      setFeedback({ ok: false, msg: result.error ?? "Settlement failed." });
    }
    setSettling(false);
  }

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------
  const isSettled = !!match?.winning_alliance;
  const isManager = profile?.is_manager ?? false;
  const currentOdds = odds ?? { redPct: 50, bluePct: 50, totalPool: 0, betCount: 0, history: [], redTotal: 0, blueTotal: 0 };
  const sbRedProb = sbMatch?.pred.red_win_prob;

  // Blended display odds: combines Statbotics prediction with bet-pool distribution.
  // When few bets are placed, Statbotics dominates; as pool grows, bets take over.
  const blendedRedPct = sbRedProb !== undefined
    ? blendOddsRedPct(currentOdds.redPct, sbRedProb, currentOdds.totalPool)
    : currentOdds.redPct;
  const blendedBluePct = 100 - blendedRedPct;

  const blendedHistory = sbRedProb !== undefined
    ? (currentOdds.history ?? []).map((pt) => {
        const pool = pt.redTotal + pt.blueTotal;
        const blended = blendOddsRedPct(pt.redPct, sbRedProb, pool);
        return { ...pt, redPct: blended, bluePct: 100 - blended };
      })
    : (currentOdds.history ?? []);

  const estPayout = selectedAlliance
    ? estimatePayout(betAmount, selectedAlliance, currentOdds as MatchOdds, sbRedProb)
    : null;

  // Winning alliance is complete if Statbotics result says so OR match row says so
  const effectiveWinner = (match?.winning_alliance ?? sbMatch?.result?.winner) as
    | "red" | "blue" | "tie" | null | undefined;
  const matchComplete = !!effectiveWinner;

  // Is the current user's bet an upset win?
  const betWasUpset =
    userBet?.status === "won" &&
    sbRedProb !== undefined &&
    wasUpset(userBet.alliance as "red" | "blue", sbRedProb);

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
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
        <Button onClick={() => navigate("/betting")}>Back to markets</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background my-5">
      <main className="container mx-auto p-4 max-w-2xl space-y-4 pb-10">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/betting")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">{match.name}</h1>
              {event && <p className="text-xs text-muted-foreground">{event.name}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
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
          </div>
        </div>

        {/* Result card (if match is complete) */}
        {sbMatch && effectiveWinner && effectiveWinner !== "tie" && (
          <ResultCard sbMatch={sbMatch} winner={effectiveWinner} />
        )}

        {/* Statbotics prediction bar */}
        {sbMatch && !matchComplete && (
          <Card>
            <CardContent className="pt-3 pb-3">
              <PredictionBar sbMatch={sbMatch} />
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
              {currentOdds.redTotal} pts bet
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
              {currentOdds.blueTotal} pts bet
            </div>
          </div>
        </div>

        {/* Odds chart */}
        <Card className="overflow-hidden p-0">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground font-medium">
                Combined win probability (bets + Statbotics)
              </span>
              <span className="text-xs text-muted-foreground">
                Pool: {currentOdds.totalPool} pts
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
                    ? betWasUpset ? "🎉 Upset winner! You called it!" : "🎉 You won!"
                    : "Better luck next time"}
                </div>
                <div className="text-sm text-muted-foreground mt-0.5">
                  Bet {userBet.amount} pts on {userBet.alliance.toUpperCase()}
                </div>
                {sbRedProb !== undefined && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {userBet.alliance === "red"
                      ? `${Math.round(sbRedProb * 100)}% predicted win chance`
                      : `${Math.round((1 - sbRedProb) * 100)}% predicted win chance`}
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
                      Payout: {userBet.payout} pts
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
                    <span className="text-sm">{userBet.amount} pts wagered</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Est. payout:{" "}
                    {estimatePayout(userBet.amount, userBet.alliance as "red" | "blue",
                      currentOdds as MatchOdds, sbRedProb)} pts if {userBet.alliance} wins
                  </div>
                </div>
                {/* <Button variant="ghost" size="sm"
                  className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                  onClick={handleCancelBet} disabled={cancelling || !isOnline}>
                  {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel"}
                </Button> */}
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

        {/* Bet form — only when open and no existing bet */}
        {!matchComplete && !isSettled && !userBet && isOnline && (
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-base">Place a Bet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Alliance selector */}
              <div className="grid grid-cols-2 gap-3">
                {(["red", "blue"] as const).map((side) => {
                  const pct = side === "red" ? currentOdds.redPct : currentOdds.bluePct;
                  const sbPct = sbRedProb !== undefined
                    ? side === "red" ? sbRedProb * 100 : (1 - sbRedProb) * 100
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
                      {sbPct !== null && (
                        <div className={`text-[10px] mt-0.5 ${
                          side === "red" ? "text-red-400/70" : "text-blue-400/70"}`}>
                          Statbotics: {sbPct.toFixed(1)}%
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-2 block">
                  Amount (you have {points} pts)
                </label>
                <AmountPicker value={betAmount} onChange={setBetAmount} max={points} />
              </div>

              {selectedAlliance && estPayout !== null && (
                <div className="bg-muted/30 rounded-lg px-3 py-2 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Est. payout if {selectedAlliance} wins</span>
                    <span className="font-bold">{estPayout} pts</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Est. profit</span>
                    <span className={`font-bold ${estPayout - betAmount >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {estPayout - betAmount >= 0 ? "+" : ""}{estPayout - betAmount} pts
                    </span>
                  </div>
                  {sbRedProb !== undefined && (
                    <p className="text-[10px] text-muted-foreground">
                      Adjusted for Statbotics prediction. Upsets pay more than favorites.
                    </p>
                  )}
                </div>
              )}

              <Button className="w-full" size="lg"
                disabled={!selectedAlliance || betAmount <= 0 || betAmount > points || placing}
                onClick={handlePlaceBet}>
                {placing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {selectedAlliance
                  ? `Bet ${betAmount} pts on ${selectedAlliance.toUpperCase()}`
                  : "Select an alliance"}
              </Button>
            </CardContent>
          </Card>
        )}

        {!matchComplete && !isSettled && !userBet && !isOnline && (
          <Card className="border-yellow-700/30">
            <CardContent className="pt-4 pb-4 flex items-center gap-3 text-sm text-muted-foreground">
              <WifiOff className="h-4 w-4 text-yellow-400 shrink-0" />
              You need an internet connection to place bets.
            </CardContent>
          </Card>
        )}

        {/* Manager settle */}
        {isManager && !isSettled && !matchComplete && (
          <Card className="border-purple-700/30 bg-purple-900/10">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm text-purple-300">Manager: Settle Bets</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 pb-4">
              <p className="text-xs text-muted-foreground mb-3">
                Payouts are probability-adjusted via Statbotics ({sbRedProb !== undefined
                  ? `red predicted at ${(sbRedProb * 100).toFixed(1)}%`
                  : "no prediction data — using 50/50"}).
                Upsets pay more than favorites.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 border-red-700/40 text-red-400 hover:bg-red-900/20"
                  onClick={() => handleSettle("red")} disabled={settling || !isOnline}>
                  {settling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Red Wins"}
                </Button>
                <Button variant="outline" size="sm" className="flex-1 border-blue-700/40 text-blue-400 hover:bg-blue-900/20"
                  onClick={() => handleSettle("blue")} disabled={settling || !isOnline}>
                  {settling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Blue Wins"}
                </Button>
                <Button variant="outline" size="sm" className="border-gray-700/40 text-muted-foreground hover:bg-muted/20"
                  onClick={() => handleSettle("tie")} disabled={settling || !isOnline}>
                  Tie
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
