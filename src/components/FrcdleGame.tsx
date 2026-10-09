import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ChevronLeft, Clock3, Dices, LayoutGrid, LoaderCircle, RotateCw, Search, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FRCDLE_XP_CDF, FRCDLE_XP_TABLE_MAX } from "@/config/frcdleRarity";
import { useAuth } from "@/contexts/AuthContext";
import { CURRENT_YEAR, getTeamLogo } from "@/lib/blueAlliance";
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
  xp: number;
  rank: number;
  rankTotal: number;
  /** Times the team number appears in the roll; its xP counts once per appearance. */
  count: number;
}

// Season xP snapshot (scripts/frcdle-rarity), loaded on first use so it stays out of the main bundle.
type SnapshotTeam = Omit<FoundTeam, "teamNumber" | "logo" | "count">;
let seasonSnapshot: Promise<Map<number, SnapshotTeam>> | null = null;
function loadSeasonSnapshot() {
  seasonSnapshot ??= import("@/config/frcdleSnapshot2026.json")
    .then(({ default: snapshot }) => {
      const teams = snapshot.teams as [number, string, number][];
      // xP rank among all on-season teams in the snapshot; tied teams share a rank.
      const sortedXp = teams.map(([, , xp]) => xp).sort((a, b) => b - a);
      const rankOf = new Map<number, number>();
      sortedXp.forEach((xp, index) => { if (!rankOf.has(xp)) rankOf.set(xp, index + 1); });
      return new Map(teams.map(([teamNumber, name, xp]) => [
        teamNumber,
        { name, xp, rank: rankOf.get(xp)!, rankTotal: teams.length },
      ]));
    })
    .catch((cause) => {
      seasonSnapshot = null;
      throw cause;
    });
  return seasonSnapshot;
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

// Highest combined xP any roll can score, from the generated rarity table (1548.25 on 111148 for 2026).
const XP_THEORETICAL_MAX = FRCDLE_XP_TABLE_MAX;

// Delay before each digit locks in, measured from the previous digit (ms).
const REVEAL_DELAYS_MS = [1000, 1000, 1000, 1000, 1500, 2000];
// Time each found team holds the spotlight before the next one appears (ms).
const TEAM_REVEAL_MS = 2000;

/** Start index of every place this team number appears in the roll, left to right. */
function teamOccurrenceStarts(spinNumber: string, teamNumber: number): number[] {
  const team = String(teamNumber);
  const starts: number[] = [];
  for (let start = 0; start + team.length <= spinNumber.length; start++) {
    if (spinNumber.startsWith(team, start)) starts.push(start);
  }
  return starts;
}

/** Progress of a fresh roll's team reveal: one step per occurrence of each team. */
interface TeamRevealStep {
  /** Cards shown so far; the last one is the team in the spotlight. */
  shownTeams: number;
  /** Occurrences of the spotlight team counted so far. */
  occurrences: number;
  /** Digit positions lit for this step. */
  digits: Set<number>;
}

/**
 * Team numbers a roll contains, with how many times each appears: every 2-5
 * digit window; windows with a leading zero repeat a shorter one.
 */
function rollTeamCounts(spinNumber: string): Map<number, number> {
  const counts = new Map<number, number>();
  for (let length = 2; length <= 5; length++) {
    for (let start = 0; start + length <= spinNumber.length; start++) {
      const window = spinNumber.slice(start, start + length);
      if (window.startsWith("0")) continue;
      const teamNumber = Number(window);
      counts.set(teamNumber, (counts.get(teamNumber) ?? 0) + 1);
    }
  }
  return counts;
}

/** Combined xP shown for a roll, clamped the same way as the daily counter. */
function boundedRollXp(xpTotal: number): number {
  return Math.max(0, Math.min(XP_THEORETICAL_MAX, xpTotal));
}

/** Percent of all 1,000,000 possible rolls that score less combined xP than this one. */
function rarityPercent(xpTotal: number): number {
  const first = FRCDLE_XP_CDF[0];
  const last = FRCDLE_XP_CDF[FRCDLE_XP_CDF.length - 1];
  if (xpTotal <= first[0]) return first[1];
  if (xpTotal >= last[0]) return last[1];
  let low = 0;
  let high = FRCDLE_XP_CDF.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (FRCDLE_XP_CDF[mid][0] <= xpTotal) low = mid;
    else high = mid;
  }
  const [lowXp, lowPercent] = FRCDLE_XP_CDF[low];
  const [highXp, highPercent] = FRCDLE_XP_CDF[high];
  return lowPercent + ((xpTotal - lowXp) / (highXp - lowXp)) * (highPercent - lowPercent);
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

function DigitReel({ value, rolling, highlighted }: { value: string; rolling: boolean; highlighted: boolean }) {
  const [rollingValue, setRollingValue] = useState("0");
  // Bumped each time the reel stops so the landed digit remounts and plays its pop-in.
  const [wasRolling, setWasRolling] = useState(rolling);
  const [landCount, setLandCount] = useState(0);
  if (rolling !== wasRolling) {
    setWasRolling(rolling);
    if (!rolling) setLandCount((count) => count + 1);
  }

  useEffect(() => {
    if (!rolling) return;
    const interval = window.setInterval(() => {
      setRollingValue(String(Math.floor(Math.random() * 10)));
    }, 55);
    return () => window.clearInterval(interval);
  }, [rolling]);

  return (
    <div className={`flex aspect-[4/5] items-center justify-center rounded-md border bg-background text-3xl font-black tabular-nums sm:text-5xl ${rolling ? "frcdle-reel-rolling border-primary/40" : highlighted ? "border-amber-400 bg-amber-400/15 text-amber-300 ring-2 ring-amber-400/40" : "border-border"} transition-colors duration-300`}>
      {rolling ? rollingValue : (
        <span key={landCount} className={landCount > 0 ? "frcdle-digit-land inline-block" : undefined}>{value}</span>
      )}
    </div>
  );
}

interface PastRoll {
  xp: number;
  teamNumbers: number[];
}

/** Team logo that only loads once its card scrolls near the viewport, cached in memory only. */
function LazyTeamLogo({ teamNumber }: { teamNumber: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [logo, setLogo] = useState<string | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || visible) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisible(true);
    }, { rootMargin: "200px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let mounted = true;
    getTeamLogo(teamNumber, CURRENT_YEAR, false)
      .then((url) => { if (mounted) setLogo(url); })
      .catch(() => {});
    return () => { mounted = false; };
  }, [visible, teamNumber]);

  return (
    <div ref={ref} className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-[10px] font-bold text-muted-foreground">
      {logo ? <img src={logo} alt={`Team ${teamNumber} logo`} className="h-full w-full bg-white object-contain p-0.5" /> : teamNumber}
    </div>
  );
}

