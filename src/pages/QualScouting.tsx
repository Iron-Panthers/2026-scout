import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, GripVertical, ArrowLeft } from "lucide-react";
import { getMatchTeam } from "@/lib/blueAlliance";
import { ScoutingReducer, type QualScoutingData } from "@/lib/ScoutingReducer";
import { TeamImage } from "@/components/TeamImage";
import { Loader2 } from "lucide-react";
import { compressState } from "@/lib/stateCompression";

// Row height used for drag hit-test
const ROW_HEIGHT = 96; // px, must match rendered height
const ROW_GAP = 8; // px, matches gap-2
const ROW_SLOT = ROW_HEIGHT + ROW_GAP;

interface DragState {
  dragging: boolean;
  dragIndex: number;
  startY: number;
  currentY: number;
}

export default function QualScouting() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const matchId = searchParams.get("match_id") || "";
  const role = searchParams.get("role") || "qualRed";
  const eventCode = searchParams.get("event_code") || "";
  const matchNumber = parseInt(searchParams.get("match_number") || "0");
  const manualTeam1 = parseInt(searchParams.get("team1") || "0");
  const manualTeam2 = parseInt(searchParams.get("team2") || "0");
  const manualTeam3 = parseInt(searchParams.get("team3") || "0");
  const hasManualTeams = manualTeam1 > 0 || manualTeam2 > 0 || manualTeam3 > 0;

  const alliance = role === "qualRed" ? "red" : "blue";

  // Reducer state
  const reducerRef = useRef<ScoutingReducer<QualScoutingData> | null>(null);
  const [state, setState] = useState<QualScoutingData | null>(null);
  const [loading, setLoading] = useState(true);

  // Fixed color index per team — assigned once at load, never changes with position
  const teamColorIndex = useRef<Record<number, number>>({});

  // ── Load team numbers from URL params or TBA ────────────────────────────
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        let teamNumbers: number[];
        if (hasManualTeams) {
          // Use manually entered team numbers from config page
          teamNumbers = [manualTeam1, manualTeam2, manualTeam3];
        } else {
          // Fetch from TBA, falling back to 0 per slot
          teamNumbers = [];
          for (let i = 1; i <= 3; i++) {
            const roleName = `${alliance}${i}`;
            const teamNum = await getMatchTeam(eventCode, matchNumber, roleName);
            teamNumbers.push(teamNum ?? 0);
          }
        }
        if (!mounted) return;
        const initialState = ScoutingReducer.createQualInitialState(
          matchId,
          role,
          eventCode,
          matchNumber,
          teamNumbers
        );
        const reducer = new ScoutingReducer<QualScoutingData>(initialState);
        reducerRef.current = reducer;
        initialState.rankings.forEach((t, i) => { teamColorIndex.current[t] = i; });
        setState(initialState);
      } catch (err) {
        console.error("Failed to load team numbers:", err);
        if (!mounted) return;
        // Fall back to manual teams or zeros
        const fallback = ScoutingReducer.createQualInitialState(
          matchId,
          role,
          eventCode,
          matchNumber,
          hasManualTeams ? [manualTeam1, manualTeam2, manualTeam3] : [0, 0, 0]
        );
        reducerRef.current = new ScoutingReducer<QualScoutingData>(fallback);
        fallback.rankings.forEach((t, i) => { teamColorIndex.current[t] = i; });
        setState(fallback);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Helper: dispatch a SET action and sync React state
  const dispatchSet = useCallback((path: string, value: unknown) => {
    if (!reducerRef.current) return;
    const next = reducerRef.current.reduce({ type: "SET", payload: { path, value } });
    setState(next);
  }, []);

  // ── Drag-and-drop state ─────────────────────────────────────────────────
  const [drag, setDrag] = useState<DragState>({
    dragging: false,
    dragIndex: -1,
    startY: 0,
    currentY: 0,
  });

  const listRef = useRef<HTMLDivElement>(null);

  const onDragPointerDown = useCallback(
    (e: React.PointerEvent, index: number) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setDrag({
        dragging: true,
        dragIndex: index,
        startY: e.clientY,
        currentY: e.clientY,
      });
    },
    []
  );

  const onDragPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag.dragging) return;
      setDrag((d) => ({ ...d, currentY: e.clientY }));
    },
    [drag.dragging]
  );

  const onDragPointerUp = useCallback(() => {
    if (!drag.dragging || !state) return;

    const delta = drag.currentY - drag.startY;
    const steps = Math.round(delta / ROW_SLOT);
    const newIndex = Math.max(
      0,
      Math.min(state.rankings.length - 1, drag.dragIndex + steps)
    );

    if (newIndex !== drag.dragIndex) {
      const newRankings = [...state.rankings];
      const [moved] = newRankings.splice(drag.dragIndex, 1);
      newRankings.splice(newIndex, 0, moved);
      dispatchSet("rankings", newRankings);
    }

    setDrag({ dragging: false, dragIndex: -1, startY: 0, currentY: 0 });
  }, [drag, state, dispatchSet]);

  // ── Finish ──────────────────────────────────────────────────────────────
  const handleFinish = () => {
    if (!state) return;
    navigate(`/review/${compressState(state)}?type=qual`);
  };

  // ── Row gradient colours ─────────────────────────────────────────────────
  const rowBg = ["bg-emerald-500/20", "bg-amber-400/20", "bg-rose-500/20"];
  const rowBorder = ["border-emerald-500/40", "border-amber-400/40", "border-rose-500/40"];

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading || !state) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const headerLabel = `Match ${matchNumber} — teams: ${state.rankings.join(", ")}`;

  return (
    <div
      className="h-screen w-screen flex flex-col select-none touch-none overflow-hidden bg-background"
      onPointerMove={onDragPointerMove}
      onPointerUp={onDragPointerUp}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="h-12 border-b border-border flex items-center px-4 shrink-0 bg-card gap-2">
        <button
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
          onPointerDown={(e) => { e.preventDefault(); navigate("/dashboard"); }}
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="font-medium">Dashboard</span>
        </button>
        <span className="font-semibold text-sm truncate">{headerLabel}</span>
        <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0">
          {role}
        </span>
      </div>

      {/* ── Main area ───────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Left label column */}
        <div className="w-8 flex flex-col items-center justify-between py-3 shrink-0 border-r border-border">
          <span
            className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 tracking-widest"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            BEST
          </span>
          <div className="flex-1 w-px bg-border mx-auto my-1" />
          <span
            className="text-[10px] font-bold text-rose-600 dark:text-rose-400 tracking-widest"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            WORST
          </span>
        </div>

        {/* Team ranking list */}
        <div
          ref={listRef}
          className="flex-1 flex flex-col py-2 px-3 gap-2 overflow-hidden"
        >
          {(() => {
            const ghostIndex = drag.dragging
              ? Math.max(0, Math.min(state.rankings.length - 1,
                  drag.dragIndex + Math.round((drag.currentY - drag.startY) / ROW_SLOT)))
              : -1;

            return state.rankings.map((teamNum, index) => {
            const isDraggingThis = drag.dragging && drag.dragIndex === index;
            let translateY = 0;
            if (isDraggingThis) {
              translateY = drag.currentY - drag.startY;
            } else if (drag.dragging) {
              const di = drag.dragIndex;
              if (di < ghostIndex && index > di && index <= ghostIndex) {
                translateY = -ROW_SLOT;
              } else if (di > ghostIndex && index >= ghostIndex && index < di) {
                translateY = ROW_SLOT;
              }
            }
            const opts = state.teamOptions[String(teamNum)] ?? {
              outpostFed: false,
              passed: false,
            };

            return (
              <div
                key={teamNum}
                style={{
                  transform: `translateY(${translateY}px)`,
                  zIndex: isDraggingThis ? 10 : 1,
                  transition: isDraggingThis ? "none" : "transform 0.15s ease",
                  height: ROW_HEIGHT,
                }}
                className={`relative flex items-center gap-3 px-3 rounded-xl border-2 cursor-grab active:cursor-grabbing touch-none
                  ${rowBg[teamColorIndex.current[teamNum] ?? index]} ${rowBorder[teamColorIndex.current[teamNum] ?? index]}
                  ${isDraggingThis ? "shadow-2xl scale-[1.02] opacity-95" : ""}
                `}
                onPointerDown={(e) => onDragPointerDown(e, index)}
              >
                {/* Drag handle (visual only) */}
                <div className="shrink-0 text-muted-foreground pointer-events-none">
                  <GripVertical className="w-5 h-5" />
                </div>

                {/* Rank badge */}
                <span className="text-xs font-bold text-muted-foreground w-4 shrink-0">
                  {index + 1}
                </span>

                {/* Team photo */}
                <div className="w-14 h-14 rounded-lg overflow-hidden border border-border shrink-0">
                  <TeamImage
                    teamNumber={teamNum}
                    className="w-full h-full object-cover"
                    fallbackClassName="w-full h-full flex items-center justify-center bg-muted"
                  />
                </div>

                {/* Team number */}
                <span className="text-2xl font-black tabular-nums flex-1 min-w-0 truncate">
                  {teamNum || "?"}
                </span>

                {/* Toggle buttons */}
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button
                    className={`px-3 py-1 rounded-md text-xs font-semibold border transition-colors
                      ${opts.outpostFed
                        ? "bg-violet-500 text-white border-violet-500"
                        : "bg-transparent text-muted-foreground border-border"
                      }`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      dispatchSet(`teamOptions.${teamNum}.outpostFed`, !opts.outpostFed);
                    }}
                  >
                    Outpost Fed
                  </button>
                  <button
                    className={`px-3 py-1 rounded-md text-xs font-semibold border transition-colors
                      ${opts.passed
                        ? "bg-sky-500 text-white border-sky-500"
                        : "bg-transparent text-muted-foreground border-border"
                      }`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      dispatchSet(`teamOptions.${teamNum}.passed`, !opts.passed);
                    }}
                  >
                    Passed
                  </button>
                </div>
              </div>
            );
          });
          })()}
        </div>

        {/* Right finish panel */}
        <div className="w-24 flex flex-col shrink-0 border-l border-border">
          <button
            className="flex-1 flex flex-col items-center justify-center gap-2
              bg-violet-100 dark:bg-violet-950/50
              hover:bg-violet-200 dark:hover:bg-violet-900/60
              active:bg-violet-300 dark:active:bg-violet-900/70
              text-violet-700 dark:text-violet-300 transition-colors"
            onPointerDown={(e) => { e.preventDefault(); handleFinish(); }}
          >
            <Check className="w-7 h-7" />
            <span className="text-sm font-semibold">Finish</span>
          </button>
        </div>
      </div>
    </div>
  );
}
