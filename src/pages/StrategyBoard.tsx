import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronRight, Loader2, PencilRuler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import UserProfileMenu from "@/components/UserProfileMenu";
import { StrategyFieldBoard } from "@/components/StrategyFieldBoard";
import { useAuth } from "@/contexts/AuthContext";
import { useDevMode } from "@/contexts/DevModeContext";
import { useGoBack } from "@/hooks/useGoBack";
import { useToast } from "@/hooks/use-toast";
import { useUrlState } from "@/hooks/useUrlState";
import type { Event } from "@/types";
import {
  BOARD_PAGES,
  OUR_TEAM,
  eventForMatchKey,
  getBoardEvents,
  getOurMatches,
  hasDrawing,
  loadBoard,
  saveBoard,
  type BoardMatch,
  type BoardPage,
  type BoardPageKey,
  type OurMatch,
} from "@/lib/strategyBoard";
import { mainTeamNumber, type MatchTeam } from "@/lib/strategyData";

/** The strategy board: our matches at an event, and a drawing board for each. */
export default function StrategyBoard() {
  const { matchKey } = useParams();
  const { user } = useAuth();
  // Each user has their own boards (guests share one); null for guests
  const userId = user?.id ?? null;
  // Keyed so another match's (or user's) board starts fresh
  return matchKey ? <MatchBoard key={`${userId}:${matchKey}`} userId={userId} matchKey={matchKey} /> : <MatchList userId={userId} />;
}

/** The sandbox's owner while dev mode is on (its events stand in for the real ones); null otherwise. */
function useSandboxUserId() {
  const { user } = useAuth();
  const { devMode } = useDevMode();
  return devMode && user?.id ? user.id : null;
}

/** The events to choose from and the one to start on (unless not `enabled`); null until loaded. */
function useBoardEvents(enabled = true) {
  const sandboxUserId = useSandboxUserId();
  const [loaded, setLoaded] = useState<{ for: string | null; events: Event[]; initialId: string | null } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getBoardEvents(sandboxUserId)
      .then((result) => { if (!cancelled) setLoaded({ for: sandboxUserId, ...result }); })
      .catch((error) => {
        console.error("Could not load the strategy board's events:", error);
        if (!cancelled) setLoaded({ for: sandboxUserId, events: [], initialId: null });
      });
    return () => {
      cancelled = true;
    };
  }, [sandboxUserId, enabled]);

  // Switching dev mode shows the loading state until the other events arrive
  return loaded && loaded.for === sandboxUserId ? loaded : null;
}

