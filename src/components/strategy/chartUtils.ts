import { useEffect, useRef, useState } from "react";

/** Round tick values about `count` apart across [lo, hi]. */
export function niceTicks(lo: number, hi: number, count = 5) {
  const rough = (hi - lo) / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10]
    .map((m) => m * magnitude)
    .reduce((best, s) => (Math.abs(Math.log(s / rough)) < Math.abs(Math.log(best / rough)) ? s : best));
  const ticks: number[] = [];
  for (let tick = Math.ceil(lo / step) * step; tick <= hi + 1e-9; tick += step) ticks.push(Number(tick.toFixed(6)));
  return ticks;
}

/** Tracks an element's rendered width; a callback ref so it follows the element mounting later. */
export function useWidth<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!element) return;
    // Observing reports the current size right away, then every resize.
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [setElement, width] as const;
}

/** The visible part of one axis's domain, as fractions of it: { from: 0, to: 1 } is unzoomed. */
export type ZoomWindow = { from: number; to: number };
/** Both axes' windows; an axis the chart doesn't zoom stays at its whole domain. */
export type ZoomView = { x: ZoomWindow; y: ZoomWindow };

const FULL_WINDOW: ZoomWindow = { from: 0, to: 1 };
const FULL_VIEW: ZoomView = { x: FULL_WINDOW, y: FULL_WINDOW };

type Axis = "x" | "y";
type Point = { x: number; y: number };

/** Keeps `span` between `minSpan` and the whole domain, shifting the window back inside it. */
function clampWindow(from: number, span: number, minSpan: number): ZoomWindow {
  const clamped = Math.min(1, Math.max(minSpan, span));
  const start = Math.min(Math.max(from, 0), 1 - clamped);
  return { from: start, to: start + clamped };
}

interface ZoomLayout {
  plotLeft: number;
  plotWidth: number;
  /** Narrowest x window, as a fraction of the domain. */
  minSpan: number;
  /** Where the plot sits vertically, to zoom the y-axis too; without it only x zooms. */
  y?: { plotTop: number; plotHeight: number; minSpan: number };
  /** Pointer hover outside a zoom gesture, e.g. to show a tooltip. */
  onHover: (event: React.PointerEvent<SVGSVGElement>) => void;
  onLeave: () => void;
}

/**
 * Zoom for an SVG chart: pinch on a trackpad or touchscreen (or ctrl+scroll)
 * to zoom, then drag (or scroll sideways) to pan, and double-click to reset.
 * Zooms x only, or both axes together when the layout passes `y`.
 * Unzoomed, a one-finger touch drag is left to hovering.
 * The windows are kept as fractions of the domains, so the chart can compute
 * its domains after calling this; it resets whenever `resetKey` changes.
 */
