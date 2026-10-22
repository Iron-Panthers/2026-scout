import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ChevronLeft, Clock3, Dices, History, LayoutGrid, LoaderCircle, RotateCw, Search, Sparkles, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FRCDLE_XP_CDF, FRCDLE_XP_TABLE_MAX } from "@/config/frcdleRarity";
import { useAuth } from "@/contexts/AuthContext";
import { useDevMode } from "@/contexts/DevModeContext";
import { CURRENT_YEAR, getTeamLogo } from "@/lib/blueAlliance";
import { getDevFrcdleSpins, getOrCreateDevFrcdleSpin } from "@/lib/devMode";
import { supabase } from "@/lib/supabase";
import { unlockAchievement } from "@/lib/achievements";

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

type Rarity = "There's Nothing." | "Trash" | "Common" | "Uncommon" | "Rare" | "Epic" | "Anomaly" | "Mythic";

// Dark text and stronger tints in light themes so the badges don't wash out on
// a light background; the dark: variants keep the original pale look.
const RARITY_STYLES: Record<Rarity, string> = {
  "There's Nothing.": "border-zinc-600/60 bg-zinc-600/15 text-zinc-600 dark:border-zinc-600/40 dark:bg-zinc-600/10 dark:text-zinc-400",
  Trash: "border-stone-500/60 bg-stone-600/15 text-stone-700 dark:border-stone-500/40 dark:bg-stone-600/10 dark:text-stone-300",
  Common: "border-slate-500/60 bg-slate-500/15 text-slate-700 dark:border-slate-500/40 dark:bg-slate-500/10 dark:text-slate-200",
  Uncommon: "border-emerald-500/60 bg-emerald-500/15 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200",
  Rare: "border-sky-500/60 bg-sky-500/15 text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200",
  Epic: "border-violet-500/60 bg-violet-500/15 text-violet-800 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-200",
  Anomaly: "border-orange-500/60 bg-orange-500/15 text-orange-800 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-200",
  Mythic: "border-fuchsia-500/60 bg-fuchsia-500/15 text-fuchsia-800 dark:border-fuchsia-500/40 dark:bg-fuchsia-500/10 dark:text-fuchsia-200",
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

// Highest combined xP any roll can score, from the generated rarity table (1261.01 on 111148 for 2026, with digit multipliers).
const XP_THEORETICAL_MAX = FRCDLE_XP_TABLE_MAX;

// Delay before each digit locks in, measured from the previous digit (ms).
const REVEAL_DELAYS_MS = [1000, 1000, 1000, 1000, 1500, 2000];

// Balancing: short team numbers turn up in far more rolls, so they score less.
// Keep in sync with DIGIT_MULTIPLIERS in scripts/frcdle-rarity/generate_table.py.
const DIGIT_MULTIPLIERS: Record<number, number> = { 1: 0.2, 2: 0.6, 3: 0.8, 4: 1, 5: 1.2 };

/** xP multiplier for a team, by how many digits its number has. */
function xpMultiplier(teamNumber: number): number {
  return DIGIT_MULTIPLIERS[String(teamNumber).length] ?? 1;
}
// Time each found team holds the spotlight before the next one appears (ms).
const TEAM_REVEAL_MS = 1500;

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
 * Team numbers a roll contains, with how many times each appears: every 1-5
 * digit window; windows with a leading zero repeat a shorter one.
 */
function rollTeamCounts(spinNumber: string): Map<number, number> {
  const counts = new Map<number, number>();
  for (let length = 1; length <= 5; length++) {
    for (let start = 0; start + length <= spinNumber.length; start++) {
      const window = spinNumber.slice(start, start + length);
      if (window.startsWith("0")) continue;
      const teamNumber = Number(window);
      counts.set(teamNumber, (counts.get(teamNumber) ?? 0) + 1);
    }
  }
  return counts;
}

/** Season-snapshot teams a roll contains, with how many times each appears. */
function rollSnapshotTeams(spinNumber: string, snapshot: Map<number, SnapshotTeam>): Omit<FoundTeam, "logo">[] {
  return [...rollTeamCounts(spinNumber)].flatMap(([teamNumber, count]) => {
    const entry = snapshot.get(teamNumber);
    return entry ? [{ teamNumber, count, ...entry }] : [];
  });
}

/** Combined xP of a roll's teams, before clamping. */
function rollXp(teams: Pick<FoundTeam, "teamNumber" | "xp" | "count">[]): number {
  return teams.reduce((total, team) => total + team.xp * xpMultiplier(team.teamNumber) * team.count, 0);
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

// Percent of rolls below the table's first positive-xP point — about the share
// of rolls that score nothing (no teams, or only zero/negative-xP teams).
// Trash is the next 1% above it, so it isn't swallowed by "There's Nothing.".
const ZERO_XP_PERCENT = FRCDLE_XP_CDF.find(([xp]) => xp > 0)?.[1] ?? 0;

function rarityFor(percent: number): Rarity {
  if (percent < ZERO_XP_PERCENT + 1) return "Trash";
  if (percent < 50) return "Common";
  if (percent < 75) return "Uncommon";
  if (percent < 90) return "Rare";
  if (percent < 95) return "Epic";
  if (percent < 99) return "Anomaly";
  return "Mythic";
}

/**
 * Rarity of a roll from its combined xP. Never stored, so every roll — past
 * ones included — is always rated by the current tiers. `standing` is null for
 * rolls that score nothing.
 */
function rollRarity(xpTotal: number): { rarity: Rarity; standing: RarityStanding | null } {
  if (boundedRollXp(xpTotal) <= 0) return { rarity: "There's Nothing.", standing: null };
  const percent = rarityPercent(xpTotal);
  const rarity = rarityFor(percent);
  return { rarity, standing: rarityStanding(rarity, percent) };
}

interface RarityStanding {
  side: "Top" | "Bottom";
  /** e.g. "28.3%" or "<1%". */
  value: string;
}

/**
 * Where a roll sits, from the percent of rolls scoring less: the bottom half
 * reads "Bottom x%", the top half "Top x%". Trash (the lowest 1% of scoring
 * rolls) and the top 1% read "<1%".
 */
function rarityStanding(rarity: Rarity, percent: number): RarityStanding {
  if (rarity === "Trash") return { side: "Bottom", value: "<1%" };
  if (percent < 50) return { side: "Bottom", value: `${percent.toFixed(1)}%` };
  const top = 100 - percent;
  return { side: "Top", value: top < 1 ? "<1%" : `${top.toFixed(1)}%` };
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

/** One of this user's saved rolls, scored against the season snapshot. */
interface PastRoll {
  spinDay: string;
  spinNumber: string;
  teams: Omit<FoundTeam, "logo">[];
  /** Combined xP before clamping, as used for rarity. */
  xp: number;
}

/** The day's highest-scoring roll from another player. */
interface TopSpin {
  name: string | null;
  /** The roll is this user's own real spin (e.g. seen from the sandbox). */
  isYou: boolean;
  spinNumber: string;
  createdAt: string;
  teams: FoundTeam[];
  /** Combined xP before clamping, as used for rarity. */
  xp: number;
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

/** Just the text colors (light + dark) from a rarity's badge style. */
function rarityTextClasses(rarity: Rarity): string {
  return RARITY_STYLES[rarity].split(" ").filter((name) => /^(dark:)?text-/.test(name)).join(" ");
}

/** Rarity badge followed by the roll's "Top/Bottom x%" standing, on one line. */
function RarityLine({ rarity, standing, className = "" }: ReturnType<typeof rollRarity> & { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <Badge variant="outline" className={`px-2 py-0.5 text-xs font-bold sm:px-2.5 sm:py-1 sm:text-sm ${RARITY_STYLES[rarity]}`}>{rarity}</Badge>
      {standing && <span className={`text-sm font-bold tabular-nums sm:text-base ${rarityTextClasses(rarity)}`}>{standing.side} {standing.value}</span>}
    </div>
  );
}

/** A scored roll as a card: number, who/when, xP, rarity and its teams. */
function SpinEntry({ spinNumber, subtitle, xp, teams, rank, highlight = false }: {
  spinNumber: string;
  subtitle: string;
  /** Combined xP before clamping. */
  xp: number;
  teams: Omit<FoundTeam, "logo">[];
  rank?: number;
  highlight?: boolean;
}) {
  const { rarity, standing } = rollRarity(xp);
  return (
    <div className={`rounded-md border p-3 ${highlight ? "border-amber-400/50 bg-amber-400/5" : "border-border bg-background/40"}`}>
      <div className="flex items-start gap-3">
        {rank !== undefined && (
          <div className={`w-5 shrink-0 text-lg font-black tabular-nums ${highlight ? "text-amber-300" : "text-muted-foreground"}`}>{rank}</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-mono text-xl font-black tracking-[0.15em] tabular-nums">{spinNumber}</div>
          <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-lg font-bold tabular-nums">{boundedRollXp(xp).toFixed(1)}<span className="ml-0.5 text-[10px] font-semibold text-muted-foreground">xP</span></div>
          <Badge variant="outline" className={`mt-0.5 px-1.5 py-0 text-[10px] font-bold ${RARITY_STYLES[rarity]}`}>
            {rarity}{standing && ` · ${standing.side} ${standing.value}`}
          </Badge>
        </div>
      </div>
      {teams.length > 0 && (
        <div className={`mt-2 flex flex-wrap gap-1 ${rank !== undefined ? "pl-8" : ""}`}>
          {teams.map((team) => (
            <span key={team.teamNumber} title={team.name} className="rounded border border-sky-500/30 bg-sky-500/5 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-sky-200">
              {team.teamNumber}{team.count > 1 && ` ×${team.count}`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Every roll this user has made, newest first, with their best one on top. */
function HistoryPage({ rolls, onBack }: { rolls: PastRoll[] | null; onBack: () => void }) {
  const newestFirst = useMemo(() => (rolls ? [...rolls].sort((a, b) => b.spinDay.localeCompare(a.spinDay)) : []), [rolls]);
  // Highest xP; ties go to the earlier roll.
  const best = newestFirst.reduce<PastRoll | null>((top, roll) => (!top || roll.xp >= top.xp ? roll : top), null);
  const lifetimeXp = newestFirst.reduce((total, roll) => total + boundedRollXp(roll.xp), 0);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(ellipse_at_top,_rgba(14,165,233,0.12),_transparent_55%)]">
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-5 sm:px-6 sm:py-8">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">History</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {rolls
                ? `${newestFirst.length.toLocaleString()} ${newestFirst.length === 1 ? "spin" : "spins"} · ${lifetimeXp.toFixed(1)} lifetime xP`
                : "Loading your spins…"}
            </p>
          </div>
          <Button size="sm" variant="outline" className="justify-self-end" onClick={onBack}>
            <ChevronLeft className="mr-1 h-3.5 w-3.5" />Back to roll
          </Button>
        </div>

        {!rolls && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" />Loading your spins…
          </div>
        )}
        {rolls && newestFirst.length === 0 && (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No spins yet — spin today's number to start your history.
          </div>
        )}

        {best && (
          <section className="space-y-2">
            <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-amber-300">
              <Trophy className="h-4 w-4" />Best spin
            </h2>
            <SpinEntry spinNumber={best.spinNumber} subtitle={best.spinDay} xp={best.xp} teams={best.teams} highlight />
          </section>
        )}

        {newestFirst.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-sky-300">All spins</h2>
            <div className="grid gap-2 md:grid-cols-2">
              {newestFirst.map((roll) => (
                <SpinEntry key={roll.spinDay} spinNumber={roll.spinNumber} subtitle={roll.spinDay} xp={roll.xp} teams={roll.teams} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/** A scored roll on the leaderboard. */
interface RankedSpin {
  name: string | null;
  isYou: boolean;
  spinNumber: string;
  spinDay: string;
  createdAt: string;
  teams: Omit<FoundTeam, "logo">[];
  /** Combined xP before clamping, as used for rarity. */
  xp: number;
}

const LEADERBOARD_PERIODS = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "all", label: "All time" },
] as const;
type LeaderboardPeriod = typeof LEADERBOARD_PERIODS[number]["key"];

const LEADERBOARD_SIZE = 3;

/** Monday of the week containing a YYYY-MM-DD spin day, as YYYY-MM-DD. */
function weekStartOf(spinDay: string): string {
  const date = new Date(`${spinDay}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

/** Top rolls by every scouter for today, this week, this month and all time. */
function LeaderboardPage({ onBack }: { onBack: () => void }) {
  const [boards, setBoards] = useState<Record<LeaderboardPeriod, RankedSpin[]> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      // Real rolls even in the sandbox: this only reads.
      supabase.functions.invoke("frcdle-spin", {
        body: { action: "leaderboard", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" },
      }),
      loadSeasonSnapshot(),
    ])
      .then(([{ data, error: invokeError }, seasonTeams]) => {
        if (invokeError) throw invokeError;
        if (data?.error) throw new Error(data.error);
        const today = data.spinDay as string;
        const weekStart = weekStartOf(today);
        const month = today.slice(0, 7);
        const spins = (data.spins ?? []) as { spin_number: string; spin_day: string; created_at: string; name: string | null; is_you?: boolean }[];

        // Best first; ties go to whoever rolled first.
        const ranked: RankedSpin[] = spins.map((spin) => {
          const teams = rollSnapshotTeams(spin.spin_number, seasonTeams);
          return {
            name: spin.name,
            isYou: Boolean(spin.is_you),
            spinNumber: spin.spin_number,
            spinDay: spin.spin_day,
            createdAt: spin.created_at,
            teams,
            xp: rollXp(teams),
          };
        }).sort((a, b) => b.xp - a.xp || a.createdAt.localeCompare(b.createdAt));

        const top = (inPeriod: (spin: RankedSpin) => boolean) => ranked.filter(inPeriod).slice(0, LEADERBOARD_SIZE);
        if (!mounted) return;
        setBoards({
          today: top((spin) => spin.spinDay === today),
          week: top((spin) => spin.spinDay >= weekStart && spin.spinDay <= today),
          month: top((spin) => spin.spinDay.startsWith(month)),
          all: top(() => true),
        });
      })
      .catch((cause) => {
        if (mounted) setError(cause instanceof Error ? cause.message : "Could not load the leaderboard.");
      });
    return () => { mounted = false; };
  }, []);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(ellipse_at_top,_rgba(14,165,233,0.12),_transparent_55%)]">
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-5 sm:px-6 sm:py-8">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Leaderboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">Top {LEADERBOARD_SIZE} spins across every scouter</p>
          </div>
          <Button size="sm" variant="outline" className="justify-self-end" onClick={onBack}>
            <ChevronLeft className="mr-1 h-3.5 w-3.5" />Back to roll
          </Button>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {!boards && !error && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" />Loading leaderboard…
          </div>
        )}

        {boards && (
          <div className="grid gap-4 md:grid-cols-2">
            {LEADERBOARD_PERIODS.map(({ key, label }) => (
              <section key={key} className="rounded-lg border border-border/80 bg-card/90 p-4">
                <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-sky-300">{label}</h2>
                {boards[key].length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">No spins yet.</p>
                ) : (
                  <ol className="mt-3 space-y-2">
                    {boards[key].map((entry, index) => (
                      <li key={`${entry.spinDay}-${entry.spinNumber}-${entry.createdAt}`}>
                        <SpinEntry
                          spinNumber={entry.spinNumber}
                          subtitle={`${entry.isYou ? "You" : entry.name || "Unknown player"}${key !== "today" ? ` · ${entry.spinDay}` : ""}`}
                          xp={entry.xp}
                          teams={entry.teams}
                          rank={index + 1}
                          highlight={index === 0}
                        />
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function FrcdleGame() {
  const { user } = useAuth();
  const { devMode } = useDevMode();
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
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  // Current step of a fresh roll's team reveal; null = everything shown.
  const [teamReveal, setTeamReveal] = useState<TeamRevealStep | null>(null);
  // undefined = not loaded (or failed), null = nobody else has spun today.
  const [topSpin, setTopSpin] = useState<TopSpin | null | undefined>(undefined);
  const timersRef = useRef<number[]>([]);
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);
  const effectiveTimeZone = spinTimeZone || timeZone;
  const spinDay = localSpinDay(now, effectiveTimeZone);
  const hasSpunToday = spin?.spin_day === spinDay;
  const resetAt = nextResetAt(now, effectiveTimeZone);
  const number = spin?.spin_number ?? "000000";

  const fetchTodaySpin = useCallback(async (action: "status" | "spin") => {
    // Sandbox rolls stay in the sandbox and never touch the account's real rolls.
    if (devMode && user?.id) {
      return {
        spin: getOrCreateDevFrcdleSpin(user.id, localSpinDay(new Date(), timeZone), action === "spin"),
        timeZone,
      };
    }
    const { data, error: invokeError } = await supabase.functions.invoke("frcdle-spin", {
      body: { action, timeZone },
    });
    if (invokeError) throw new Error(invokeError.message || "Could not contact the daily spin service.");
    if (data?.error) throw new Error(data.error);
    return {
      spin: data?.spin as DailySpin | null,
      timeZone: data?.timeZone as string || timeZone,
    };
  }, [devMode, user?.id, timeZone]);

  const resolveTeamResults = useCallback(async (spinNumber: string): Promise<FoundTeam[]> => {
    setIsResolvingTeams(true);
    setError(null);
    try {
      const found = rollSnapshotTeams(spinNumber, await loadSeasonSnapshot());
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
      devMode
        ? Promise.resolve({ data: getDevFrcdleSpins(user.id), error: null })
        : supabase.from("frcdle_spins").select("spin_day, spin_number").eq("user_id", user.id),
      loadSeasonSnapshot(),
    ])
      .then(([{ data, error: spinsError }, seasonTeams]) => {
        if (spinsError) throw spinsError;
        if (!mounted) return;
        setSnapshot(seasonTeams);
        setPastRollsByDay(new Map((data ?? []).map(({ spin_day, spin_number }) => {
          const rolled = rollSnapshotTeams(spin_number as string, seasonTeams);
          return [spin_day as string, {
            spinDay: spin_day as string,
            spinNumber: spin_number as string,
            teams: rolled,
            xp: rollXp(rolled),
          }];
        })));
      })
      .catch((cause) => console.error("Could not load lifetime FRCdle xP:", cause));
    return () => { mounted = false; };
  }, [user?.id, devMode]);

  // Today's best roll from any player (this user's real spin included), shown until they spin.
  useEffect(() => {
    if (!user?.id || isLoadingSpin || hasSpunToday) return;
    let mounted = true;
    Promise.all([
      // Read-only, so the sandbox shows real scouters' rolls too.
      supabase.functions.invoke("frcdle-spin", { body: { action: "top", timeZone } }),
      loadSeasonSnapshot(),
    ])
      .then(async ([{ data, error: invokeError }, seasonTeams]) => {
        if (invokeError) throw invokeError;
        if (data?.error) throw new Error(data.error);
        const spins = (data?.spins ?? []) as { spin_number: string; created_at: string; name: string | null; is_you?: boolean }[];
        let best: (Omit<TopSpin, "teams"> & { teams: Omit<FoundTeam, "logo">[] }) | null = null;
        for (const { spin_number, created_at, name, is_you } of spins) {
          const rolled = rollSnapshotTeams(spin_number, seasonTeams);
          const xp = rollXp(rolled);
          // Ties go to whoever rolled first.
          if (!best || xp > best.xp || (xp === best.xp && created_at < best.createdAt)) {
            best = { name, isYou: Boolean(is_you), spinNumber: spin_number, createdAt: created_at, teams: rolled, xp };
          }
        }
        if (!best) {
          if (mounted) setTopSpin(null);
          return;
        }
        const logos = await Promise.all(best.teams.map((team) => getTeamLogo(team.teamNumber, CURRENT_YEAR).catch(() => null)));
        const teamsWithLogos = best.teams.map((team, index) => ({ ...team, logo: logos[index] }));
        if (mounted) setTopSpin({ ...best, teams: teamsWithLogos });
      })
      .catch((cause) => console.error("Could not load today's top FRCdle spin:", cause));
    return () => { mounted = false; };
  }, [user?.id, isLoadingSpin, hasSpunToday, spinDay, timeZone]);

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
  const xpTotal = rollXp(visibleTeams);
  const highlightedDigits = teamReveal?.digits;
  const boundedXpTotal = boundedRollXp(xpTotal);
  // Today's roll counts once its teams are on screen, so the reveal isn't spoiled.
  const pastRolls = pastRollsByDay ? [...pastRollsByDay].filter(([day]) => day !== spin?.spin_day).map(([, roll]) => roll) : [];
  const todayCounted = spin !== null && !isRevealing && !isResolvingTeams && !isRevealingTeams;
  const historyRolls = pastRollsByDay && [
    ...pastRolls,
    ...(todayCounted && spin ? [{ spinDay: spin.spin_day, spinNumber: spin.spin_number, teams, xp: xpTotal }] : []),
  ];
  const lifetimeXp = pastRolls.reduce((total, roll) => total + boundedRollXp(roll.xp), 0) + (todayCounted ? boundedXpTotal : 0);
  const earnedTeams = new Set([
    ...pastRolls.flatMap((roll) => roll.teams.map((team) => team.teamNumber)),
    ...(todayCounted ? teams.map((team) => team.teamNumber) : []),
  ]);
  const lifetimeRolls = pastRolls.length + (todayCounted ? 1 : 0);
  // Only once the teams are final, so an unfinished or failed lookup isn't rated "There's Nothing.".
  const spinRarity = !isRevealingTeams && !isResolvingTeams && !error ? rollRarity(xpTotal) : null;
  const topSpinRarity = topSpin ? rollRarity(topSpin.xp) : null;

  // Achievements from any roll they've finished (today's once its teams are final, plus
  // every past one): a Mythic roll, 5026 anywhere in the number, and every on-season team
  // rolled across all their rolls put together
  const rollAchievements = useMemo(() => {
    const rolls = historyRolls ?? [];
    return {
      mythic: rolls.some((roll) => rollRarity(roll.xp).rarity === "Mythic"),
      has5026: rolls.some((roll) => roll.spinNumber.includes("5026")),
      everyTeam: !!snapshot && snapshot.size > 0 && [...snapshot.keys()].every((teamNumber) => earnedTeams.has(teamNumber)),
    };
    // historyRolls and earnedTeams are rebuilt every render; these are what they're made from
  }, [pastRollsByDay, todayCounted, spin?.spin_day, teams, xpTotal, snapshot]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (rollAchievements.mythic) void unlockAchievement(user?.id, "mythic");
    if (rollAchievements.has5026) void unlockAchievement(user?.id, "frcdle_5026");
    if (rollAchievements.everyTeam) void unlockAchievement(user?.id, "full_roll");
  }, [rollAchievements, user?.id]);

  if (showHistory) {
    return <HistoryPage rolls={historyRolls} onBack={() => setShowHistory(false)} />;
  }

  if (showLeaderboard) {
    return <LeaderboardPage onBack={() => setShowLeaderboard(false)} />;
  }

  if (showAllTeams) {
    return <AllTeamsPage snapshot={snapshot} earned={earnedTeams} onBack={() => setShowAllTeams(false)} />;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(ellipse_at_top,_rgba(14,165,233,0.12),_transparent_55%)]">
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-5 sm:px-6 sm:py-8">
        {/* Buttons pinned top-right with the reset badge under them; on phones both stack under the title. */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="sm:row-span-2">
            <div className="mb-1 flex items-center gap-2 text-sky-300">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-[0.12em]">FRC daily draw</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">frcdle</h1>
          </div>
          {/* On phones the buttons get their own row under the title, without icons so all three fit. */}
          <div className="col-span-2 flex gap-2 justify-self-start sm:col-span-1 sm:col-start-2 sm:justify-self-end">
            <Button size="sm" variant="outline" onClick={() => setShowHistory(true)}>
              <History className="mr-1 hidden h-3.5 w-3.5 sm:inline" />History
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowLeaderboard(true)}>
              <Trophy className="mr-1 hidden h-3.5 w-3.5 sm:inline" />Leaderboard
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAllTeams(true)}>
              <LayoutGrid className="mr-1 hidden h-3.5 w-3.5 sm:inline" />All teams
            </Button>
          </div>
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
          {spin && revealCount === 6 && (
            <div className="mt-4 space-y-4 border-t border-border pt-4">
              {spinRarity ? (
                <RarityLine {...spinRarity} className="justify-center" />
              ) : isRevealingTeams && (
                <p className="text-center text-xs text-muted-foreground">Rarity appears once every team is revealed.</p>
              )}
              <div className="grid grid-cols-2 gap-2 text-center sm:gap-4">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:text-xs">Combined xP</div>
                  <div className="mt-1 text-xl font-black tabular-nums sm:text-3xl">{boundedXpTotal.toFixed(1)}</div>
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:text-xs">Lifetime xP</div>
                  <div className="mt-1 text-xl font-black tabular-nums sm:text-3xl">{pastRollsByDay ? lifetimeXp.toFixed(1) : "—"}</div>
                  <div className="mt-1 text-[10px] text-muted-foreground sm:text-xs">
                    Across {lifetimeRolls} {lifetimeRolls === 1 ? "roll" : "rolls"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {!hasSpunToday && topSpin !== undefined && (
          <section className="rounded-lg border border-amber-400/30 bg-card/90 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-amber-300">
                <Trophy className="h-4 w-4" />
                <h2 className="text-xs font-bold uppercase tracking-[0.12em]">Today's top spin</h2>
              </div>
              {topSpin && <span className="truncate text-xs text-muted-foreground">by {topSpin.isYou ? "you" : topSpin.name || "Unknown player"}</span>}
            </div>
            {topSpin ? (
              <>
                <div className="mt-3 font-mono text-3xl font-black tracking-[0.2em] tabular-nums sm:text-4xl">{topSpin.spinNumber}</div>
                {topSpinRarity && <RarityLine {...topSpinRarity} className="mt-2" />}
                <div className="mt-4 border-t border-border pt-4 text-center">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:text-xs">xP gained</div>
                  <div className="mt-1 text-xl font-black tabular-nums sm:text-3xl">{boundedRollXp(topSpin.xp).toFixed(1)}</div>
                </div>
                {topSpin.teams.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {topSpin.teams.map((team) => (
                      <div key={team.teamNumber} className="flex items-center gap-3 rounded-md border border-border bg-background/40 p-2">
                        {team.logo ? (
                          <img src={team.logo} alt={`Team ${team.teamNumber} logo`} className="h-10 w-10 rounded-md bg-white object-contain p-0.5" />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground">{team.teamNumber}</div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-sky-300">FRC {team.teamNumber}</div>
                          <div className="truncate text-sm font-semibold">{team.name}</div>
                        </div>
                        <div className="font-mono text-sm font-bold tabular-nums">{(team.xp * xpMultiplier(team.teamNumber)).toFixed(1)} xP</div>
                        {team.count > 1 && <div className="shrink-0 font-mono text-sm font-black tabular-nums text-amber-300">x{team.count}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Nobody else has spun yet today.</p>
            )}
          </section>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
            {spin && <Button size="sm" variant="outline" className="ml-auto shrink-0" onClick={() => void resolveTeamResults(spin.spin_number)}><RotateCw className="mr-1 h-3.5 w-3.5" />Retry</Button>}
          </div>
        )}

        {spin && revealCount === 6 && (
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
            {/* Newest team first, so each reveal pushes the earlier ones down. */}
            {[...visibleTeams].reverse().map((team) => (
              <article
                key={team.teamNumber}
                className={`flex items-center gap-3 rounded-md border bg-card/90 p-3 transition-colors duration-300 ${isRevealingTeams ? "frcdle-card-in" : ""} ${spotlightTeam === team.teamNumber ? "border-amber-400/70" : "border-border"}`}
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
                  <div className="text-[10px] uppercase text-muted-foreground">Scored xP</div>
                  <div className="font-mono text-lg font-bold tabular-nums">{(team.xp * xpMultiplier(team.teamNumber)).toFixed(1)}</div>
                  {xpMultiplier(team.teamNumber) !== 1 && (
                    <div className="text-[10px] tabular-nums text-muted-foreground">
                      {team.xp.toFixed(1)} × {xpMultiplier(team.teamNumber)}
                    </div>
                  )}
                  <div className="text-[10px] tabular-nums text-muted-foreground">#{team.rank.toLocaleString()} of {team.rankTotal.toLocaleString()}</div>
                </div>
                {team.count > 1 && (
                  <div key={team.count} className={`shrink-0 font-mono text-lg font-black tabular-nums text-amber-300 ${isRevealingTeams ? "frcdle-team-in" : ""}`}>x{team.count}</div>
                )}
              </article>
            ))}
          </section>
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
        /* New team card grows from nothing at the top of the list, easing the others down. */
        @keyframes frcdle-card-in {
          from { opacity: 0; max-height: 0; padding-top: 0; padding-bottom: 0; transform: translateY(-6px); }
          to { opacity: 1; max-height: 120px; transform: none; }
        }
        .frcdle-card-in { overflow: hidden; animation: frcdle-card-in 400ms ease-out; }
        @keyframes frcdle-digit-land {
          from { transform: scale(1.35); }
          to { transform: scale(1); }
        }
        .frcdle-digit-land { animation: frcdle-digit-land 500ms cubic-bezier(0.2, 0.8, 0.3, 1); }
        @media (prefers-reduced-motion: reduce) { .frcdle-team-in, .frcdle-card-in, .frcdle-digit-land { animation: none; } }
      `}</style>
    </div>
  );
}