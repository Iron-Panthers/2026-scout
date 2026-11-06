import { useEffect, useRef, useState, type ReactNode } from "react";
import { Eraser, Hand, Pencil, Trash2 } from "lucide-react";
import fieldImage from "@/assets/FE-2026-_REBUILT_Playing_Field_With_Fuel.png";
import { Button } from "@/components/ui/button";
import { TagColorPicker } from "@/components/strategy/TeamTag";
import { TAG_COLORS } from "@/lib/livePicklists";
import {
  FIELD_HEIGHT,
  FIELD_WIDTH,
  OUR_TEAM,
  ROBOT_SIZE,
  type Alliance,
  type BoardPage,
  type BoardRobot,
  type BoardStroke,
  type PenStyle,
} from "@/lib/strategyBoard";

type Tool = "move" | "pen" | "eraser";

const TOOLS = [
  { key: "move", label: "Move", icon: Hand },
  { key: "pen", label: "Pen", icon: Pencil },
  { key: "eraser", label: "Eraser", icon: Eraser },
] as const;

/** Pen widths, in field pixels. */
const PEN_SIZES = [4, 8, 14];

const PEN_STYLES: Array<{ key: PenStyle; label: string }> = [
  { key: "solid", label: "Solid line" },
  { key: "dashed", label: "Dashed line" },
  { key: "dotted", label: "Dotted line" },
  { key: "highlighter", label: "Highlighter" },
];
/** A highlighter is this many times wider than the pen size, and see-through. */
const HIGHLIGHTER_WIDTH = 3;
const HIGHLIGHTER_OPACITY = 0.35;

/** A line style's dashes (scaled to its width, as the round caps lengthen each dash by one width) and opacity. */
function styleAttributes(style: PenStyle | undefined, width: number) {
  switch (style) {
    case "dashed":
      return { strokeDasharray: `${width * 2} ${width * 2.5}` };
    case "dotted":
      // Next to nothing between the caps: a row of round dots
      return { strokeDasharray: `0.01 ${width * 2}` };
    case "highlighter":
      return { strokeOpacity: HIGHLIGHTER_OPACITY };
    default:
      return {};
  }
}

const ALLIANCE_COLOR: Record<Alliance, string> = { red: "#dc2626", blue: "#2563eb" };

/** On-screen sizes (px) that have to stay easy to hit however small the field is drawn. */
const ERASER_RADIUS_PX = 12;
/** The turning handle on a selected robot's front edge: drawn this big (px), within field-pixel bounds so it stays smaller than the robot. */
const HANDLE_RADIUS_PX = 6;
const HANDLE_RADIUS_RANGE = [4, 9] as const;
/** Grabbable a little beyond what's drawn (px), but never over most of the robot (field pixels), which moves it. */
const HANDLE_HIT_PX = 10;
const HANDLE_HIT_MAX = 15;
/** A press on a team that moves less than this (px) is a tap, not a drag. */
const TAP_SLOP = 6;
/** Turning a robot to within this many degrees of a multiple of 45° snaps it there. */
const ROTATION_SNAP = 5;

const HALF = ROBOT_SIZE / 2;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(value * 10) / 10;
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Where a tapped (not dragged) team goes: its alliance's side of the field, a spot per station, facing the middle. */
function startingSpot(alliance: Alliance, station: number) {
  return {
    x: alliance === "red" ? 250 : FIELD_WIDTH - 250,
    y: (FIELD_HEIGHT * (station + 1)) / 4,
    angle: alliance === "red" ? 90 : 270,
  };
}

function snapAngle(degrees: number): number {
  const angle = ((degrees % 360) + 360) % 360;
  const nearest = Math.round(angle / 45) * 45;
  return Math.abs(angle - nearest) <= ROTATION_SNAP ? nearest % 360 : Math.round(angle);
}