export function useChartZoom(resetKey: string) {
  const [view, setView] = useState<ZoomView>(FULL_VIEW);
  const [dragging, setDragging] = useState(false);
  const [lastKey, setLastKey] = useState(resetKey);
  if (lastKey !== resetKey) {
    setLastKey(resetKey);
    setView(FULL_VIEW);
  }

  const zoomed = [view.x, view.y].some((win) => win.from > 0 || win.to < 1);
  const touches = useRef(new Map<number, Point>());
  const pinch = useRef<{ ids: [number, number]; start: ZoomView; mid: Point; distance: number } | null>(null);
  const drag = useRef<{ pointerId: number; startPx: Point; start: ZoomView } | null>(null);

  const localPoint = (event: { clientX: number; clientY: number; currentTarget: Element }): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  /** Props for the chart's <svg>, given where its plot area sits. */
  const bind = (current: ZoomLayout) => {
    const { plotLeft, plotWidth } = current;
    /** Where a pixel sits in the plot, 0 to 1 on each axis; y counts up from the bottom. */
    const plotFraction = (p: Point): Point => ({
      x: (p.x - plotLeft) / plotWidth,
      y: current.y ? (current.y.plotTop + current.y.plotHeight - p.y) / current.y.plotHeight : 0,
    });
    /**
     * Scales `start` by `factor` and moves the domain that was under `anchor`
     * to `target` (both plot fractions): a zoom when they match, a pan when `factor` is 1.
     */
    const rescale = (start: ZoomView, anchor: Point, target: Point, factor: number): ZoomView => {
      const axis = (key: Axis, minSpan: number) => {
        const win = start[key];
        const span = Math.min(1, Math.max(minSpan, (win.to - win.from) * factor));
        return clampWindow(win.from + anchor[key] * (win.to - win.from) - target[key] * span, span, minSpan);
      };
      return { x: axis("x", current.minSpan), y: current.y ? axis("y", current.y.minSpan) : FULL_WINDOW };
    };
    /** The two fingers' midpoint (plot fractions) and spread (px). */
    const pinchState = (ids: [number, number]) => {
      const [a, b] = ids.map((id) => touches.current.get(id)!);
      return { mid: plotFraction({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), distance: Math.hypot(a.x - b.x, a.y - b.y) };
    };
    const endDrag = () => {
      drag.current = null;
      setDragging(false);
    };
    // Trackpad pinches arrive as ctrl+wheel; React's wheel listener is passive, so
    // it can't stop the browser zooming the page. Plain vertical scrolling still scrolls the page.
    const onWheel = (event: WheelEvent) => {
      if (plotWidth <= 0) return;
      const at = plotFraction(localPoint(event as WheelEvent & { currentTarget: Element }));
      if (event.ctrlKey) {
        event.preventDefault();
        // Capped so one mouse-wheel notch doesn't jump too far.
        const factor = Math.exp(Math.min(Math.max(event.deltaY, -50), 50) * 0.01);
        setView((win) => rescale(win, at, at, factor));
        return;
      }
      const sideways = event.shiftKey
        ? event.deltaY || event.deltaX
        : Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : 0;
      if (zoomed && sideways) {
        event.preventDefault();
        setView((win) => {
          const span = win.x.to - win.x.from;
          return { ...win, x: clampWindow(win.x.from + (sideways / plotWidth) * span, span, current.minSpan) };
        });
      }
    };
    return {
      // Rebound each render so the listener sees the current layout.
      ref: (svg: SVGSVGElement | null) => {
        svg?.addEventListener("wheel", onWheel, { passive: false });
        return () => svg?.removeEventListener("wheel", onWheel);
      },
      onPointerDown: (event: React.PointerEvent<SVGSVGElement>) => {
        const p = localPoint(event);
        if (event.pointerType === "touch") {
          touches.current.set(event.pointerId, p);
          if (touches.current.size === 2) {
            const ids = [...touches.current.keys()] as [number, number];
            pinch.current = { ids, start: view, ...pinchState(ids) };
            endDrag();
            current.onLeave();
            return;
          }
          // A tap shows the tooltip there, as hovering would.
          current.onHover(event);
        } else if (event.button !== 0) {
          return;
        }
        // Only a zoomed chart has anywhere to pan to.
        if (!zoomed || touches.current.size > 1) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointerId: event.pointerId, startPx: p, start: view };
        setDragging(true);
      },
      onPointerMove: (event: React.PointerEvent<SVGSVGElement>) => {
        const p = localPoint(event);
        if (event.pointerType === "touch" && touches.current.has(event.pointerId)) {
          touches.current.set(event.pointerId, p);
          if (pinch.current) {
            // The domain first under the fingers' midpoint follows it, scaled by how far they've spread.
            const { ids, start, mid, distance } = pinch.current;
            const now = pinchState(ids);
            if (distance > 1 && now.distance > 1) setView(rescale(start, mid, now.mid, distance / now.distance));
            return;
          }
        }
        if (drag.current?.pointerId === event.pointerId) {
          // The domain under the pointer follows it; the tooltip waits until the drag ends.
          const { startPx, start } = drag.current;
          setView(rescale(start, plotFraction(startPx), plotFraction(p), 1));
          current.onLeave();
          return;
        }
        current.onHover(event);
      },
      onPointerUp: (event: React.PointerEvent<SVGSVGElement>) => {
        touches.current.delete(event.pointerId);
        if (touches.current.size < 2) pinch.current = null;
        if (drag.current?.pointerId === event.pointerId) endDrag();
      },
      onPointerCancel: (event: React.PointerEvent<SVGSVGElement>) => {
        touches.current.delete(event.pointerId);
        pinch.current = null;
        endDrag();
      },
      onPointerLeave: () => current.onLeave(),
      onDoubleClick: () => setView(FULL_VIEW),
    };
  };

  return {
    view,
    zoomed,
    /** Tailwind cursor for the chart: a hand once there's somewhere to pan. */
    cursor: dragging ? "cursor-grabbing" : zoomed ? "cursor-grab" : "cursor-crosshair",
    reset: () => setView(FULL_VIEW),
    bind,
  };
}
