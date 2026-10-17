import { useEffect, useMemo, useRef, useState } from "react";
import { geoAlbersUsa, geoContains, geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";
import { Minus, Plus, RotateCcw } from "lucide-react";
import statesUrl from "us-atlas/states-10m.json?url";
import { Button } from "@/components/ui/button";
import { getEventCoordinates, type EventCoordinates, type ScoutedEvent } from "@/lib/scoutingHistory";
import { SEASON_GAME_PIECES } from "@/config/gamePieces";

const WIDTH = 960;
const HEIGHT = 600;
const MIN_ZOOM = 1;
const MAX_ZOOM = 12;
const CALIFORNIA_ID = "06";
const DOT_RADIUS = 5;
/** Zoom step for the +/- buttons, and how strongly the scroll wheel zooms. */
const BUTTON_ZOOM_FACTOR = 2.5;
const WHEEL_ZOOM_SPEED = 0.004;

type StateFeature = Feature<Geometry, { name: string }>;
type Mode = "us" | "california";
interface View {
  k: number;
  x: number;
  y: number;
}
const RESET_VIEW: View = { k: 1, x: 0, y: 0 };

/** Parses a "YYYY-MM-DD" date as a local date (not UTC midnight, which can shift the day). */
function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

/** "Mar 6–8, 2026", "Mar 30 – Apr 1, 2026", or just the start date. */
function formatEventDates(start: string | null, end: string | null): string {
  const from = parseDate(start);
  const to = parseDate(end);
  if (!from) return "Date unknown";
  const day = (date: Date, withYear: boolean) =>
    date.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });
  if (!to || to.getTime() === from.getTime()) return day(from, true);
  if (from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth()) {
    return `${day(from, false)}–${to.getDate()}, ${to.getFullYear()}`;
  }
  return `${day(from, false)} – ${day(to, true)}`;
}

/** The season an event belongs to: from its start date, else its event code ("2026casj"). */
function eventYear(event: ScoutedEvent): number | null {
  const fromDate = parseDate(event.startDate)?.getFullYear();
  if (fromDate) return fromDate;
  const fromCode = event.eventCode?.match(/^(\d{4})/)?.[1];
  return fromCode ? Number(fromCode) : null;
}

/** Dots are coloured by the season's main game piece; seasons we don't know use the theme colour. */
function eventColor(event: ScoutedEvent): string {
  const year = eventYear(event);
  return (year && SEASON_GAME_PIECES[year]?.color) || "var(--primary)";
}

function scoutedSummary(event: ScoutedEvent): string {
  if (event.matchesScouted !== null) {
    return `${event.matchesScouted} match${event.matchesScouted === 1 ? "" : "es"} scouted`;
  }
  // Rows saved before matches were tracked only know the total submissions
  return `${event.submissions} submission${event.submissions === 1 ? "" : "s"}`;
}

interface PlacedDot {
  event: ScoutedEvent;
  x: number;
  y: number;
}

/**
 * A map of the US (or just California) with a dot at every event the scouter scouted at.
 * Scroll / pinch or the buttons to zoom, drag to pan, hover or tap a dot for details.
 */
