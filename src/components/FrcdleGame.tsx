import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Clock3, Dices, LoaderCircle, RotateCw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { CURRENT_YEAR, getTeamInfo, getTeamLogo } from "@/lib/blueAlliance";
import { supabase } from "@/lib/supabase";

interface DailySpin {
  spin_day: string;
  spin_number: string;
  created_at: string;
}

interface FoundTeam {
  teamNumber: number;
  name: string;
  logo: string | null;
  xp: number | null;
}

type Rarity = "Common" | "Uncommon" | "Rare" | "Ultra Rare" | "Anomaly" | "Mythic";

const RARITY_STYLES: Record<Rarity, string> = {
  Common: "border-slate-500/40 bg-slate-500/10 text-slate-200",
  Uncommon: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  Rare: "border-sky-500/40 bg-sky-500/10 text-sky-200",
  "Ultra Rare": "border-violet-500/40 bg-violet-500/10 text-violet-200",
  Anomaly: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200",
  Mythic: "border-amber-400/60 bg-amber-400/10 text-amber-200",
};

function localSpinDay(date = new Date(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"): string {
  const local = zonedParts(date, timeZone);
  const spinDate = new Date(Date.UTC(local.year, local.month - 1, local.day - (local.hour < 9 ? 1 : 0)));
  const year = spinDate.getUTCFullYear();
  const month = String(spinDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(spinDate.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function zonedParts(date: Date, timeZone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
}

function nextResetAt(date: Date, timeZone: string): Date {
  const local = zonedParts(date, timeZone);
  const beforeNine = local.hour < 9;
  const targetLocalAsUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day + (beforeNine ? 0 : 1),
    9,
    0,
    0
  );
  let target = new Date(targetLocalAsUtc);
  for (let attempt = 0; attempt < 2; attempt++) {
    const atTarget = zonedParts(target, timeZone);
    const representedAsUtc = Date.UTC(
      atTarget.year,
      atTarget.month - 1,
      atTarget.day,
      atTarget.hour,
      atTarget.minute,
      atTarget.second
    );
    target = new Date(targetLocalAsUtc - (representedAsUtc - target.getTime()));
  }
  return target;
}

function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

function rarityPercent(xpTotal: number): number {
  const bounded = Math.max(0, Math.min(600, xpTotal));
  const lower = normalCdf(-3);
  const upper = normalCdf(3);
  const percentile = (normalCdf((bounded - 300) / 100) - lower) / (upper - lower);
  return Math.max(0, Math.min(100, percentile * 100));
}

function rarityFor(percent: number): Rarity {
  if (percent < 50) return "Common";
  if (percent < 75) return "Uncommon";
  if (percent < 90) return "Rare";
  if (percent < 95) return "Ultra Rare";
  if (percent < 99) return "Anomaly";
  return "Mythic";
}

function formatCountdown(ms: number): string {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function DigitReel({ value, rolling }: { value: string; rolling: boolean }) {
  const [rollingValue, setRollingValue] = useState("0");

  useEffect(() => {
    if (!rolling) return;
    const interval = window.setInterval(() => {
      setRollingValue(String(Math.floor(Math.random() * 10)));
    }, 55);
    return () => window.clearInterval(interval);
  }, [rolling]);

  return (
    <div className={`flex aspect-[4/5] items-center justify-center rounded-md border bg-background text-3xl font-black tabular-nums sm:text-5xl ${rolling ? "frcdle-reel-rolling border-primary/40" : "border-border"}`}>
      {rolling ? rollingValue : value}
    </div>
  );
}

export function FrcdleGame() {
  const { user } = useAuth();
  const [spin, setSpin] = useState<DailySpin | null>(null);
  const [revealCount, setRevealCount] = useState(0);
  const [isRevealing, setIsRevealing] = useState(false);
  const [isLoadingSpin, setIsLoadingSpin] = useState(true);
  const [isResolvingTeams, setIsResolvingTeams] = useState(false);
  const [teams, setTeams] = useState<FoundTeam[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [spinTimeZone, setSpinTimeZone] = useState("");
  const timersRef = useRef<number[]>([]);
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);
  const effectiveTimeZone = spinTimeZone || timeZone;
  const hasSpunToday = spin?.spin_day === localSpinDay(now, effectiveTimeZone);
  const resetAt = nextResetAt(now, effectiveTimeZone);
  const number = spin?.spin_number ?? "000000";

  const fetchTodaySpin = useCallback(async (action: "status" | "spin") => {
    const { data, error: invokeError } = await supabase.functions.invoke("frcdle-spin", {
      body: { action, timeZone },
    });
    if (invokeError) throw new Error(invokeError.message || "Could not contact the daily spin service.");
    if (data?.error) throw new Error(data.error);
    return {
      spin: data?.spin as DailySpin | null,
      timeZone: data?.timeZone as string || timeZone,
    };
  }, [timeZone]);

  const resolveTeamResults = useCallback(async (spinNumber: string) => {
    setIsResolvingTeams(true);
    setError(null);
    try {
      const candidates = [...new Set([0, 1, 2]
        .map((index) => Number(spinNumber.slice(index, index + 4)))
        .filter((teamNumber) => teamNumber > 0))];
      const validTeams = (await Promise.all(candidates.map(async (teamNumber) => {
        const info = await getTeamInfo(teamNumber) as {
          team_number?: number;
          nickname?: string | null;
          name?: string | null;
        } | null;
        if (!info) return null;
        const [logo] = await Promise.all([getTeamLogo(teamNumber, CURRENT_YEAR)]);
        return {
          teamNumber,
          name: info.nickname || info.name || `FRC Team ${teamNumber}`,
          logo,
          xp: null as number | null,
        };
      }))).filter((team): team is FoundTeam => team !== null);
      setTeams(validTeams);

      if (validTeams.length > 0) {
        try {
          const { data, error: invokeError } = await supabase.functions.invoke("frcdle-team-xp", {
            body: { teamNumbers: validTeams.map((team) => team.teamNumber) },
          });
          if (invokeError) throw new Error(invokeError.message || "Could not load Match13 xP ratings.");
          if (data?.error) throw new Error(data.error);
          const xpMap = new Map<number, number | null>(
            (data?.results ?? []).map((result: { teamNumber: number; xp: number | null }) => [result.teamNumber, result.xp])
          );
          validTeams.forEach((team) => { team.xp = xpMap.get(team.teamNumber) ?? null; });
          setTeams(validTeams);
          if (validTeams.some((team) => team.xp === null)) {
            setError("Some teams do not have a current Match13 xP rating yet. You can retry the lookup.");
          }
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Could not load Match13 xP ratings.");
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not resolve teams for this number.");
      setTeams([]);
    } finally {
      setIsResolvingTeams(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let mounted = true;
    const spinTimers = timersRef.current;
    setIsLoadingSpin(true);
    fetchTodaySpin("status")
      .then(({ spin: todaySpin, timeZone: resolvedTimeZone }) => {
        if (!mounted) return;
        setSpinTimeZone(resolvedTimeZone);
        if (!todaySpin) return;
        setSpin(todaySpin);
        setRevealCount(6);
        void resolveTeamResults(todaySpin.spin_number);
      })
      .catch((cause) => {
        if (mounted) setError(cause instanceof Error ? cause.message : "Could not load your daily spin.");
      })
      .finally(() => { if (mounted) setIsLoadingSpin(false); });
    return () => {
      mounted = false;
      spinTimers.forEach(window.clearTimeout);
    };
  }, [user?.id, fetchTodaySpin, resolveTeamResults]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const startSpin = async () => {
    if (!user?.id || isLoadingSpin || isRevealing || hasSpunToday) return;
    setError(null);
    setIsLoadingSpin(true);
    try {
      const { spin: dailySpin, timeZone: resolvedTimeZone } = await fetchTodaySpin("spin");
      if (!dailySpin) throw new Error("The daily spin did not return a number.");
      setSpinTimeZone(resolvedTimeZone);
      setSpin(dailySpin);
      setTeams([]);
      setRevealCount(0);
      setIsRevealing(true);
      for (let digitIndex = 0; digitIndex < 6; digitIndex++) {
        await new Promise<void>((resolve) => {
          const timer = window.setTimeout(() => {
            setRevealCount(digitIndex + 1);
            resolve();
          }, 620);
          timersRef.current.push(timer);
        });
      }
      setIsRevealing(false);
      await resolveTeamResults(dailySpin.spin_number);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not spin today.");
      setIsRevealing(false);
    } finally {
      setIsLoadingSpin(false);
    }
  };

  const xpComplete = teams.length === 0 || teams.every((team) => team.xp !== null);
  const xpTotal = teams.reduce((total, team) => total + (team.xp ?? 0), 0);
  const boundedXpTotal = Math.max(0, Math.min(600, xpTotal));
  const percentile = xpComplete ? rarityPercent(xpTotal) : null;
  const rarity = percentile === null ? null : rarityFor(percentile);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(ellipse_at_top,_rgba(14,165,233,0.12),_transparent_55%)]">
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-5 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2 text-sky-300">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-[0.12em]">FRC daily draw</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">frcdle</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              One six-digit draw each day. Every four-digit window is checked against real FRC teams.
            </p>
          </div>
          <Badge variant="outline" className="gap-1.5 border-sky-500/30 bg-sky-500/5 py-1.5 text-sky-200">
            <Clock3 className="h-3.5 w-3.5" /> 9 AM reset · {formatCountdown(resetAt.getTime() - now.getTime())}
          </Badge>
        </div>

        <section className="rounded-lg border border-border/80 bg-card/90 p-4 sm:p-6">
          <div className="grid grid-cols-6 gap-2 sm:gap-3" aria-label="Six-digit FRC number">
            {number.split("").map((digit, index) => (
              <DigitReel key={index} value={digit} rolling={isRevealing && index >= revealCount} />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {spin ? `Daily number · ${spin.spin_day}` : "Your number is waiting."}
            </p>
            <Button onClick={startSpin} disabled={isLoadingSpin || isRevealing || hasSpunToday} className="gap-2">
              {isLoadingSpin || isRevealing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : hasSpunToday ? <Clock3 className="h-4 w-4" /> : <Dices className="h-4 w-4" />}
              {isLoadingSpin ? "Checking spin…" : isRevealing ? "Revealing…" : hasSpunToday ? "Already spun today" : "Spin today's number"}
            </Button>
          </div>
        </section>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
            {spin && <Button size="sm" variant="outline" className="ml-auto shrink-0" onClick={() => void resolveTeamResults(spin.spin_number)}><RotateCw className="mr-1 h-3.5 w-3.5" />Retry</Button>}
          </div>
        )}

        {spin && revealCount === 6 && (
          <div className="grid gap-4 lg:grid-cols-[1fr_250px]">
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold">Teams in {spin.spin_number}</h2>
                {isResolvingTeams && <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />Searching teams & xP</span>}
              </div>
              {!isResolvingTeams && teams.length === 0 && !error && (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No valid FRC team number appears in the three four-digit windows.
                </div>
              )}
              {teams.map((team) => (
                <article key={team.teamNumber} className="flex items-center gap-3 rounded-md border border-border bg-card/90 p-3">
                  {team.logo ? (
                    <img src={team.logo} alt={`Team ${team.teamNumber} logo`} className="h-12 w-12 rounded-md bg-white object-contain p-1" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-md bg-muted text-xs font-bold text-muted-foreground">{team.teamNumber}</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-sky-300">FRC {team.teamNumber}</div>
                    <div className="truncate font-semibold">{team.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase text-muted-foreground">2026 xP</div>
                    <div className="font-mono text-lg font-bold tabular-nums">{team.xp === null ? "—" : team.xp.toFixed(1)}</div>
                  </div>
                </article>
              ))}
            </section>

            <aside className="rounded-lg border border-border bg-card/90 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Combined xP</div>
              <div className="mt-1 text-4xl font-black tabular-nums">{boundedXpTotal.toFixed(1)}</div>
              <div className="mt-1 text-xs text-muted-foreground">Clamped to a 0–600 range</div>
              <div className="my-4 h-px bg-border" />
              {rarity ? (
                <>
                  <Badge variant="outline" className={`px-2.5 py-1 text-sm font-bold ${RARITY_STYLES[rarity]}`}>{rarity}</Badge>
                  <div className="mt-3 text-2xl font-black tabular-nums">{percentile!.toFixed(1)}%</div>
                  <div className="text-xs text-muted-foreground">rarity percentile</div>
                </>
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {teams.length === 0 ? "No team xP to score this draw." : "Rarity appears when every found team has a current xP rating."}
                </p>
              )}
              <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground/70">
                Truncated normal model: mean 300 xP, standard deviation 100, bounded from 0 to 600.
              </p>
            </aside>
          </div>
        )}
      </div>
      <style>{`
        @keyframes frcdle-reel-pulse {
          0%, 100% { color: hsl(var(--foreground)); filter: blur(0); }
          50% { color: hsl(var(--primary)); filter: blur(1px); }
        }
        .frcdle-reel-rolling { animation: frcdle-reel-pulse 120ms linear infinite; }
      `}</style>
    </div>
  );
}