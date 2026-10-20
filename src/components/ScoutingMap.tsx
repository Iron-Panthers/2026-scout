import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { geoAlbersUsa, geoContains, geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";
import { Minus, Plus, RotateCcw } from "lucide-react";
import statesUrl from "us-atlas/states-10m.json?url";
import { Button } from "@/components/ui/button";
import {
  getEventCoordinates,
  getEventDisplayName,
  withoutYear,
  type EventCoordinates,
  type ScoutedEvent,
} from "@/lib/scoutingHistory";
import { SEASON_GAME_PIECES } from "@/config/gamePieces";

const WIDTH = 960;
const HEIGHT = 600;
const MIN_ZOOM = 1;
const MAX_ZOOM = 12;
const CALIFORNIA_ID = "06";
const DOT_RADIUS = 5;
/** Zoom step for the +/- buttons. */
const BUTTON_ZOOM_FACTOR = 2.5;
/**
 * How strongly every zoom gesture zooms, relative to its natural rate, so scrolling and
 * pinching feel the same: 1 = natural (pinch follows your fingers exactly), 2.5 = each
 * gesture zooms 2.5× as far (in log scale).
 */
const ZOOM_SENSITIVITY = 2.5;
// Natural rates: a mouse-wheel notch (~100px) zooms about 1.17×; a trackpad pinch arrives
// as a ctrl+wheel whose natural scale is e^(-deltaY / 100) (what browsers use themselves).
const NATURAL_WHEEL_RATE = 0.0016;
const NATURAL_TRACKPAD_PINCH_RATE = 0.01;

/** A wheel event's vertical scroll in pixels, whether the browser reports pixels, lines or pages. */
function wheelPixels(e: WheelEvent): number {
  if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) return e.deltaY * 33;
  if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) return e.deltaY * 800;
  return e.deltaY;
}

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

/** The tooltip's "N matches scouted" line; null when there's nothing to say (an added event with no count). */
function scoutedSummary(event: ScoutedEvent): string | null {
  if (event.matchesScouted !== null) {
    return `${event.matchesScouted} match${event.matchesScouted === 1 ? "" : "es"} scouted`;
  }
  if (event.addedByScouter) return null;
  // Rows saved before matches were tracked only know the total submissions
  return `${event.submissions} submission${event.submissions === 1 ? "" : "s"}`;
}

/** One dot on the map: every event held at (about) the same place, newest first. */
interface PlacedDot {
  key: string;
  events: ScoutedEvent[];
  x: number;
  y: number;
}

/** Events closer together than this share one dot (same venue or city, e.g. a championship's divisions). */
const SAME_PLACE_KM = 1;

function distanceKm(a: EventCoordinates, b: EventCoordinates): number {
  const kmPerDegree = 111.32;
  const dLat = (a.lat - b.lat) * kmPerDegree;
  const dLng = (a.lng - b.lng) * kmPerDegree * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLng);
}

/** A pie slice from angle a0 to a1 (radians, 0 = up), for dots shared by several seasons. */
function wedgePath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const point = (a: number) => `${cx + r * Math.sin(a)},${cy - r * Math.cos(a)}`;
  return `M${cx},${cy} L${point(a0)} A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${point(a1)} Z`;
}

/**
 * A map of the US (or just California) with a dot at every event the scouter scouted at.
 * Scroll / pinch or the buttons to zoom, drag to pan, hover or tap a dot for details.
 */
