import { useId, useRef, useState } from "react";
import { ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNumber, type MeanAndSpread } from "@/lib/strategyData";
import { niceTicks, useWidth, useChartZoom } from "@/components/strategy/chartUtils";

/** Space kept clear above the plot for the reset-zoom button (h-5 plus a gap). */
const RESET_BAND = 22;
const HEIGHT = 150 + RESET_BAND;
const MARGIN = { top: 18 + RESET_BAND, right: 10, bottom: 22, left: 10 };
const DOT_RADIUS = 4;
/** Dots closer than this (px) stack instead of overlapping. */
const DOT_SPACING = 2 * DOT_RADIUS + 2;
const SAMPLES = 120;
/** Narrowest zoom, in fuel. */
const MIN_ZOOM_FUEL = 1;
/** How close (px) the pointer has to be to a dot to hover or click it; wider than the dot. */
const DOT_HIT_RADIUS = DOT_RADIUS + 5;
/** A press that moves further than this (px) was a pan, not a click. */
const CLICK_SLOP = 4;
/** Dots for suspicious matches, whichever team they're for (red-600, as in the data table). */
const SUSPICIOUS_COLOR = "#dc2626";

const pdf = (x: number, mean: number, sd: number) =>
  Math.exp(-0.5 * ((x - mean) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));

/** Abramowitz–Stegun 7.1.26; accurate to ~1e-7, plenty for a tooltip. */
function erf(x: number) {
  const sign = Math.sign(x);
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return sign * (1 - poly * Math.exp(-x * x));
}

const cdf = (x: number, mean: number, sd: number) => 0.5 * (1 + erf((x - mean) / (sd * Math.SQRT2)));

export interface FuelSeries {
  /** Team number or other short name, shown in the legend and tooltips. */
  name: string;
  /** Any CSS color, e.g. "var(--compare-a)". */
  color: string;
  stats: MeanAndSpread | null;
  /**
   * `matchNumber` (a qualification match) makes the dot clickable when the chart has `onSelectMatch`.
   * `suspicious` draws the dot red and says so on hover.
   */
  matches: Array<{ label: string; value: number; matchNumber?: number | null; suspicious?: boolean }>;
}

type Tooltip = { x: number; y: number; value: string; rows: Array<{ color?: string; text: string; danger?: boolean }> };

/** Direct labels closer than this (px) collide; the legend and tooltip carry them instead. */
const LABEL_SPACING = 40;

const sdText = (z: number) => `${z >= 0 ? "+" : "−"}${formatNumber(Math.abs(z))} SD`;

/**
 * Normal curves from scouted means and standard deviations, with each scouted
 * match as a dot on the baseline. One series also shades its ±1 SD band; two
 * or more are overlaid with a legend so they can be compared. Pinch (or
 * ctrl+scroll) to zoom into a range of fuel counts, then drag to pan. With
 * `onSelectMatch`, clicking a match's dot opens it.
 */