/** Every team in the season snapshot; teams the user has rolled are fully opaque. */
function AllTeamsPage({ snapshot, earned, onBack }: {
  snapshot: Map<number, SnapshotTeam> | null;
  earned: Set<number>;
  onBack: () => void;
}) {
  const allTeams = useMemo(() => (snapshot ? [...snapshot].sort(([a], [b]) => a - b) : []), [snapshot]);
  const earnedCount = allTeams.filter(([teamNumber]) => earned.has(teamNumber)).length;
  const [query, setQuery] = useState("");
  // Deferred so typing stays responsive while thousands of cards re-filter.
  const search = useDeferredValue(query.trim().toLowerCase());
  const shownTeams = useMemo(() => (
    search
      ? allTeams.filter(([teamNumber, team]) => String(teamNumber).startsWith(search) || team.name.toLowerCase().includes(search))
      : allTeams
  ), [allTeams, search]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(ellipse_at_top,_rgba(14,165,233,0.12),_transparent_55%)]">
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-5 sm:px-6 sm:py-8">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">All teams</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {snapshot
                ? `${earnedCount.toLocaleString()} of ${allTeams.length.toLocaleString()} ${CURRENT_YEAR} teams rolled`
                : "Loading teams…"}
            </p>
          </div>
          <Button size="sm" variant="outline" className="justify-self-end" onClick={onBack}>
            <ChevronLeft className="mr-1 h-3.5 w-3.5" />Back to roll
          </Button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by team number or name"
            aria-label="Search teams"
            className="pl-9"
          />
        </div>
        {snapshot && search && shownTeams.length === 0 && (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No teams match “{query.trim()}”.
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {shownTeams.map(([teamNumber, team]) => {
            const isEarned = earned.has(teamNumber);
            return (
              <div
                key={teamNumber}
                className={`flex items-center gap-2 rounded-md border p-2 ${isEarned ? "border-sky-500/50 bg-sky-500/10" : "border-border opacity-30"}`}
              >
                <LazyTeamLogo teamNumber={teamNumber} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold tabular-nums text-sky-300">FRC {teamNumber}</div>
                  <div className="truncate text-sm font-semibold">{team.name}</div>
                  <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {team.xp.toFixed(1)} xP · #{team.rank.toLocaleString()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
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
  const [pastRollsByDay, setPastRollsByDay] = useState<Map<string, PastRoll> | null>(null);
  const [snapshot, setSnapshot] = useState<Map<number, SnapshotTeam> | null>(null);
  const [showAllTeams, setShowAllTeams] = useState(false);
  // Current step of a fresh roll's team reveal; null = everything shown.
  const [teamReveal, setTeamReveal] = useState<TeamRevealStep | null>(null);
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

  const resolveTeamResults = useCallback(async (spinNumber: string): Promise<FoundTeam[]> => {
    setIsResolvingTeams(true);
    setError(null);
    try {
      const snapshot = await loadSeasonSnapshot();
      const found = [...rollTeamCounts(spinNumber)].flatMap(([teamNumber, count]) => {
        const entry = snapshot.get(teamNumber);
        return entry ? [{ teamNumber, count, ...entry }] : [];
      });
      // Logos are the only network lookup left, and getTeamLogo caches them.
      const logos = await Promise.all(found.map((team) => getTeamLogo(team.teamNumber, CURRENT_YEAR).catch(() => null)));
      const resolved = found.map((team, index) => ({ ...team, logo: logos[index] }));
      setTeams(resolved);
      return resolved;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not resolve teams for this number.");
      setTeams([]);
      return [];
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

  // Lifetime xP and rolled teams: every saved roll scored against the season snapshot.
  useEffect(() => {
    if (!user?.id) return;
    let mounted = true;
    Promise.all([
      supabase.from("frcdle_spins").select("spin_day, spin_number").eq("user_id", user.id),
      loadSeasonSnapshot(),
    ])
      .then(([{ data, error: spinsError }, seasonTeams]) => {
        if (spinsError) throw spinsError;
        if (!mounted) return;
        setSnapshot(seasonTeams);
        setPastRollsByDay(new Map((data ?? []).map(({ spin_day, spin_number }) => {
          const counts = [...rollTeamCounts(spin_number as string)].filter(([teamNumber]) => seasonTeams.has(teamNumber));
          return [spin_day as string, {
            xp: boundedRollXp(counts.reduce((total, [teamNumber, count]) => total + seasonTeams.get(teamNumber)!.xp * count, 0)),
            teamNumbers: counts.map(([teamNumber]) => teamNumber),
          }];
        })));
      })
      .catch((cause) => console.error("Could not load lifetime FRCdle xP:", cause));
    return () => { mounted = false; };
  }, [user?.id]);

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
          }, REVEAL_DELAYS_MS[digitIndex]);
          timersRef.current.push(timer);
        });
      }
      setIsRevealing(false);
      setTeamReveal({ shownTeams: 0, occurrences: 0, digits: new Set() });
      const found = await resolveTeamResults(dailySpin.spin_number);
      // Bring teams in one at a time, lighting up the digits that spell each one;
      // a repeated team lights each of its occurrences in turn.
      for (let index = 0; index < found.length; index++) {
        const { teamNumber } = found[index];
        const length = String(teamNumber).length;
        const starts = teamOccurrenceStarts(dailySpin.spin_number, teamNumber);
        for (let occurrence = 0; occurrence < starts.length; occurrence++) {
          setTeamReveal({
            shownTeams: index + 1,
            occurrences: occurrence + 1,
            digits: new Set(Array.from({ length }, (_, offset) => starts[occurrence] + offset)),
          });
          await new Promise<void>((resolve) => {
            timersRef.current.push(window.setTimeout(resolve, TEAM_REVEAL_MS));
          });
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not spin today.");
      setIsRevealing(false);
    } finally {
      setTeamReveal(null);
      setIsLoadingSpin(false);
    }
  };

  const isRevealingTeams = teamReveal !== null;
  // While revealing, the spotlight team only counts the occurrences lit so far.
  const visibleTeams = teamReveal
    ? teams.slice(0, teamReveal.shownTeams).map((team, index) => (
      index === teamReveal.shownTeams - 1 ? { ...team, count: teamReveal.occurrences } : team
    ))
    : teams;
  const spotlightTeam = teamReveal ? visibleTeams[teamReveal.shownTeams - 1]?.teamNumber : undefined;
  const xpTotal = visibleTeams.reduce((total, team) => total + team.xp * team.count, 0);
  const highlightedDigits = teamReveal?.digits;
  const boundedXpTotal = boundedRollXp(xpTotal);
  // Today's roll counts once its teams are on screen, so the reveal isn't spoiled.
  const pastRolls = pastRollsByDay ? [...pastRollsByDay].filter(([day]) => day !== spin?.spin_day).map(([, roll]) => roll) : [];
  const todayCounted = spin !== null && !isRevealing && !isResolvingTeams && !isRevealingTeams;
  const lifetimeXp = pastRolls.reduce((total, roll) => total + roll.xp, 0) + (todayCounted ? boundedXpTotal : 0);
  const earnedTeams = new Set([
    ...pastRolls.flatMap((roll) => roll.teamNumbers),
    ...(todayCounted ? teams.map((team) => team.teamNumber) : []),
  ]);
  const lifetimeRolls = pastRolls.length + (todayCounted ? 1 : 0);
  const percentile = !isRevealingTeams && teams.length > 0 ? rarityPercent(xpTotal) : null;
  const rarity = percentile === null ? null : rarityFor(percentile);

  if (showAllTeams) {
    return <AllTeamsPage snapshot={snapshot} earned={earnedTeams} onBack={() => setShowAllTeams(false)} />;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(ellipse_at_top,_rgba(14,165,233,0.12),_transparent_55%)]">
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-5 sm:px-6 sm:py-8">
        {/* Button pinned top-right at every width; the reset badge sits under it, or under the title on phones. */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="sm:row-span-2">
            <div className="mb-1 flex items-center gap-2 text-sky-300">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-[0.12em]">FRC daily draw</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">frcdle</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              *1-digit team numbers are not counted (sorry, Paly).
            </p>
          </div>
          <Button size="sm" variant="outline" className="justify-self-end" onClick={() => setShowAllTeams(true)}>
            <LayoutGrid className="mr-1 h-3.5 w-3.5" />All teams
          </Button>
          <Badge variant="outline" className="col-span-2 gap-1.5 justify-self-start border-sky-500/30 bg-sky-500/5 py-1.5 text-sky-200 sm:col-span-1 sm:col-start-2 sm:justify-self-end">
            <Clock3 className="h-3.5 w-3.5" /> Resets in {formatCountdown(resetAt.getTime() - now.getTime())}
          </Badge>
        </div>

        <section className="rounded-lg border border-border/80 bg-card/90 p-4 sm:p-6">
          <div className="grid grid-cols-6 gap-2 sm:gap-3" aria-label="Six-digit FRC number">
            {number.split("").map((digit, index) => (
              <DigitReel
                key={index}
                value={digit}
                rolling={isRevealing && index >= revealCount}
                highlighted={highlightedDigits?.has(index) ?? false}
              />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {spin ? `Daily number · ${spin.spin_day}` : "Your number is waiting."}
            </p>
            <Button onClick={startSpin} disabled={isLoadingSpin || isRevealing || hasSpunToday} className="gap-2">
              {isLoadingSpin || isRevealing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : hasSpunToday ? <Clock3 className="h-4 w-4" /> : <Dices className="h-4 w-4" />}
              {isRevealing || isRevealingTeams ? "Revealing…" : isLoadingSpin ? "Checking spin…" : hasSpunToday ? "Already spun today" : "Spin today's number"}
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
                  There is nothing.
                </div>
              )}
              {visibleTeams.map((team) => (
                <article
                  key={team.teamNumber}
                  className={`flex items-center gap-3 rounded-md border bg-card/90 p-3 transition-colors duration-300 ${isRevealingTeams ? "frcdle-team-in" : ""} ${spotlightTeam === team.teamNumber ? "border-amber-400/70" : "border-border"}`}
                >
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
                    <div className="font-mono text-lg font-bold tabular-nums">{team.xp.toFixed(1)}</div>
                    <div className="text-[10px] tabular-nums text-muted-foreground">#{team.rank.toLocaleString()} of {team.rankTotal.toLocaleString()}</div>
                  </div>
                  {team.count > 1 && (
                    <div key={team.count} className={`shrink-0 font-mono text-lg font-black tabular-nums text-amber-300 ${isRevealingTeams ? "frcdle-team-in" : ""}`}>x{team.count}</div>
                  )}
                </article>
              ))}
            </section>

            <aside className="rounded-lg border border-border bg-card/90 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Combined xP</div>
              <div className="mt-1 text-4xl font-black tabular-nums">{boundedXpTotal.toFixed(1)}</div>
              <div className="mt-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Lifetime xP</div>
              <div className="mt-1 text-2xl font-black tabular-nums">{pastRollsByDay ? lifetimeXp.toFixed(1) : "—"}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Across {lifetimeRolls} {lifetimeRolls === 1 ? "roll" : "rolls"}
              </div>
              <div className="my-4 h-px bg-border" />
              {rarity ? (
                <>
                  <Badge variant="outline" className={`px-2.5 py-1 text-sm font-bold ${RARITY_STYLES[rarity]}`}>{rarity}</Badge>
                  <div className="mt-3 text-2xl font-black tabular-nums">{percentile!.toFixed(1)}%</div>
                  <div className="text-xs text-muted-foreground">rarity percentile</div>
                </>
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {isRevealingTeams ? "Rarity appears once every team is revealed." : "No team xP to score this draw."}
                </p>
              )}
              <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground/70">
                Ranked against the combined xP of all 1,000,000 possible rolls.
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
        @keyframes frcdle-team-in {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: none; }
        }
        .frcdle-team-in { animation: frcdle-team-in 350ms ease-out; }
        @keyframes frcdle-digit-land {
          from { transform: scale(1.35); }
          to { transform: scale(1); }
        }
        .frcdle-digit-land { animation: frcdle-digit-land 500ms cubic-bezier(0.2, 0.8, 0.3, 1); }
        @media (prefers-reduced-motion: reduce) { .frcdle-team-in, .frcdle-digit-land { animation: none; } }
      `}</style>
    </div>
  );
}