export function ScoutingMap({ events }: { events: ScoutedEvent[] }) {
  const [states, setStates] = useState<FeatureCollection<Geometry, { name: string }> | null>(null);
  const [coords, setCoords] = useState<Map<string, EventCoordinates | null>>(new Map());
  // Each event's name from TBA (by event code), without the year
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [mode, setMode] = useState<Mode>("us");
  const [view, setView] = useState<View>(RESET_VIEW);
  // The dot whose tooltip is showing and where the pointer was (in the map box).
  // `tapped`: opened by a tap, so the tooltip can be scrolled if it doesn't all fit.
  const [hovered, setHovered] = useState<{ dot: PlacedDot; left: number; top: number; tapped: boolean } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    let cancelled = false;
    Promise.all(events.map(async (event) => [event.key, await getEventDisplayName(event)] as const)).then((entries) => {
      if (!cancelled) setNames(new Map(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [events]);

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
    // Group events held at about the same place: one dot each, so e.g. two seasons'
    // championship divisions in Houston don't show up as separate nearby dots
    const groups: Array<{ at: EventCoordinates; events: ScoutedEvent[]; points: Array<[number, number]> }> = [];
    for (const event of events) {
      const at = coords.get(event.key);
      if (!at) continue;
      if (mode === "california" && at.state !== "CA" && !(california && geoContains(california, [at.lng, at.lat]))) continue;
      const point = projection([at.lng, at.lat]);
      if (!point) continue;
      const group = groups.find((g) => distanceKm(g.at, at) <= SAME_PLACE_KM);
      if (group) {
        group.events.push(event);
        group.points.push(point);
      } else {
        groups.push({ at, events: [event], points: [point] });
      }
    }
    return groups.map((group): PlacedDot => ({
      key: group.events.map((event) => event.key).join("|"),
      events: [...group.events].sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? "")),
      x: group.points.reduce((sum, p) => sum + p[0], 0) / group.points.length,
      y: group.points.reduce((sum, p) => sum + p[1], 0) / group.points.length,
    }));
  }, [events, coords, projection, mode, california]);

  const shownEvents = dots.reduce((sum, dot) => sum + dot.events.length, 0);

  // Events with no known location, and ones located but outside the map (abroad, or outside California)
  const unplaced = locating ? 0 : events.filter((event) => !coords.get(event.key)).length;
  const offMap = locating ? 0 : events.length - unplaced - shownEvents;

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
      // ctrlKey: a trackpad pinch (browsers send those as ctrl+wheel); otherwise a scroll
      const rate = e.ctrlKey ? NATURAL_TRACKPAD_PINCH_RATE : NATURAL_WHEEL_RATE;
      zoomAt(Math.exp(-wheelPixels(e) * rate * ZOOM_SENSITIVITY), point.x, point.y);
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
      // Touchscreen pinch: the change in finger spread, at the same sensitivity as scrolling
      if (before > 0) zoomAt(Math.pow(after / before, ZOOM_SENSITIVITY), (point.x + other.x) / 2, (point.y + other.y) / 2);
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

  function showTooltip(dot: PlacedDot, clientX: number, clientY: number, tapped = false) {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    setHovered({ dot, left: clientX - box.left, top: clientY - box.top, tapped });
  }

  // Keep the tooltip inside the part of the map that's on screen (a large map can run
  // past the bottom of the window): beside the pointer, flipping to the left near the right
  // edge, vertically centred on it, clamped to that area, and no taller than it.
  // Measured after render, so it's placed directly on the element.
  useLayoutEffect(() => {
    const tip = tooltipRef.current;
    const box = containerRef.current?.getBoundingClientRect();
    if (!tip || !hovered || !box) return;
    const gap = 12;
    const margin = 4;
    // Visible part of the map, in the map box's own coordinates
    const visibleTop = Math.max(0, -box.top) + margin;
    const visibleBottom = Math.min(box.height, window.innerHeight - box.top) - margin;
    const visibleLeft = Math.max(0, -box.left) + margin;
    const visibleRight = Math.min(box.width, window.innerWidth - box.left) - margin;

    tip.style.maxHeight = `${Math.max(60, visibleBottom - visibleTop)}px`;
    const { offsetWidth: w, offsetHeight: h } = tip;
    let left = hovered.left + gap;
    if (left + w > visibleRight) left = hovered.left - gap - w;
    left = Math.max(visibleLeft, Math.min(left, visibleRight - w));
    const top = Math.max(visibleTop, Math.min(hovered.top - h / 2, visibleBottom - h));
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    tip.style.visibility = "visible";
  }, [hovered]);

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
              {dots.map((dot) => {
                const active = hovered?.dot.key === dot.key;
                // Constant size on screen at any zoom
                const r = ((active ? 1.5 : 1) * DOT_RADIUS) / view.k;
                // A dot shared by several seasons is split into a slice per season's colour
                const colors = [...new Set(dot.events.map(eventColor))];
                const handlers = {
                  onPointerEnter: (e: React.PointerEvent) => e.pointerType === "mouse" && showTooltip(dot, e.clientX, e.clientY),
                  onPointerMove: (e: React.PointerEvent) => e.pointerType === "mouse" && showTooltip(dot, e.clientX, e.clientY),
                  onPointerLeave: (e: React.PointerEvent) => e.pointerType === "mouse" && setHovered(null),
                  onClick: (e: React.MouseEvent) => {
                    // Taps (touch) toggle the tooltip; a click shouldn't also clear it
                    e.stopPropagation();
                    if (!dragged.current) showTooltip(dot, e.clientX, e.clientY, true);
                  },
                };
                return (
                  <g key={dot.key} className="cursor-pointer" {...handlers}>
                    {colors.length === 1 ? (
                      <circle cx={dot.x} cy={dot.y} r={r} fill={colors[0]} />
                    ) : (
                      colors.map((color, i) => (
                        <path
                          key={color}
                          d={wedgePath(dot.x, dot.y, r, (i / colors.length) * Math.PI * 2, ((i + 1) / colors.length) * Math.PI * 2)}
                          fill={color}
                        />
                      ))
                    )}
                    {/* Dark outline so light piece colours (e.g. yellow Fuel) show on any theme */}
                    <circle
                      cx={dot.x}
                      cy={dot.y}
                      r={r}
                      fill="none"
                      stroke="rgba(0,0,0,0.65)"
                      strokeWidth={1.25}
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                );
              })}
            </g>
          </svg>
        )}

        {hovered && (
          <div
            ref={tooltipRef}
            className={`absolute z-10 w-max max-w-[220px] overflow-y-auto overscroll-contain rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md ${
              hovered.tapped ? "" : "pointer-events-none"
            }`}
            // Placed by the layout effect above once its size is known
            style={{ left: 0, top: 0, visibility: "hidden" }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Every event at this spot, newest first */}
            <div className="divide-y divide-border">
              {hovered.dot.events.map((event) => {
                const year = eventYear(event);
                const season = year ? SEASON_GAME_PIECES[year] : undefined;
                return (
                  <div key={event.key} className="py-1.5 first:pt-0 last:pb-0">
                    <p className="font-semibold leading-snug">{names.get(event.key) ?? withoutYear(event.name)}</p>
                    <p className="text-muted-foreground">{formatEventDates(event.startDate, event.endDate)}</p>
                    {/* In the season's game-piece colour, matching the dot */}
                    {season && (
                      <p className="font-medium" style={{ color: season.color }}>
                        {year} · {season.game}
                      </p>
                    )}
                    {scoutedSummary(event) && <p className="mt-1 font-medium">{scoutedSummary(event)}</p>}
                    {event.scoutingManager && <p className="font-medium text-green-500">Scouting manager</p>}
                  </div>
                );
              })}
            </div>
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
          : `${shownEvents} event${shownEvents === 1 ? "" : "s"} shown`}
        {offMap > 0 && ` · ${offMap} outside ${mode === "california" ? "California" : "the US"}`}
        {unplaced > 0 && ` · ${unplaced} with no known location`}
        {" · Scroll or pinch to zoom, drag to pan."}
      </p>
    </div>
  );
}