export function FuelDistributionChart({ title, series, onSelectMatch }: {
  title: string;
  series: FuelSeries[];
  /** Called with a clicked dot's qualification match and its series' name (the team). */
  onSelectMatch?: (matchNumber: number, seriesName: string) => void;
}) {
  const [containerRef, width] = useWidth<HTMLDivElement>();
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [overDot, setOverDot] = useState(false);
  // Where the last press started, so a pan that ends on a dot doesn't count as a click.
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const single = series.length === 1;
  const zoom = useChartZoom(series.map((item) => item.name).join());
  const clipId = `fuel-distribution-${useId().replace(/[^\w-]/g, "")}`;


  const statsText = (stats: MeanAndSpread | null) =>
    !stats ? (
      "no scouted matches"
    ) : (
      <>
        avg <span className="font-semibold text-foreground">{formatNumber(stats.mean)}</span>
        {stats.sd != null
          ? <> · SD <span className="font-semibold text-foreground">{formatNumber(stats.sd)}</span></>
          : " · SD needs 2+ matches"}
      </>
    );

  const header = single ? (
    <div className="mb-1 flex items-baseline justify-between gap-2">
      <h4 className="text-sm font-semibold">{title}</h4>
      {series[0].stats && <span className="text-xs text-muted-foreground">{statsText(series[0].stats)}</span>}
    </div>
  ) : (
    <div className="mb-1">
      <h4 className="text-sm font-semibold">{title}</h4>
      {/* One row per team, with avg and SD in shared columns so they line up for comparison. */}
      <ul className="mt-0.5 grid w-fit grid-cols-[auto_auto_auto] gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {series.map((item) => (
          <li key={item.name} className="col-span-3 grid grid-cols-subgrid items-center">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: item.color }} />
              <span className="font-mono font-semibold" style={{ color: item.color }}>{item.name}</span>
            </span>
            {item.stats ? (
              <>
                <span className="tabular-nums">
                  avg <span className="font-semibold text-foreground">{formatNumber(item.stats.mean)}</span>
                </span>
                <span className="tabular-nums">
                  {item.stats.sd != null
                    ? <>SD <span className="font-semibold text-foreground">{formatNumber(item.stats.sd)}</span></>
                    : "SD needs 2+ matches"}
                </span>
              </>
            ) : (
              <span className="col-span-2">no scouted matches</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );

  // A lone series needs a curve to be worth plotting; overlays plot whatever means and dots they have.
  const first = series[0]?.stats;
  const emptyMessage = single
    ? !first
      ? "No scouted matches yet."
      : first.sd == null
        ? "Needs 2+ scouted matches for a curve."
        : first.sd === 0
          ? `Every scouted match had ${formatNumber(first.mean)} fuel.`
          : null
    : series.every((item) => !item.stats)
      ? "No scouted matches yet."
      : null;
  if (emptyMessage) {
    return (
      <div className="min-w-0">
        {header}
        <div className="flex items-center justify-center rounded-md bg-muted/40 text-xs text-muted-foreground" style={{ height: HEIGHT }}>
          {emptyMessage}
        </div>
      </div>
    );
  }

  const plotted = series.filter((item) => item.stats) as Array<FuelSeries & { stats: MeanAndSpread }>;
  const curves = plotted
    .filter((item) => item.stats.sd)
    .map((item) => ({ ...item, mean: item.stats.mean, sd: item.stats.sd! }));

  // The full curves, even where a left tail runs below zero fuel; a y-axis marks zero then.
  const bounds = [
    ...curves.flatMap((curve) => [curve.mean - 3 * curve.sd, curve.mean + 3 * curve.sd]),
    ...plotted.flatMap((item) => [item.stats.mean, ...item.matches.map((match) => match.value)]),
  ];
  let lo = Math.min(...bounds);
  let hi = Math.max(...bounds);
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const minSpan = Math.min(1, MIN_ZOOM_FUEL / (hi - lo));
  // The zoomed part of [lo, hi]; everything below draws within it.
  const viewLo = lo + zoom.view.x.from * (hi - lo);
  const viewHi = lo + zoom.view.x.to * (hi - lo);

  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const baseline = HEIGHT - MARGIN.bottom;
  // Curves share one density scale, so a tighter (more consistent) team stands taller.
  const peak = Math.max(...curves.map((curve) => pdf(curve.mean, curve.mean, curve.sd)), 1e-9);
  const xScale = (value: number) => MARGIN.left + ((value - viewLo) / (viewHi - viewLo)) * plotWidth;
  const yScale = (density: number) => baseline - (density / peak) * (baseline - MARGIN.top);
  const xInvert = (px: number) => viewLo + ((px - MARGIN.left) / plotWidth) * (viewHi - viewLo);

  const curvePoints = (mean: number, sd: number, from: number, to: number) =>
    Array.from({ length: SAMPLES + 1 }, (_, i) => {
      const x = from + ((to - from) * i) / SAMPLES;
      return `${xScale(x).toFixed(1)},${yScale(pdf(x, mean, sd)).toFixed(1)}`;
    });
  const areaPath = (mean: number, sd: number, from: number, to: number) =>
    `M${xScale(from).toFixed(1)},${baseline} L${curvePoints(mean, sd, from, to).join(" L")} L${xScale(to).toFixed(1)},${baseline} Z`;

  // Stack dots upward from the baseline wherever they'd overlap, across every series.
  const levels: number[][] = [];
  const dots = plotted
    .flatMap((item) => item.matches.map((match) => ({ ...match, name: item.name, color: item.color, cx: xScale(match.value) })))
    .filter((dot) => dot.value >= viewLo && dot.value <= viewHi)
    .sort((a, b) => a.cx - b.cx)
    .map((dot) => {
      let level = levels.findIndex((row) => row.every((cx) => Math.abs(cx - dot.cx) >= DOT_SPACING));
      if (level === -1) level = levels.push([]) - 1;
      levels[level].push(dot.cx);
      return { ...dot, cy: baseline - DOT_RADIUS - 1 - level * DOT_SPACING };
    });

  // Overlays label each curve's peak with its name, unless two labels would collide.
  const inView = (value: number) => value >= viewLo && value <= viewHi;
  const peakLabels = single ? [] : curves.filter((curve) => inView(curve.mean)).map((curve) => ({ name: curve.name, x: xScale(curve.mean) }));
  const labelsFit = peakLabels.every((label, i) => peakLabels.every((other, j) => i === j || Math.abs(label.x - other.x) >= LABEL_SPACING));

  const ticks = niceTicks(viewLo, viewHi);
  // A lone curve's ±1 SD band, cut to the zoom.
  const band = curves[0] && { from: Math.max(viewLo, curves[0].mean - curves[0].sd), to: Math.min(viewHi, curves[0].mean + curves[0].sd) };
  const showBand = band && band.from < band.to;

  const dotAt = (px: number, py: number) => dots.find((d) => Math.hypot(d.cx - px, d.cy - py) <= DOT_HIT_RADIUS);

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    // A dot under the pointer wins over the curve readout; hit area is wider than the dot.
    const dot = dotAt(px, py);
    setOverDot(!!onSelectMatch && dot?.matchNumber != null);
    if (dot) {
      setTooltip({
        x: dot.cx,
        y: dot.cy,
        value: `${formatNumber(dot.value)} fuel`,
        rows: [
          { color: single ? undefined : dot.color, text: single ? dot.label : `${dot.name} · ${dot.label}` },
          ...(dot.suspicious ? [{ text: "Suspicious", danger: true }] : []),
        ],
      });
      return;
    }
    if (curves.length === 0) {
      setTooltip(null);
      return;
    }
    const x = Math.min(Math.max(px, MARGIN.left), MARGIN.left + plotWidth);
    const value = xInvert(x);
    setTooltip({
      x,
      y: Math.min(...curves.map((curve) => yScale(pdf(value, curve.mean, curve.sd)))),
      value: `${formatNumber(value)} fuel`,
      rows: curves.map((curve) => {
        const detail = `${sdText((value - curve.mean) / curve.sd)} · ${Math.round(cdf(value, curve.mean, curve.sd) * 100)}% of matches below`;
        return single ? { text: detail } : { color: curve.color, text: `${curve.name}: ${detail}` };
      }),
    });
  };

  const zoomProps = zoom.bind({
    plotLeft: MARGIN.left,
    plotWidth,
    minSpan,
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
    if (dot?.matchNumber != null) onSelectMatch(dot.matchNumber, dot.name);
  };

  const description = plotted
    .map((item) => `${item.name} average ${formatNumber(item.stats.mean)}${item.stats.sd != null ? `, standard deviation ${formatNumber(item.stats.sd)}` : ""}, ${item.matches.length} scouted matches`)
    .join("; ");

  return (
    <div className="min-w-0">
      {header}
      <div ref={containerRef} className="relative">
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={`${title} normal curves: ${description}`}
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
                <rect x={MARGIN.left} y={0} width={plotWidth} height={HEIGHT} />
              </clipPath>
            </defs>
            <g clipPath={`url(#${clipId})`}>
              {curves.map((curve) => (
                <path key={`${curve.name}-area`} d={areaPath(curve.mean, curve.sd, viewLo, viewHi)} fill={curve.color} fillOpacity={0.08} />
              ))}
              {single && showBand && (
                <path
                  d={areaPath(curves[0].mean, curves[0].sd, band.from, band.to)}
                  fill={curves[0].color}
                  fillOpacity={0.18}
                />
              )}
              {curves.map((curve) => (
                <polyline
                  key={`${curve.name}-curve`}
                  points={curvePoints(curve.mean, curve.sd, viewLo, viewHi).join(" ")}
                  fill="none"
                  stroke={curve.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}

              {/* Mean lines rise to their curve's peak; a series without a curve marks its mean across the plot. */}
              {plotted.map((item) => {
                const x = xScale(item.stats.mean);
                const top = item.stats.sd ? yScale(pdf(item.stats.mean, item.stats.mean, item.stats.sd)) : MARGIN.top;
                return <line key={`${item.name}-mean`} x1={x} x2={x} y1={baseline} y2={top} stroke={item.color} strokeWidth={1} />;
              })}
            </g>
            {single ? inView(plotted[0].stats.mean) && (
              <text x={xScale(plotted[0].stats.mean)} y={MARGIN.top - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                avg {formatNumber(plotted[0].stats.mean)}
              </text>
            ) : labelsFit && curves.filter((curve) => inView(curve.mean)).map((curve) => (
              <text
                key={`${curve.name}-label`}
                x={xScale(curve.mean)}
                y={yScale(pdf(curve.mean, curve.mean, curve.sd)) - 5}
                textAnchor="middle"
                fill={curve.color}
                className="font-mono text-[10px] font-semibold"
              >
                {curve.name}
              </text>
            ))}

            <line x1={MARGIN.left} x2={MARGIN.left + plotWidth} y1={baseline} y2={baseline} stroke="var(--border)" strokeWidth={1} />
            {viewLo < 0 && viewHi > 0 && (
              <line x1={xScale(0)} x2={xScale(0)} y1={MARGIN.top} y2={baseline} stroke="var(--muted-foreground)" strokeWidth={1} />
            )}
            {ticks.map((tick) => (
              <text key={tick} x={xScale(tick)} y={HEIGHT - 6} textAnchor="middle" className="fill-muted-foreground text-[10px] tabular-nums">
                {tick}
              </text>
            ))}

            {tooltip && (
              <line x1={tooltip.x} x2={tooltip.x} y1={MARGIN.top} y2={baseline} stroke="var(--muted-foreground)" strokeOpacity={0.5} strokeWidth={1} />
            )}
            {dots.map((dot, i) => (
              <circle key={i} cx={dot.cx} cy={dot.cy} r={DOT_RADIUS} fill={dot.suspicious ? SUSPICIOUS_COLOR : dot.color} stroke="var(--card)" strokeWidth={2} />
            ))}
          </svg>
        )}
        {/* In the band reserved above the plot, so it never covers the chart and zooming doesn't push it down. */}
        {zoom.zoomed && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute left-0 top-0 h-5 gap-1 bg-card/80 px-1.5 text-xs font-normal text-muted-foreground"
            onClick={zoom.reset}
          >
            <ZoomOut className="size-3.5" />
            Reset zoom
          </Button>
        )}
        {tooltip && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
            style={{ left: Math.min(Math.max(tooltip.x, 110), width - 110), top: Math.max(tooltip.y - 8, 0) }}
          >
            <div className="font-semibold tabular-nums">{tooltip.value}</div>
            {tooltip.rows.map((row, i) => (
              <div
                key={i}
                className={`flex items-center gap-1.5 text-[10px] ${row.danger ? "font-semibold text-red-600 dark:text-red-400" : "text-muted-foreground"}`}
              >
                {row.color && <span className="inline-block h-0.5 w-2.5 rounded-full" style={{ background: row.color }} />}
                {row.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