export function ScoutingMap({ events }: { events: ScoutedEvent[] }) {
  const [states, setStates] = useState<FeatureCollection<Geometry, { name: string }> | null>(null);
  const [coords, setCoords] = useState<Map<string, EventCoordinates | null>>(new Map());
  const [mode, setMode] = useState<Mode>("us");
  const [view, setView] = useState<View>(RESET_VIEW);
  const [hovered, setHovered] = useState<{ event: ScoutedEvent; left: number; top: number; width: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragged = useRef(false);

  // State shapes (bundled with the app, loaded on demand)
  useEffect(() => {
    let cancelled = false;
    fetch(statesUrl)
      .then((response) => response.json())
      .then((topology: Topology<{ states: GeometryCollection<{ name: string }> }>) => {
        if (cancelled) return;
        setStates(feature(topology, topology.objects.states) as FeatureCollection<Geometry, { name: string }>);
      })
      .catch((error) => console.error("Could not load the US map:", error));
    return () => {
      cancelled = true;
    };
  }, []);

  // Where each event was held
  useEffect(() => {
    let cancelled = false;
    Promise.all(events.map(async (event) => [event.key, await getEventCoordinates(event)] as const)).then((entries) => {
      if (!cancelled) setCoords(new Map(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [events]);

  // Still looking up locations until every event has an answer (even "unknown")
  const locating = events.some((event) => !coords.has(event.key));

  // Seasons on the map, newest first, for the legend
  const seasons = useMemo(() => {
    const years = new Set<number>();
    events.forEach((event) => {
      const year = eventYear(event);
      if (year) years.add(year);
    });
    return [...years].sort((a, b) => b - a);
  }, [events]);

  const california = useMemo(
    () => (states?.features.find((state) => state.id === CALIFORNIA_ID) as StateFeature | undefined) ?? null,
    [states]
  );

  const projection = useMemo(() => {
    if (!states) return null;
    if (mode === "california" && california) {
      return geoMercator().fitExtent([[40, 20], [WIDTH - 40, HEIGHT - 20]], california);
    }
    return geoAlbersUsa().fitExtent([[10, 10], [WIDTH - 10, HEIGHT - 10]], states);
  }, [states, mode, california]);

  const path = useMemo(() => (projection ? geoPath(projection) : null), [projection]);
  const shapes = mode === "california" ? (california ? [california] : []) : (states?.features ?? []);

  const dots = useMemo(() => {
    if (!projection) return [];
    const placed: PlacedDot[] = [];
    for (const event of events) {
      const at = coords.get(event.key);
      if (!at) continue;
      if (mode === "california" && at.state !== "CA" && !(california && geoContains(california, [at.lng, at.lat]))) continue;
      const point = projection([at.lng, at.lat]);
      if (point) placed.push({ event, x: point[0], y: point[1] });
    }
    // Events in the same city would sit on top of each other: fan them out in a small ring
    const groups = new Map<string, PlacedDot[]>();
    for (const dot of placed) {
      const cell = `${Math.round(dot.x / 6)},${Math.round(dot.y / 6)}`;
      groups.set(cell, [...(groups.get(cell) ?? []), dot]);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const ring = 7;
      group.forEach((dot, i) => {
        const angle = (i / group.length) * Math.PI * 2 - Math.PI / 2;
        dot.x += Math.cos(angle) * ring;
        dot.y += Math.sin(angle) * ring;
      });
    }
    return placed;
  }, [events, coords, projection, mode, california]);

  // Events with no known location, and ones located but outside the map (abroad, or outside California)
  const unplaced = locating ? 0 : events.filter((event) => !coords.get(event.key)).length;
  const offMap = locating ? 0 : events.length - unplaced - dots.length;

  /** A point on screen, in the map's own (unzoomed) coordinates. */
  function toSvgPoint(clientX: number, clientY: number): { x: number; y: number } {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }

  /** Zooms by `factor`, keeping the map point under (`px`, `py`) fixed. */
  function zoomAt(factor: number, px: number, py: number) {
    setView((current) => {
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.k * factor));
      if (k === MIN_ZOOM) return RESET_VIEW;
      const ratio = k / current.k;
      return { k, x: px - (px - current.x) * ratio, y: py - (py - current.y) * ratio };
    });
  }

  // Wheel zoom needs a non-passive listener so the page doesn't scroll at the same time
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const point = toSvgPoint(e.clientX, e.clientY);
      zoomAt(Math.exp(-e.deltaY * WHEEL_ZOOM_SPEED), point.x, point.y);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  });

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, toSvgPoint(e.clientX, e.clientY));
    dragged.current = false;
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const previous = pointers.current.get(e.pointerId);
    if (!previous) return;
    const point = toSvgPoint(e.clientX, e.clientY);
    if (pointers.current.size === 2) {
      // Pinch: zoom by the change in distance between the two fingers, around their midpoint
      const [other] = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId).map(([, p]) => p);
      const before = Math.hypot(previous.x - other.x, previous.y - other.y);
      const after = Math.hypot(point.x - other.x, point.y - other.y);
      if (before > 0) zoomAt(after / before, (point.x + other.x) / 2, (point.y + other.y) / 2);
    } else {
      const dx = point.x - previous.x;
      const dy = point.y - previous.y;
      if (Math.abs(dx) + Math.abs(dy) > 1) dragged.current = true;
      setView((current) => (current.k === 1 ? current : { ...current, x: current.x + dx, y: current.y + dy }));
    }
    pointers.current.set(e.pointerId, point);
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId);
  }

  function showTooltip(event: ScoutedEvent, clientX: number, clientY: number) {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    setHovered({ event, left: clientX - box.left, top: clientY - box.top, width: box.width });
  }

  function switchMode(next: Mode) {
    setMode(next);
    setView(RESET_VIEW);
    setHovered(null);
  }


  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg border border-border p-1">
          <Button size="sm" variant={mode === "us" ? "default" : "ghost"} onClick={() => switchMode("us")}>
            United States
          </Button>
          <Button size="sm" variant={mode === "california" ? "default" : "ghost"} onClick={() => switchMode("california")}>
            California
          </Button>
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Zoom in" onClick={() => zoomAt(BUTTON_ZOOM_FACTOR, WIDTH / 2, HEIGHT / 2)}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Zoom out" onClick={() => zoomAt(1 / BUTTON_ZOOM_FACTOR, WIDTH / 2, HEIGHT / 2)}>
            <Minus className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Reset zoom" onClick={() => setView(RESET_VIEW)} disabled={view.k === 1}>
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-lg border border-border bg-background"
        onPointerLeave={() => setHovered(null)}
      >
        {!states ? (
          <div className="flex aspect-[8/5] items-center justify-center text-sm text-muted-foreground">Loading map...</div>
        ) : (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className={`block h-auto w-full touch-none select-none ${view.k > 1 ? "cursor-grab active:cursor-grabbing" : ""}`}
            role="img"
            aria-label={`Map of events scouted${mode === "california" ? " in California" : ""}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClick={() => {
              if (!dragged.current) setHovered(null);
            }}
          >
            <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
              {shapes.map((state) => (
                <path
                  key={String(state.id)}
                  d={path?.(state) ?? undefined}
                  fill="var(--muted)"
                  stroke="var(--border)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {dots.map(({ event, x, y }) => {
                const active = hovered?.event.key === event.key;
                return (
                  <circle
                    key={event.key}
                    cx={x}
                    cy={y}
                    // Constant size on screen at any zoom
                    r={((active ? 1.5 : 1) * DOT_RADIUS) / view.k}
                    fill={eventColor(event)}
                    // Dark outline so light piece colours (e.g. white Coral) show on any theme
                    stroke="rgba(0,0,0,0.65)"
                    strokeWidth={1.25}
                    vectorEffect="non-scaling-stroke"
                    className="cursor-pointer"
                    onPointerEnter={(e) => e.pointerType === "mouse" && showTooltip(event, e.clientX, e.clientY)}
                    onPointerMove={(e) => e.pointerType === "mouse" && showTooltip(event, e.clientX, e.clientY)}
                    onPointerLeave={(e) => e.pointerType === "mouse" && setHovered(null)}
                    onClick={(e) => {
                      // Taps (touch) toggle the tooltip; a click shouldn't also clear it
                      e.stopPropagation();
                      if (!dragged.current) showTooltip(event, e.clientX, e.clientY);
                    }}
                  />
                );
              })}
            </g>
          </svg>
        )}

        {hovered && (
          <div
            className="pointer-events-none absolute z-10 max-w-[220px] rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
            style={{
              // Beside the cursor, but kept inside the map
              left: Math.max(4, Math.min(hovered.left + 12, hovered.width - 230)),
              top: Math.max(hovered.top - 70, 4),
            }}
          >
            <p className="font-semibold leading-snug">{hovered.event.name}</p>
            <p className="text-muted-foreground">{formatEventDates(hovered.event.startDate, hovered.event.endDate)}</p>
            {(() => {
              const year = eventYear(hovered.event);
              const season = year ? SEASON_GAME_PIECES[year] : undefined;
              return season ? <p className="text-muted-foreground">{year} · {season.game}</p> : null;
            })()}
            <p className="mt-1 font-medium">{scoutedSummary(hovered.event)}</p>
          </div>
        )}
      </div>

      {/* Legend: one entry per season, coloured by its main game piece */}
      {seasons.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          {seasons.map((year) => {
            const season = SEASON_GAME_PIECES[year];
            return (
              <div key={year} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ background: season?.color ?? "var(--primary)", border: "1px solid rgba(0,0,0,0.65)" }}
                />
                <span className="font-medium">{year}</span>
                {season && <span className="text-muted-foreground">{season.game}</span>}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {locating
          ? "Finding event locations..."
          : `${dots.length} event${dots.length === 1 ? "" : "s"} shown`}
        {offMap > 0 && ` · ${offMap} outside ${mode === "california" ? "California" : "the US"}`}
        {unplaced > 0 && ` · ${unplaced} with no known location`}
        {" · Scroll or pinch to zoom, drag to pan."}
      </p>
    </div>
  );
}