/** A smooth path through a stroke's points (a dot for a single point). */
function strokePath(points: number[]): string {
  if (points.length <= 2) return `M${points[0]} ${points[1]}L${points[0]} ${points[1]}`;
  let path = `M${points[0]} ${points[1]}`;
  // Curves through the midpoints between points, with each point as the control
  for (let i = 2; i < points.length - 2; i += 2) {
    path += `Q${points[i]} ${points[i + 1]} ${(points[i] + points[i + 2]) / 2} ${(points[i + 1] + points[i + 3]) / 2}`;
  }
  return `${path}L${points[points.length - 2]} ${points[points.length - 1]}`;
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? clamp(((px - ax) * dx + (py - ay) * dy) / lengthSquared, 0, 1) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Whether the eraser at (x, y) touches any part of the stroke. */
function strokeNear(stroke: BoardStroke, x: number, y: number, radius: number): boolean {
  const reach = radius + stroke.width / 2;
  const { points } = stroke;
  if (points.length <= 2) return Math.hypot(x - points[0], y - points[1]) <= reach;
  for (let i = 0; i < points.length - 2; i += 2) {
    if (distanceToSegment(x, y, points[i], points[i + 1], points[i + 2], points[i + 3]) <= reach) return true;
  }
  return false;
}

/** What's left of a stroke once the eraser at (x, y) wipes out what it touches: the stroke itself if untouched, else the pieces either side. */
function cutStroke(stroke: BoardStroke, x: number, y: number, radius: number): BoardStroke[] {
  if (!strokeNear(stroke, x, y, radius)) return [stroke];
  const { points } = stroke;
  if (points.length <= 2) return [];
  // Cut where the line's middle comes within reach, so its round ends stop at the eraser's edge
  const reach = radius + stroke.width / 2;
  const pieces: number[][] = [];
  let piece = Math.hypot(points[0] - x, points[1] - y) > reach ? [points[0], points[1]] : [];
  for (let i = 0; i < points.length - 2; i += 2) {
    const [ax, ay, bx, by] = points.slice(i, i + 4);
    const dx = bx - ax;
    const dy = by - ay;
    const a = dx * dx + dy * dy;
    if (a === 0) continue;
    // Where the segment (0 at its start, 1 at its end) enters and leaves the circle within reach
    const b = dx * (ax - x) + dy * (ay - y);
    const c = (ax - x) ** 2 + (ay - y) ** 2 - reach * reach;
    const discriminant = b * b - a * c;
    const enter = discriminant > 0 ? (-b - Math.sqrt(discriminant)) / a : Infinity;
    const leave = discriminant > 0 ? (-b + Math.sqrt(discriminant)) / a : Infinity;
    if (enter >= 1 || leave <= 0) {
      piece.push(bx, by);
      continue;
    }
    if (enter > 0) pieces.push([...piece, round(ax + dx * enter), round(ay + dy * enter)]);
    piece = leave < 1 ? [round(ax + dx * leave), round(ay + dy * leave), bx, by] : [];
  }
  pieces.push(piece);
  return pieces
    .filter((points) => points.length >= 4)
    .map((points, index) => ({ ...stroke, id: index === 0 ? stroke.id : newId(), points }));
}

/** Tracks an element's rendered size; a callback ref so it follows the element mounting later. */
function useSize<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!element) return;
    // Observing reports the current size right away, then every resize.
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [setElement, size] as const;
}

/** A team being dragged from the bar above the field. */
interface TeamDrag {
  team: number;
  alliance: Alliance;
  station: number;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
  /** The robot's size on screen, for the dragged square. */
  size: number;
}

type Gesture =
  | { pointerId: number; kind: "draw" }
  /** Where the eraser last was, to erase all the way from there */
  | { pointerId: number; kind: "erase"; x: number; y: number }
  | { pointerId: number; kind: "move"; dx: number; dy: number }
  | { pointerId: number; kind: "rotate" };

/**
 * One page of a match's strategy board: the field, the match's teams to drag onto it as
 * robots (which can then be moved and turned), and a pen and eraser for drawing. The field
 * fills whatever room its parent leaves, turned sideways when that draws it bigger.
 * `onChange` gets an update to apply to the page, so quick edits never work from a stale one.
 */