/** Our matches at `event`; null until loaded (or without an event). */
function useOurMatches(event: Event | null) {
  const sandboxUserId = useSandboxUserId();
  const [loaded, setLoaded] = useState<{ for: string; matches: OurMatch[]; failed: boolean } | null>(null);
  const loadKey = event ? `${sandboxUserId}:${event.id}` : null;

  useEffect(() => {
    if (!event) return;
    let cancelled = false;
    const key = `${sandboxUserId}:${event.id}`;
    getOurMatches(event, sandboxUserId)
      .then((matches) => { if (!cancelled) setLoaded({ for: key, matches, failed: false }); })
      .catch((error) => {
        console.error("Could not load the strategy board's matches:", error);
        if (!cancelled) setLoaded({ for: key, matches: [], failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [event, sandboxUserId]);

  // Another event shows the loading state until its matches arrive
  return loaded && loaded.for === loadKey ? loaded : null;
}

function TeamList({ teams, color }: { teams: MatchTeam[]; color: "red" | "blue" }) {
  return (
    <span
      className={`grid grid-cols-3 rounded-md px-2 py-1 text-center font-mono text-xs tabular-nums text-white sm:text-sm ${
        color === "red" ? "bg-red-700" : "bg-blue-700"
      }`}
    >
      {teams.map((team) => (
        <span key={team} className={`px-1 ${mainTeamNumber(team) === OUR_TEAM ? "font-bold underline decoration-2 underline-offset-2" : ""}`}>
          {team}
        </span>
      ))}
    </span>
  );
}

/** Embeddable match list for the strategy board: event selector + our team's matches. */
export function BoardMatchList({ userId }: { userId: string | null }) {
  const navigate = useNavigate();
  const boardEvents = useBoardEvents();
  const eventIds = useMemo(() => boardEvents?.events.map((event) => event.id) ?? [], [boardEvents]);
  const [eventId, setEventId] = useUrlState("event", boardEvents?.initialId ?? "", eventIds);
  const event = boardEvents?.events.find((item) => item.id === eventId) ?? null;
  const loaded = useOurMatches(event);

  const open = (match: OurMatch) => {
    const boardMatch: BoardMatch = { name: match.name, red: match.red, blue: match.blue };
    navigate(`/strategy-board/${encodeURIComponent(match.key)}`, { state: { match: boardMatch } });
  };

  let body;
  if (boardEvents && !event) {
    body = <p className="text-center text-sm text-muted-foreground">There are no events yet.</p>;
  } else if (!loaded) {
    body = (
      <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading matches...
      </p>
    );
  } else if (loaded.failed) {
    body = <p className="text-center text-sm text-destructive">Couldn't load the match schedule. Check your connection and try again.</p>;
  } else if (loaded.matches.length === 0) {
    body = <p className="text-center text-sm text-muted-foreground">{OUR_TEAM} has no matches scheduled at {event?.name} yet.</p>;
  } else {
    body = (
      <ul className="space-y-2">
        {loaded.matches.map((match) => (
          <li key={match.key}>
            <button
              type="button"
              onClick={() => open(match)}
              className="flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent/50"
            >
              <span className="w-28 shrink-0">
                <span className="block text-sm font-semibold">{match.name}</span>
                {hasDrawing(userId, match.key) && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <PencilRuler className="h-3 w-3" />
                    Has a plan
                  </span>
                )}
              </span>
              <span className="grid min-w-0 flex-1 gap-1 sm:grid-cols-2">
                <TeamList teams={match.red} color="red" />
                <TeamList teams={match.blue} color="blue" />
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Select value={eventId} onValueChange={setEventId} disabled={!boardEvents || boardEvents.events.length === 0}>
        <SelectTrigger className="mb-4 w-full" aria-label="Event">
          <SelectValue placeholder="Select event" />
        </SelectTrigger>
        <SelectContent>
          {boardEvents?.events.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {body}
    </div>
  );
}

function MatchList({ userId }: { userId: string | null }) {
  const { user, profile, getAvatarUrl } = useAuth();
  const userName = profile?.name || user?.user_metadata?.name || user?.email?.split("@")[0] || "Scout";
  const userInitials = userName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="min-h-screen bg-background my-5">
      <main className="container mx-auto max-w-3xl p-6">
        <div className="mb-8 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <PencilRuler className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Strategy Board</h1>
              <p className="text-sm text-muted-foreground">Plan each of {OUR_TEAM}'s matches</p>
            </div>
          </div>
          <UserProfileMenu userName={userName} userInitials={userInitials} avatarUrl={getAvatarUrl()} />
        </div>
        <BoardMatchList userId={userId} />
      </main>
    </div>
  );
}

/** A page's undo and redo: its earlier versions (latest last) and the ones undone (next first). */
interface PageHistory {
  past: BoardPage[];
  future: BoardPage[];
  /** The gesture (e.g. an eraser drag) the last change was part of, so the rest of it undoes with it. */
  group: string | null;
}

const NO_HISTORY: PageHistory = { past: [], future: [], group: null };
/** How many changes back each page can undo. */
const UNDO_LIMIT = 100;

/** A user's board for one match: a page for each part of the match, saved in this browser. */
function MatchBoard({ userId, matchKey }: { userId: string | null; matchKey: string }) {
  const goBack = useGoBack("/strategy-board");
  const location = useLocation();
  const { toast } = useToast();
  // The board and each page's undo history (for this visit), together so a change updates both at once
  const [{ board, history }, setState] = useState(() => ({
    board: loadBoard(userId, matchKey),
    history: {} as Partial<Record<BoardPageKey, PageHistory>>,
  }));
  const [pageKey, setPageKey] = useState<BoardPageKey>("auto");
  const pageHistory = history[pageKey] ?? NO_HISTORY;

  // The match from the list, else what was saved with the drawings (so it opens offline),
  // else from the schedule (a link opened directly)
  const fromList = (location.state as { match?: BoardMatch } | null)?.match ?? null;
  const needsSchedule = !fromList && !board.match;
  const boardEvents = useBoardEvents(needsSchedule);
  const matchEvent = (boardEvents && eventForMatchKey(boardEvents.events, matchKey)) ?? null;
  const loaded = useOurMatches(needsSchedule ? matchEvent : null);
  const fromSchedule = loaded?.matches.find((match) => match.key === matchKey) ?? null;
  const match = useMemo<BoardMatch | null>(
    () => fromList ?? board.match ?? (fromSchedule && { name: fromSchedule.name, red: fromSchedule.red, blue: fromSchedule.blue }),
    [fromList, board.match, fromSchedule]
  );

  useEffect(() => {
    if (!saveBoard(userId, matchKey, { ...board, match })) {
      toast({ title: "Couldn't save the drawing", description: "This browser's storage is full.", variant: "destructive" });
    }
  }, [userId, matchKey, board, match, toast]);

  const updatePage = useCallback(
    (update: (page: BoardPage) => BoardPage, group?: string) =>
      setState((current) => {
        const page = current.board.pages[pageKey];
        const next = update(page);
        if (next === page) return current;
        const { past, group: lastGroup } = current.history[pageKey] ?? NO_HISTORY;
        return {
          board: { ...current.board, pages: { ...current.board.pages, [pageKey]: next } },
          history: {
            ...current.history,
            // The rest of a gesture joins the change it started with; any new change ends what can be redone
            [pageKey]: { past: group && group === lastGroup ? past : [...past, page].slice(-UNDO_LIMIT), future: [], group: group ?? null },
          },
        };
      }),
    [pageKey]
  );

  /** Undoes the page's last change, or redoes its last undone one. */
  const step = useCallback(
    (direction: "undo" | "redo") =>
      setState((current) => {
        const { past, future } = current.history[pageKey] ?? NO_HISTORY;
        const page = current.board.pages[pageKey];
        const to = direction === "undo" ? past.at(-1) : future[0];
        if (!to) return current;
        return {
          board: { ...current.board, pages: { ...current.board.pages, [pageKey]: to } },
          history: {
            ...current.history,
            [pageKey]: direction === "undo"
              ? { past: past.slice(0, -1), future: [page, ...future], group: null }
              : { past: [...past, page], future: future.slice(1), group: null },
          },
        };
      }),
    [pageKey]
  );
  const undo = useCallback(() => step("undo"), [step]);
  const redo = useCallback(() => step("redo"), [step]);

  const header = (
    <div className="flex items-center gap-1.5">
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goBack} aria-label="Back" title="Back">
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <h1 className="whitespace-nowrap text-sm font-semibold sm:text-base">{match?.name ?? "Strategy Board"}</h1>
      <div className="flex gap-0.5 rounded-md border bg-card p-0.5">
        {BOARD_PAGES.map((page) => (
          <Button
            key={page.key}
            size="sm"
            variant={pageKey === page.key ? "default" : "ghost"}
            className="h-7 px-2 text-xs"
            onClick={() => setPageKey(page.key)}
            aria-pressed={pageKey === page.key}
          >
            {page.label}
          </Button>
        ))}
      </div>
    </div>
  );

  return (
    // Exactly the screen's height (less the notch's padding on the body), so the field can take what the bar leaves
    <main className="flex h-[calc(100dvh-env(safe-area-inset-top))] flex-col gap-2 bg-background p-2 sm:p-3">
      {match ? (
        <StrategyFieldBoard
          leading={header}
          pageKey={pageKey}
          page={board.pages[pageKey]}
          onChange={updatePage}
          canUndo={pageHistory.past.length > 0}
          canRedo={pageHistory.future.length > 0}
          onUndo={undo}
          onRedo={redo}
          red={match.red}
          blue={match.blue}
        />
      ) : (
        <>
          {header}
          {loaded || (boardEvents && !matchEvent) ? (
            <p className="text-center text-sm text-muted-foreground">Couldn't find this match.</p>
          ) : (
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading match...
            </p>
          )}
        </>
      )}
    </main>
  );
}
