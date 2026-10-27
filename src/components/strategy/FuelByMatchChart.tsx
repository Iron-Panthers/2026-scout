import { useId, useRef, useState } from "react";
import { ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/strategyData";
import { niceTicks, useWidth, useChartZoom } from "@/components/strategy/chartUtils";

const HEIGHT = 180;
const MARGIN = { top: 10, right: 10, bottom: 22, left: 30 };
const DOT_RADIUS = 4;
/** Round-capped zero-length dashes draw as dots. */
const DOTTED = "0 5";
/** Narrowest zoom, in matches. */
const MIN_ZOOM_MATCHES = 2;
/** Opacity of matches outside a series' `highlight`. */
const FADED_OPACITY = 0.2;
/** Narrowest zoom, in fuel. */
const MIN_ZOOM_FUEL = 4;
/** How close (px) a click has to land to a dot to open its match. */
const DOT_HIT_RADIUS = 8;
/** A press that moves further than this (px) was a pan, not a click. */
const CLICK_SLOP = 4;

const METRICS = [
  { key: "auto", label: "Auto" },
  { key: "teleop", label: "Teleop" },
] as const;
type Metric = (typeof METRICS)[number]["key"];

export interface FuelByMatchSeries {
  /** Team number, shown in the legend and tooltips. */
  name: string;
  /** Any CSS colors, e.g. "var(--fuel-a-auto)". */
  colors: Record<Metric, string>;
  /** Scouted qualification matches, any order. */
  matches: Array<{ matchNumber: number; auto: number; teleop: number }>;
  /** Played qualification matches with no scouting. */
  missing: number[];
  /** Qualification matches to emphasize; every other match fades. Omitted, none fade. */
  highlight?: number[] | null;
}

/** `x` is the axis position: the qualification match, or the team's nth played match when aligned. */
type Slot = { x: number; matchNumber: number };
type Point = Slot & { auto: number; teleop: number };

/**
 * A run between consecutive scouted matches; dotted when the team played
 * unscouted matches in between, which sit on it at their trend values.
 */
type Segment = { from: Point; to: Point; missing: Slot[] };

const trendAt = (segment: Segment, x: number, metric: Metric) =>
  segment.from[metric]
  + ((segment.to[metric] - segment.from[metric]) * (x - segment.from.x)) / (segment.to.x - segment.from.x);

type Tooltip = { x: number; title: string; rows: Array<{ color: string; text: string }> };

function LegendKey({ color, dotted }: { color: string; dotted?: boolean }) {
  return (
    <svg width="14" height="4" className="shrink-0" aria-hidden="true">
      <line x1="2" x2="12" y1="2" y2="2" stroke={color} strokeWidth="2" strokeLinecap="round" strokeDasharray={dotted ? "0 4" : undefined} />
    </svg>
  );
}

/**
 * Auto and teleop fuel per qualification match as lines, one pair per team on
 * a shared match axis. Unscouted matches between two scouted ones are bridged
 * with a dotted line along the trend. With `alignByTeamMatch`, the axis is each
 * team's own 1st, 2nd, 3rd… played match instead, so compared teams line up.
 * Pinch (or ctrl+scroll) to zoom into a run of matches and range of fuel,
 * then drag to pan. With `onSelectMatch`, clicking a scouted match's dot opens it.
 */
export function FuelByMatchChart({ series, alignByTeamMatch = false, onSelectMatch }: {
  series: FuelByMatchSeries[];
  alignByTeamMatch?: boolean;
  /** Called with the qualification match of a clicked dot and its series' name (the team). */
  onSelectMatch?: (matchNumber: number, seriesName: string) => void;
}) {
  const [containerRef, width] = useWidth<HTMLDivElement>();
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [overDot, setOverDot] = useState(false);
  // Where the last press started, so a pan that ends on a dot doesn't count as a click.
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const single = series.length === 1;
  // Switching teams or the axis changes what the matches are, so it starts unzoomed.
  const zoom = useChartZoom(`${alignByTeamMatch}|${series.map((item) => item.name).join()}`);
  const clipId = `fuel-by-match-${useId().replace(/[^\w-]/g, "")}`;

  const teams = series.map((item) => {
    // Unscouted matches count toward a team's match number, so gaps stay visible when aligned.
    const played = [...item.matches.map((match) => match.matchNumber), ...item.missing].sort((a, b) => a - b);
    const toX = (matchNumber: number) => (alignByTeamMatch ? played.indexOf(matchNumber) + 1 : matchNumber);
    const points: Point[] = item.matches.map((match) => ({ ...match, x: toX(match.matchNumber) })).sort((a, b) => a.x - b.x);
    const missing: Slot[] = item.missing.map((matchNumber) => ({ x: toX(matchNumber), matchNumber }));
    const segments: Segment[] = points.slice(1).map((to, i) => ({
      from: points[i],
      to,
      missing: missing.filter((slot) => slot.x > points[i].x && slot.x < to.x).sort((a, b) => a.x - b.x),
    }));
    const faded = (matchNumber: number) => !!item.highlight && !item.highlight.includes(matchNumber);
    return { ...item, points, missing, segments, faded };
  });
  const anyDotted = teams.some((team) => team.segments.some((segment) => segment.missing.length > 0));

  const legend = (
    // One row per team, its auto and teleop keys running out to the right in shared columns.
    <ul className={`grid w-fit items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground ${single ? "grid-cols-[auto_auto]" : "grid-cols-[auto_auto_auto]"}`}>
      {teams.map((team) => (
        <li key={team.name} className="col-span-full grid grid-cols-subgrid items-center">
          {!single && <span className="font-mono font-semibold text-foreground">{team.name}</span>}
          {METRICS.map((metric) => (
            <span key={metric.key} className="flex items-center gap-1">
              <LegendKey color={team.colors[metric.key]} />
              {metric.label}
            </span>
          ))}
        </li>
      ))}
      {anyDotted && (
        <li className="col-span-full flex items-center gap-1">
          <LegendKey color="var(--muted-foreground)" dotted />
          Not scouted (trend)
        </li>
      )}
    </ul>
  );

  if (teams.every((team) => team.points.length === 0)) {
    return (
      <div className="min-w-0">
        <div className="mb-1">{legend}</div>
        <div className="flex items-center justify-center rounded-md bg-muted/40 text-xs text-muted-foreground" style={{ height: HEIGHT }}>
          No scouted qualification matches yet.
        </div>
      </div>
    );
  }

  // Unscouted matches only appear where a dotted line passes through them.
  const bridged = teams.flatMap((team) => team.segments.flatMap((segment) => segment.missing));
  const xs = [...teams.flatMap((team) => team.points.map((point) => point.x)), ...bridged.map((slot) => slot.x)];
  let xLo = Math.min(...xs) - 0.5;
  let xHi = Math.max(...xs) + 0.5;
  if (xHi - xLo < MIN_ZOOM_MATCHES) { xLo -= 1; xHi += 1; }
  const viewLo = xLo + zoom.view.x.from * (xHi - xLo);
  const viewHi = xLo + zoom.view.x.to * (xHi - xLo);

  const yHi = Math.max(1, ...teams.flatMap((team) => team.points.flatMap((point) => [point.auto, point.teleop])));
  const yViewLo = zoom.view.y.from * yHi;
  const yViewHi = zoom.view.y.to * yHi;
  // Fuel comes in whole pieces.
  const yTicks = niceTicks(yViewLo, yViewHi, 4).filter(Number.isInteger);

  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const baseline = HEIGHT - MARGIN.bottom;
  const xScale = (x: number) => MARGIN.left + ((x - viewLo) / (viewHi - viewLo)) * plotWidth;
  const yScale = (value: number) => baseline - ((value - yViewLo) / (yViewHi - yViewLo)) * (baseline - MARGIN.top);
  const xLabel = (x: number) => (alignByTeamMatch ? `#${x}` : `Q${x}`);
  const xTicks = niceTicks(Math.ceil(viewLo), Math.floor(viewHi), Math.max(2, Math.floor(plotWidth / 50))).filter(Number.isInteger);

  /** The visible scouted dot nearest a point in the chart, if one is close enough. */
  const dotAt = (px: number, py: number): { matchNumber: number; name: string } | null => {
    let best: { matchNumber: number; name: string; distance: number } | null = null;
    for (const team of teams) {
      for (const point of team.points) {
        if (point.x < viewLo || point.x > viewHi) continue;
        for (const { key } of METRICS) {
          if (point[key] < yViewLo || point[key] > yViewHi) continue;
          const distance = Math.hypot(xScale(point.x) - px, yScale(point[key]) - py);
          if (distance <= DOT_HIT_RADIUS && (!best || distance < best.distance)) best = { matchNumber: point.matchNumber, name: team.name, distance };
        }
      }
    }
    return best;
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    setOverDot(!!onSelectMatch && dotAt(px, event.clientY - rect.top) !== null);
    const visible = xs.filter((x) => x >= viewLo && x <= viewHi);
    if (visible.length === 0) {
      setTooltip(null);
      return;
    }
    const nearest = visible.reduce((best, x) => (Math.abs(xScale(x) - px) < Math.abs(xScale(best) - px) ? x : best));
    // Aligned rows name the qualification match, since it differs per team.
    const prefix = (team: (typeof teams)[number], slot: Slot) => {
      const parts = [single ? "" : team.name, alignByTeamMatch ? `Q${slot.matchNumber}` : ""].filter(Boolean);
      return parts.length > 0 ? `${parts.join(" ")}: ` : "";
    };
    const rows = teams.flatMap((team) => {
      const point = team.points.find((item) => item.x === nearest);
      if (point) {
        return [{ color: team.colors.auto, text: `${prefix(team, point)}auto ${formatNumber(point.auto)} · teleop ${formatNumber(point.teleop)}` }];
      }
      const segment = team.segments.find((item) => item.missing.some((slot) => slot.x === nearest));
      if (segment) {
        const slot = segment.missing.find((item) => item.x === nearest)!;
        const trend = METRICS.map((metric) => `${metric.key} ~${formatNumber(trendAt(segment, nearest, metric.key))}`).join(" · ");
        return [{ color: team.colors.auto, text: `${prefix(team, slot)}not scouted, trend ${trend}` }];
      }
      // Played but unscouted with no scouted match on one side, so no trend to show.
      const unbridged = team.missing.find((slot) => slot.x === nearest);
      if (unbridged) {
        return [{ color: team.colors.auto, text: `${prefix(team, unbridged)}not scouted` }];
      }
      return [];
    });
    setTooltip({ x: xScale(nearest), title: alignByTeamMatch ? `Match #${nearest}` : `Q${nearest}`, rows });
  };

  const zoomProps = zoom.bind({
    plotLeft: MARGIN.left,
    plotWidth,
    minSpan: Math.min(1, MIN_ZOOM_MATCHES / (xHi - xLo)),
    y: { plotTop: MARGIN.top, plotHeight: baseline - MARGIN.top, minSpan: Math.min(1, MIN_ZOOM_FUEL / yHi) },
    onHover: handlePointerMove,
    onLeave: () => {
      setTooltip(null);
      setOverDot(false);
    },
  });

  const handleClick = (event: React.MouseEvent<SVGSVGElement>) => {
    const start = pressStart.current;
    if (!onSelectMatch || (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dot = dotAt(event.clientX - rect.left, event.clientY - rect.top);
    if (dot) onSelectMatch(dot.matchNumber, dot.name);
  };

  const description = teams
    .map((team) => `${team.name}: ${team.points.map((point) => `Q${point.matchNumber} auto ${formatNumber(point.auto)}, teleop ${formatNumber(point.teleop)}`).join("; ") || "no scouted matches"}`)
    .join(". ");

  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-start justify-between gap-2">
        {legend}
        {zoom.zoomed && (
          <Button type="button" variant="ghost" size="sm" className="h-5 gap-1 px-1.5 text-xs text-muted-foreground" onClick={zoom.reset}>
            <ZoomOut className="size-3.5" />
            Reset zoom
          </Button>
        )}
      </div>
      <div ref={containerRef} className="relative">
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={`Fuel by match. ${description}`}
            className={`block touch-none select-none ${overDot ? "cursor-pointer" : zoom.cursor}`}
            {...zoomProps}
            onPointerDown={(event) => {
              pressStart.current = { x: event.clientX, y: event.clientY };
              zoomProps.onPointerDown(event);
            }}
            onClick={handleClick}
          >
            <defs>
              <clipPath id={clipId}>
                {/* Padded vertically so dots at the plot's top and bottom edges stay whole. */}
                <rect x={MARGIN.left} y={MARGIN.top - DOT_RADIUS - 1} width={plotWidth} height={baseline - MARGIN.top + 2 * (DOT_RADIUS + 1)} />
              </clipPath>
            </defs>
            {yTicks.map((tick) => (
              <g key={tick}>
                <line x1={MARGIN.left} x2={MARGIN.left + plotWidth} y1={yScale(tick)} y2={yScale(tick)} stroke="var(--border)" strokeWidth={1} />
                <text x={MARGIN.left - 6} y={yScale(tick)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
                  {tick}
                </text>
              </g>
            ))}
            {xTicks.map((tick) => (
              <text key={tick} x={xScale(tick)} y={HEIGHT - 6} textAnchor="middle" className="fill-muted-foreground text-[10px] tabular-nums">
                {xLabel(tick)}
              </text>
            ))}

            {tooltip && (
              <line x1={tooltip.x} x2={tooltip.x} y1={MARGIN.top} y2={baseline} stroke="var(--muted-foreground)" strokeOpacity={0.5} strokeWidth={1} />
            )}

            {teams.map((team) => METRICS.map(({ key }) => (
              <g key={`${team.name}-${key}`} clipPath={`url(#${clipId})`} stroke={team.colors[key]} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                {team.segments.map((segment) => (
                  <line
                    key={segment.from.matchNumber}
                    x1={xScale(segment.from.x)}
                    y1={yScale(segment.from[key])}
                    x2={xScale(segment.to.x)}
                    y2={yScale(segment.to[key])}
                    strokeDasharray={segment.missing.length > 0 ? DOTTED : undefined}
                    // A run fades if it reaches back to a faded match.
                    opacity={team.faded(segment.from.matchNumber) || team.faded(segment.to.matchNumber) ? FADED_OPACITY : undefined}
                  />
                ))}
                {/* Unscouted matches: hollow markers on the dotted trend. */}
                {team.segments.flatMap((segment) => segment.missing.map((slot) => (
                  <circle key={`missing-${slot.matchNumber}`} cx={xScale(slot.x)} cy={yScale(trendAt(segment, slot.x, key))} r={DOT_RADIUS - 0.5} fill="var(--card)" strokeWidth={1.5} opacity={team.faded(slot.matchNumber) ? FADED_OPACITY : undefined} />
                )))}
                {team.points.map((point) => (
                  <circle
                    key={point.matchNumber}
                    cx={xScale(point.x)}
                    cy={yScale(point[key])}
                    r={DOT_RADIUS}
                    fill={team.colors[key]}
                    stroke="var(--card)"
                    opacity={team.faded(point.matchNumber) ? FADED_OPACITY : undefined}
                  />
                ))}
              </g>
            )))}
          </svg>
        )}
        {tooltip && tooltip.rows.length > 0 && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
            style={{ left: Math.min(Math.max(tooltip.x, 120), width - 120) }}
          >
            <div className="font-semibold tabular-nums">{tooltip.title}</div>
            {tooltip.rows.map((row, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="inline-block h-0.5 w-2.5 rounded-full" style={{ background: row.color }} />
                {row.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