export function StrategyFieldBoard({
  leading,
  pageKey,
  page,
  onChange,
  red,
  blue,
}: {
  /** Controls to start the bar above the field with (e.g. back and the page tabs). */
  leading?: ReactNode;
  /** Which page this is; switching pages drops the selected robot. */
  pageKey: string;
  page: BoardPage;
  onChange: (update: (page: BoardPage) => BoardPage) => void;
  red: number[];
  blue: number[];
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  // Everything on the field, in field pixels however it's turned
  const fieldRef = useRef<SVGGElement>(null);
  const [boxRef, box] = useSize<HTMLDivElement>();
  const landscapeScale = Math.min(box.width / FIELD_WIDTH, box.height / FIELD_HEIGHT);
  const portraitScale = Math.min(box.width / FIELD_HEIGHT, box.height / FIELD_WIDTH);
  // Turned upright when that draws it noticeably bigger, e.g. on a phone held upright. Red is
  // always on the left, or at the bottom when upright.
  const rotated = portraitScale > landscapeScale * 1.1;
  const fitScale = rotated ? portraitScale : landscapeScale;
  /** Screen pixels per field pixel. */
  const scale = fitScale > 0 ? fitScale : 1;
  const viewWidth = rotated ? FIELD_HEIGHT : FIELD_WIDTH;
  const viewHeight = rotated ? FIELD_WIDTH : FIELD_HEIGHT;
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(TAG_COLORS[0]);
  const [penSize, setPenSize] = useState(PEN_SIZES[1]);
  const [penStyle, setPenStyle] = useState<PenStyle>("solid");
  const [selection, setSelection] = useState<{ pageKey: string; team: number } | null>(null);
  const selected = tool === "move" && selection?.pageKey === pageKey ? selection.team : null;
  /** Whether the eraser takes out every line it touches, or just the part under it. */
  const [eraseWholeLines, setEraseWholeLines] = useState(false);
  const [eraserAt, setEraserAt] = useState<{ x: number; y: number } | null>(null);
  const [teamDrag, setTeamDrag] = useState<TeamDrag | null>(null);

  // The line being drawn and the robot being moved or turned, shown until the gesture ends and
  // then saved. Mirrored in refs so the gesture's last event always sees the latest.
  const gesture = useRef<Gesture | null>(null);
  const [draft, setDraftState] = useState<BoardStroke | null>(null);
  const draftRef = useRef<BoardStroke | null>(null);
  const setDraft = (stroke: BoardStroke | null) => {
    draftRef.current = stroke;
    setDraftState(stroke);
  };
  const [preview, setPreviewState] = useState<BoardRobot | null>(null);
  const previewRef = useRef<BoardRobot | null>(null);
  const setPreview = (robot: BoardRobot | null) => {
    previewRef.current = robot;
    setPreviewState(robot);
  };

  const robots = page.robots.map((robot) => (preview?.team === robot.team ? preview : robot));
  const teams = [
    ...red.map((team, station) => ({ team, alliance: "red" as const, station })),
    ...blue.map((team, station) => ({ team, alliance: "blue" as const, station })),
  ];
  const handleRadius = clamp(HANDLE_RADIUS_PX / scale, ...HANDLE_RADIUS_RANGE);
  const handleHitRadius = Math.max(handleRadius, Math.min(HANDLE_HIT_PX / scale, HANDLE_HIT_MAX));

  const removeRobot = (team: number) => {
    onChange((current) => ({ ...current, robots: current.robots.filter((robot) => robot.team !== team) }));
    setSelection(null);
  };

  // Delete or Backspace removes the selected robot; Escape lets go of it
  useEffect(() => {
    if (selected === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        onChange((current) => ({ ...current, robots: current.robots.filter((robot) => robot.team !== selected) }));
        setSelection(null);
      } else if (event.key === "Escape") {
        setSelection(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, onChange]);

  /** A screen point in field pixels. */
  const toField = (clientX: number, clientY: number) => {
    const matrix = fieldRef.current?.getScreenCTM();
    if (!matrix) return null;
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  };

  /** Erases along the eraser's path from one spot to the next, filled in so a quick swipe doesn't skip over lines. */
  const erase = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const radius = ERASER_RADIUS_PX / scale;
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (radius / 2)));
    onChange((current) => {
      let strokes = current.strokes;
      for (let step = 1; step <= steps; step++) {
        const x = from.x + ((to.x - from.x) * step) / steps;
        const y = from.y + ((to.y - from.y) * step) / steps;
        strokes = eraseWholeLines
          ? strokes.filter((stroke) => !strokeNear(stroke, x, y, radius))
          : strokes.flatMap((stroke) => cutStroke(stroke, x, y, radius));
      }
      const changed = strokes.length !== current.strokes.length || strokes.some((stroke, index) => stroke !== current.strokes[index]);
      return changed ? { ...current, strokes } : current;
    });
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (gesture.current || event.button > 0) return;
    const at = toField(event.clientX, event.clientY);
    if (!at) return;
    if (tool === "pen") {
      event.currentTarget.setPointerCapture(event.pointerId);
      gesture.current = { pointerId: event.pointerId, kind: "draw" };
      setDraft({
        id: newId(),
        color,
        width: penStyle === "highlighter" ? penSize * HIGHLIGHTER_WIDTH : penSize,
        ...(penStyle !== "solid" && { style: penStyle }),
        points: [round(at.x), round(at.y)],
      });
    } else if (tool === "eraser") {
      event.currentTarget.setPointerCapture(event.pointerId);
      gesture.current = { pointerId: event.pointerId, kind: "erase", ...at };
      erase(at, at);
    } else {
      // Robots stop their own presses, so this is the field itself
      setSelection(null);
    }
  };

  const startRobotGesture = (event: React.PointerEvent, robot: BoardRobot, kind: "move" | "rotate") => {
    if (tool !== "move" || gesture.current || event.button > 0) return;
    event.stopPropagation();
    const at = toField(event.clientX, event.clientY);
    if (!at) return;
    svgRef.current?.setPointerCapture(event.pointerId);
    gesture.current = kind === "move"
      ? { pointerId: event.pointerId, kind, dx: at.x - robot.x, dy: at.y - robot.y }
      : { pointerId: event.pointerId, kind };
    setSelection({ pageKey, team: robot.team });
    setPreview(robot);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const at = toField(event.clientX, event.clientY);
    if (!at) return;
    if (tool === "eraser") setEraserAt(at);
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (current.kind === "draw") {
      const stroke = draftRef.current;
      if (!stroke) return;
      const n = stroke.points.length;
      // Points closer than a screen pixel apart add nothing but size
      if (Math.hypot(at.x - stroke.points[n - 2], at.y - stroke.points[n - 1]) < 1 / scale) return;
      setDraft({ ...stroke, points: [...stroke.points, round(at.x), round(at.y)] });
    } else if (current.kind === "erase") {
      erase(current, at);
      gesture.current = { ...current, ...at };
    } else {
      const robot = previewRef.current;
      if (!robot) return;
      setPreview(current.kind === "move"
        ? {
            ...robot,
            x: round(clamp(at.x - current.dx, HALF, FIELD_WIDTH - HALF)),
            y: round(clamp(at.y - current.dy, HALF, FIELD_HEIGHT - HALF)),
          }
        // The handle sits in front of the robot, so the robot faces the pointer
        : { ...robot, angle: snapAngle((Math.atan2(at.y - robot.y, at.x - robot.x) * 180) / Math.PI + 90) });
    }
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    const ended = gesture.current;
    if (!ended || ended.pointerId !== event.pointerId) return;
    gesture.current = null;
    const stroke = draftRef.current;
    const robot = previewRef.current;
    if (ended.kind === "draw" && stroke) {
      onChange((current) => ({ ...current, strokes: [...current.strokes, stroke] }));
    } else if ((ended.kind === "move" || ended.kind === "rotate") && robot) {
      onChange((current) => ({ ...current, robots: current.robots.map((item) => (item.team === robot.team ? robot : item)) }));
    }
    setDraft(null);
    setPreview(null);
  };

  const startTeamDrag = (event: React.PointerEvent<HTMLButtonElement>, team: (typeof teams)[number]) => {
    if (event.button > 0) return;
    // Captured, so the drag keeps going when the pointer leaves the button
    event.currentTarget.setPointerCapture(event.pointerId);
    setTeamDrag({
      ...team,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      size: ROBOT_SIZE * scale,
    });
  };

  const moveTeamDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!teamDrag || teamDrag.pointerId !== event.pointerId) return;
    setTeamDrag({
      ...teamDrag,
      x: event.clientX,
      y: event.clientY,
      moved: teamDrag.moved || Math.hypot(event.clientX - teamDrag.startX, event.clientY - teamDrag.startY) > TAP_SLOP,
    });
  };

  /** Drops a dragged team where it was let go, or puts a tapped one on its alliance's side. */
  const endTeamDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = teamDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setTeamDrag(null);
    if (event.type === "pointercancel") return;
    const existing = page.robots.find((robot) => robot.team === drag.team);
    let spot = startingSpot(drag.alliance, drag.station);
    if (drag.moved) {
      const rect = svgRef.current?.getBoundingClientRect();
      const onField = !!rect && event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      const at = onField ? toField(event.clientX, event.clientY) : null;
      // Let go off the field: nothing changes
      if (!at) return;
      spot = { ...spot, x: at.x, y: at.y };
    } else if (existing) {
      // Tapping a team that's already out picks its robot up instead
      setTool("move");
      setSelection({ pageKey, team: drag.team });
      return;
    }
    const robot: BoardRobot = {
      team: drag.team,
      alliance: drag.alliance,
      x: round(clamp(spot.x, HALF, FIELD_WIDTH - HALF)),
      y: round(clamp(spot.y, HALF, FIELD_HEIGHT - HALF)),
      angle: existing?.angle ?? spot.angle,
    };
    onChange((current) => ({ ...current, robots: [...current.robots.filter((item) => item.team !== robot.team), robot] }));
    // Ready to move or turn it
    setTool("move");
    setSelection({ pageKey, team: robot.team });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* One compact bar, so the field gets the rest of the screen */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {leading}

        {/* The match's teams: drag one onto the field (or tap it) to place its robot */}
        <div className="flex gap-2">
          {(["red", "blue"] as const).map((alliance) => (
            <div key={alliance} className="flex gap-1">
              {teams.filter((team) => team.alliance === alliance).map((team) => {
                const placed = page.robots.some((robot) => robot.team === team.team);
                return (
                  <button
                    key={team.team}
                    type="button"
                    onPointerDown={(event) => startTeamDrag(event, team)}
                    onPointerMove={moveTeamDrag}
                    onPointerUp={endTeamDrag}
                    onPointerCancel={endTeamDrag}
                    title={placed ? `Drag to move ${team.team}'s robot, or tap to select it` : `Drag ${team.team} onto the field, or tap to place it`}
                    className={`h-7 min-w-11 cursor-grab touch-none select-none rounded-md px-1.5 font-mono text-xs font-semibold tabular-nums text-white shadow-sm transition-opacity active:cursor-grabbing ${
                      placed ? "opacity-45" : ""
                    } ${team.team === OUR_TEAM ? "underline decoration-2 underline-offset-2" : ""}`}
                    style={{ backgroundColor: ALLIANCE_COLOR[team.alliance] }}
                  >
                    {team.team}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex gap-0.5 rounded-md border bg-card p-0.5">
          {TOOLS.map(({ key, label, icon: Icon }) => (
            <Button
              key={key}
              size="icon"
              variant={tool === key ? "default" : "ghost"}
              className="h-7 w-7"
              onClick={() => setTool(key)}
              aria-pressed={tool === key}
              aria-label={label}
              title={label}
            >
              <Icon className="h-4 w-4" />
            </Button>
          ))}
        </div>

        {tool === "pen" && (
          <>
            <TagColorPicker color={color} onChange={setColor} />
            <div className="flex items-center" aria-label="Pen size">
              {PEN_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setPenSize(size)}
                  aria-label={`Pen size ${size}`}
                  aria-pressed={penSize === size}
                  className={`flex h-7 w-7 items-center justify-center rounded-md ${penSize === size ? "bg-accent" : "hover:bg-accent/50"}`}
                >
                  <span className="rounded-full" style={{ width: 3 + size / 2, height: 3 + size / 2, backgroundColor: color }} />
                </button>
              ))}
            </div>
            <div className="flex items-center" aria-label="Line style">
              {PEN_STYLES.map(({ key, label }) => {
                // A short sample of the style, in the pen's color
                const width = key === "highlighter" ? 7 : key === "dotted" ? 3 : 2.5;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPenStyle(key)}
                    aria-label={label}
                    aria-pressed={penStyle === key}
                    title={label}
                    className={`flex h-7 w-7 items-center justify-center rounded-md ${penStyle === key ? "bg-accent" : "hover:bg-accent/50"}`}
                  >
                    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
                      <line
                        x1={key === "highlighter" ? 5 : 3}
                        y1={10}
                        x2={key === "highlighter" ? 15 : 17}
                        y2={10}
                        stroke={color}
                        strokeWidth={width}
                        strokeLinecap="round"
                        {...(key === "dashed" ? { strokeDasharray: "3 4.5" } : styleAttributes(key, width))}
                      />
                    </svg>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {selected !== null && (
          <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => removeRobot(selected)}>
            <Trash2 className="h-3.5 w-3.5" />
            Remove {selected}
          </Button>
        )}

        {/* Picks up the eraser too, as that's all it changes */}
        <Button
          size="sm"
          variant={eraseWholeLines ? "default" : "outline"}
          className="ml-auto h-7 gap-1 px-2 text-xs"
          onClick={() => {
            setEraseWholeLines(!eraseWholeLines);
            setTool("eraser");
          }}
          aria-pressed={eraseWholeLines}
          title={eraseWholeLines ? "The eraser takes out whole lines" : "The eraser takes out only what it touches"}
        >
          <Eraser className="h-3.5 w-3.5" />
          Erase whole lines
        </Button>
      </div>

      {/* The field, as big as fits in the rest of the screen */}
      <div ref={boxRef} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {box.width > 0 && box.height > 0 && (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${viewWidth} ${viewHeight}`}
            width={viewWidth * scale}
            height={viewHeight * scale}
            className={`block shrink-0 touch-none select-none rounded-lg ${tool === "pen" ? "cursor-crosshair" : tool === "eraser" ? "cursor-none" : ""}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={() => setEraserAt(null)}
          >
            <g ref={fieldRef} transform={rotated ? `translate(0 ${FIELD_WIDTH}) rotate(-90)` : undefined}>
              <image href={fieldImage} width={FIELD_WIDTH} height={FIELD_HEIGHT} />

              {/* Lines under the robots, so team numbers stay readable */}
              <g fill="none" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none">
                {[...page.strokes, ...(draft ? [draft] : [])].map((stroke) => (
                  <path
                    key={stroke.id}
                    d={strokePath(stroke.points)}
                    stroke={stroke.color}
                    strokeWidth={stroke.width}
                    {...styleAttributes(stroke.style, stroke.width)}
                  />
                ))}
              </g>

              {robots.map((robot) => {
                const isSelected = selected === robot.team;
                return (
                  <g
                    key={robot.team}
                    transform={`translate(${robot.x} ${robot.y})`}
                    // The pen and eraser work over robots too
                    pointerEvents={tool === "move" ? undefined : "none"}
                    className={tool === "move" ? "cursor-grab active:cursor-grabbing" : undefined}
                    onPointerDown={(event) => startRobotGesture(event, robot, "move")}
                  >
                    <g transform={`rotate(${robot.angle})`}>
                      {/* Not while it's being moved or turned */}
                      {isSelected && preview?.team !== robot.team && (
                        <rect
                          x={-HALF - 5}
                          y={-HALF - 5}
                          width={ROBOT_SIZE + 10}
                          height={ROBOT_SIZE + 10}
                          rx={9}
                          fill="none"
                          stroke="white"
                          strokeWidth={2}
                          strokeDasharray="6 4"
                        />
                      )}
                      <rect
                        x={-HALF}
                        y={-HALF}
                        width={ROBOT_SIZE}
                        height={ROBOT_SIZE}
                        rx={6}
                        fill={ALLIANCE_COLOR[robot.alliance]}
                        stroke="white"
                        strokeWidth={3}
                      />
                      {isSelected && (
                        // Drag to turn the robot: centered on its front edge
                        <g className="cursor-grab" onPointerDown={(event) => startRobotGesture(event, robot, "rotate")}>
                          <circle cx={0} cy={-HALF} r={handleHitRadius} fill="transparent" />
                          <circle
                            cx={0}
                            cy={-HALF}
                            r={handleRadius}
                            fill="white"
                            stroke={ALLIANCE_COLOR[robot.alliance]}
                            strokeWidth={2}
                            pointerEvents="none"
                          />
                        </g>
                      )}
                    </g>
                    {/* Upright whichever way the robot (or the field) faces */}
                    <text
                      transform={rotated ? "rotate(90)" : undefined}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={18}
                      fontWeight={700}
                      fill="white"
                      pointerEvents="none"
                      className="font-mono"
                    >
                      {robot.team}
                    </text>
                  </g>
                );
              })}

              {tool === "eraser" && eraserAt && (
                <circle
                  cx={eraserAt.x}
                  cy={eraserAt.y}
                  r={ERASER_RADIUS_PX / scale}
                  fill="rgb(255 255 255 / 0.35)"
                  stroke="black"
                  strokeWidth={1.5 / scale}
                  pointerEvents="none"
                />
              )}
            </g>
          </svg>
        )}
      </div>

      {/* The robot following a team being dragged from the bar */}
      {teamDrag?.moved && (
        <div
          className="pointer-events-none fixed z-50 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border-2 border-white font-mono text-xs font-bold text-white shadow-lg"
          style={{
            left: teamDrag.x,
            top: teamDrag.y,
            width: Math.max(teamDrag.size, 28),
            height: Math.max(teamDrag.size, 28),
            backgroundColor: ALLIANCE_COLOR[teamDrag.alliance],
          }}
        >
          {teamDrag.team}
        </div>
      )}
    </div>
  );
}
