import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isDevEventId } from "@/lib/devMode";
import { isOutlier, outlierFences } from "@/lib/outliers";
import {
  getDevEventQualRows,
  getDevEventQuantRows,
  getEventPitRows,
  getEventQualRows,
  getEventQuantRows,
  type PitRow,
  type QualRow,
  type QuantRow,
  type ScoutingDataType,
} from "@/lib/strategyData";

const ROLE_LABELS: Record<string, string> = {
  red1: "Red 1", red2: "Red 2", red3: "Red 3",
  blue1: "Blue 1", blue2: "Blue 2", blue3: "Blue 3",
};

function formatScoutedAt(iso: string): string {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** "Level2" → "L2"; TBA's other values ("None", "Unknown") pass through. */
function formatClimb(value: string | null): string {
  if (!value) return "";
  const level = value.match(/level\s*(\d)/i);
  return level ? `L${level[1]}` : value;
}

function capitalize(value: string | null): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

function allianceTextClass(alliance: string | null): string {
  return alliance?.startsWith("red") ? "text-red-500" : alliance?.startsWith("blue") ? "text-blue-500" : "";
}

// ---------------------------------------------------------------------------
// Generic table
// ---------------------------------------------------------------------------

// Every column is a fixed 150px, wide enough for most headers on one line.
// The table gets an exact total width too: sized to its content instead, a
// long value's full (truncated) text would stretch its column.
const COLUMN_WIDTH_PX = 150;

interface DataColumn<Row> {
  header: string;
  /** Text shown in the cell (cut off with an ellipsis) and in its popup; for photos, the image URL. */
  value: (row: Row) => string;
  /**
   * "text" (default): centered, opens a popup only when cut off.
   * "comment": left-aligned free text, opens a popup whenever it isn't empty.
   * "photo": shows "View photo" and opens the image.
   */
  kind?: "text" | "comment" | "photo";
  /** Styled content for a text cell and its popup, in place of the plain `value`. */
  render?: (row: Row) => ReactNode;
  className?: (row: Row) => string;
  /** Popup heading; defaults to the column header. */
  popupTitle?: (row: Row) => string;
  /** Makes the column sortable by clicking its header; empty values (null / "") always sort last. */
  sortValue?: (row: Row) => string | number | null;
  /** A number checked against the same team's other rows (the table's `outlierGroup`); outliers turn the cell red. */
  outlierValue?: (row: Row) => number | null;
}

// Deeper red on hover (important, so the clickable cells' hover color doesn't replace it)
const SUSPICIOUS_CELL = "bg-red-600/25 hover:bg-red-600/40! font-semibold text-red-700 dark:text-red-300";

const formatFence = (value: number) => String(Number(Math.max(0, value).toFixed(1)));

// Fixed, equal-width, centered columns with a vertical rule between each (none after the
// last). Rows stay one line tall: values that don't fit are cut off with an ellipsis and
// open in full on click.
const TABLE_CLASSES = "table-fixed text-center [&_th]:text-center [&_td]:border-r [&_td]:border-border [&_td]:truncate [&_td:last-child]:border-r-0 [&_th]:h-auto [&_th]:border-r [&_th]:border-border [&_th]:py-2 [&_th[aria-sort]]:p-0 [&_th]:leading-tight [&_th]:whitespace-normal [&_th:last-child]:border-r-0";

type SortDirection = "asc" | "desc";

const compareSortValues = (a: string | number | null, b: string | number | null, direction: SortDirection) => {
  const aEmpty = a === null || a === "";
  const bEmpty = b === null || b === "";
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
  const order = typeof a === "number" && typeof b === "number"
    ? a - b
    : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  return direction === "asc" ? order : -order;
};

interface Popup {
  title: string;
  description: string;
  content?: ReactNode;
  imageUrl?: string;
}

/** Registers an element with the table's shared ResizeObserver; returns an unregister function. */
type ObserveTruncation = (element: Element, onChange: (truncated: boolean) => void) => () => void;
const TruncationContext = createContext<ObserveTruncation | null>(null);

// Applied only to cells that render a button (each cell knows that from its own
// state), so the whole cell gets the pointer and hover highlight. Deliberately
// not done with :has(button) — across thousands of cells that selector made
// every click re-check styles for the whole table.
const CLICKABLE_CELL = "relative cursor-pointer hover:bg-accent/60";
// An empty button laid over the whole cell: the click target, while the text underneath stays put.
const CELL_BUTTON = "absolute inset-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

/** Shows or hides the table's hover tooltip for a cell (null hides it). */
type ShowHint = (text: string | null, cell?: Element) => void;

/** A plain text cell that becomes clickable when its text doesn't fit, or when it has a hint to show. */
function TextCell({ text, content, className, hint, onHint, onOpen, getLabel }: {
  text: string;
  /** What to show; defaults to `text`. */
  content?: ReactNode;
  className: string;
  /** Tooltip text on hover (e.g. why the value is flagged); also makes the cell open its popup. */
  hint?: string;
  onHint: ShowHint;
  onOpen: () => void;
  /** Built only once the cell is cut off and actually gets a button. */
  getLabel: () => string;
}) {
  const observe = useContext(TruncationContext);
  const ref = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    if (!observe || !ref.current) return;
    return observe(ref.current, setTruncated);
  }, [observe, text]);

  return (
    <TableCell
      className={`${truncated || hint ? CLICKABLE_CELL : ""} ${className}`}
      onMouseEnter={hint ? (event) => onHint(hint, event.currentTarget) : undefined}
      onMouseLeave={hint ? () => onHint(null) : undefined}
    >
      <span ref={ref} className="block truncate">{content ?? text}</span>
      {(truncated || hint) && <button type="button" onClick={onOpen} className={CELL_BUTTON} aria-label={getLabel()} />}
    </TableCell>
  );
}

interface DataRowProps<Row> {
  row: Row;
  columns: DataColumn<Row>[];
  describeRow: (row: Row) => string;
  onOpen: (row: Row, column: DataColumn<Row>) => void;
  onHint: ShowHint;
  /** Column header → why that cell's value is an outlier, for this row's flagged cells. */
  suspicious?: ReadonlyMap<string, string>;
}

/**
 * One table row. Memoized (its props are stable), so opening a popup re-renders
 * no rows and re-sorting only reorders them — re-rendering every cell of a few
 * hundred rows on each click is what made these clicks feel slow.
 */
const DataRow = memo(function DataRow<Row extends { id: string }>({ row, columns, describeRow, onOpen, onHint, suspicious }: DataRowProps<Row>) {
  return (
    <TableRow>
      {columns.map((column) => {
        const value = column.value(row);
        const suspiciousReason = suspicious?.get(column.header);
        const className = `${column.className?.(row) ?? ""} ${suspiciousReason ? SUSPICIOUS_CELL : ""}`;
        const getLabel = () => `Open ${(column.popupTitle?.(row) ?? column.header).toLowerCase()}: ${describeRow(row)}`;
        if (column.kind === "comment" || column.kind === "photo") {
          return (
            <TableCell key={column.header} className={`${value ? CLICKABLE_CELL : ""} text-xs ${column.kind === "comment" ? "text-left" : ""} ${className}`}>
              {value && (
                <>
                  {column.kind === "photo"
                    ? <span className="font-medium text-primary underline-offset-2 [td:hover_&]:underline">View photo</span>
                    : <span className="block truncate">{value}</span>}
                  <button type="button" onClick={() => onOpen(row, column)} className={CELL_BUTTON} aria-label={getLabel()} />
                </>
              )}
            </TableCell>
          );
        }
        return (
          <TextCell
            key={column.header}
            text={value}
            content={column.render?.(row)}
            className={className}
            hint={suspiciousReason}
            onHint={onHint}
            onOpen={() => onOpen(row, column)}
            getLabel={getLabel}
          />
        );
      })}
    </TableRow>
  );
}) as <Row extends { id: string }>(props: DataRowProps<Row>) => ReactNode;

function DataTable<Row extends { id: string }>({ rows, columns, describeRow, outlierGroup }: {
  rows: Row[];
  columns: DataColumn<Row>[];
  /** Context line under a popup's title, e.g. "Team 254 · Match 12 · Scouted by Sam". */
  describeRow: (row: Row) => string;
  /** Which robot a row is about (its team), for the `outlierValue` columns. */
  outlierGroup?: (row: Row) => number | null;
}) {
  const [popup, setPopup] = useState<Popup | null>(null);
  // Clicking a sortable header sorts ascending, then descending, then back to the default order.
  const [sort, setSort] = useState<{ header: string; direction: SortDirection } | null>(null);
  const cycleSort = (header: string) => setSort((current) =>
    current?.header !== header ? { header, direction: "asc" }
      : current.direction === "asc" ? { header, direction: "desc" }
      : null
  );
  const sortedRows = useMemo(() => {
    const sortValue = sort && columns.find((column) => column.header === sort.header)?.sortValue;
    // Array sort is stable, so rows that tie keep the default (match / role) order.
    return sortValue
      ? [...rows].sort((a, b) => compareSortValues(sortValue(a), sortValue(b), sort.direction))
      : rows;
  }, [rows, columns, sort]);

  // Row id → its flagged cells: a value outside its own team's 1.5×IQR range for that column.
  // Teams with too few submissions are skipped.
  const suspiciousByRow = useMemo(() => {
    const result = new Map<string, Map<string, string>>();
    const outlierColumns = columns.filter((column) => column.outlierValue);
    if (!outlierGroup || outlierColumns.length === 0) return result;
    const byTeam = new Map<number, Row[]>();
    for (const row of rows) {
      const team = outlierGroup(row);
      if (team === null) continue;
      const teamRows = byTeam.get(team);
      if (teamRows) teamRows.push(row);
      else byTeam.set(team, [row]);
    }
    for (const [team, teamRows] of byTeam) {
      for (const column of outlierColumns) {
        const valued = teamRows.flatMap((row) => {
          const value = column.outlierValue!(row);
          return value === null ? [] : [{ row, value }];
        });
        const fences = outlierFences(valued.map(({ value }) => value));
        if (!fences) continue;
        const [low, high] = fences;
        for (const { row, value } of valued) {
          if (!isOutlier(value, fences)) continue;
          const flagged = result.get(row.id) ?? new Map<string, string>();
          flagged.set(column.header, `Suspicious: outside team ${team}'s usual ${column.header.toLowerCase()} (${formatFence(low)}–${formatFence(high)})`);
          result.set(row.id, flagged);
        }
      }
    }
    return result;
  }, [rows, columns, outlierGroup]);

  // One ResizeObserver for the whole table, so text cells can tell when they're cut off.
  const [truncation] = useState(() => {
    const callbacks = new Map<Element, (truncated: boolean) => void>();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver((entries) => {
      for (const { target } of entries) callbacks.get(target)?.(target.scrollWidth > target.clientWidth);
    });
    const observe: ObserveTruncation = (element, onChange) => {
      callbacks.set(element, onChange);
      observer?.observe(element);
      return () => {
        callbacks.delete(element);
        observer?.unobserve(element);
      };
    };
    return { observe, disconnect: () => observer?.disconnect() };
  });
  useEffect(() => truncation.disconnect, [truncation]);

  // Stable while the rows are (describeRow is a module constant), so the memoized rows don't re-render.
  // A flagged cell's popup also says why, for touch screens that can't hover.
  const openPopup = useCallback((row: Row, column: DataColumn<Row>) => {
    const value = column.value(row);
    const reason = suspiciousByRow.get(row.id)?.get(column.header);
    const content = column.render?.(row) ?? value;
    setPopup({
      title: column.popupTitle?.(row) ?? column.header,
      description: describeRow(row),
      ...(column.kind === "photo"
        ? { imageUrl: value }
        : { content: reason ? <>{content}<p className="mt-2 text-red-600 dark:text-red-400">{reason}</p></> : content }),
    });
  }, [describeRow, suspiciousByRow]);

  // The hover tooltip, drawn above the cell in a portal so the table's clipping doesn't cut it off
  const [hint, setHint] = useState<{ text: string; x: number; y: number } | null>(null);
  const showHint = useCallback<ShowHint>((text, cell) => {
    if (!text || !cell) return setHint(null);
    const rect = cell.getBoundingClientRect();
    setHint({ text, x: rect.left + rect.width / 2, y: rect.top });
  }, []);
  // Scrolling moves the cell out from under it
  useEffect(() => {
    if (!hint) return;
    const hide = () => setHint(null);
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [hint]);

  // Header and body are separate tables with the same fixed column widths, so they line up.
  const tableStyle = { width: columns.length * COLUMN_WIDTH_PX };
  const colgroup = (
    <colgroup>
      {columns.map((column) => <col key={column.header} style={{ width: COLUMN_WIDTH_PX }} />)}
    </colgroup>
  );

  return (
    // Bottom margin keeps the last rows clear of the floating page nav.
    <Card className="mb-20 gap-0 overflow-hidden py-0">
      {/* One box scrolls the table both ways, sized to fit on screen (clear of the floating
          nav), with the header strip stuck to its top. Header and body move in the same scroll,
          so sideways they stay in step natively. */}
      <div className="max-h-[calc(100dvh-6rem)] overflow-auto">
        <div className="sticky top-0 z-10 w-max bg-card">
          <Table noWrapper style={tableStyle} className={TABLE_CLASSES}>
            {colgroup}
            <TableHeader className="bg-muted/50">
              <TableRow>
                {columns.map((column) => {
                  if (!column.sortValue) return <TableHead key={column.header}>{column.header}</TableHead>;
                  const direction = sort?.header === column.header ? sort.direction : null;
                  const SortIcon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ArrowUpDown;
                  return (
                    <TableHead
                      key={column.header}
                      aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"}
                    >
                      <button
                        type="button"
                        onClick={() => cycleSort(column.header)}
                        className="flex h-full w-full cursor-pointer items-center justify-center gap-1 px-2 py-2 hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none"
                        title="Sort"
                      >
                        {column.header}
                        <SortIcon className={`h-3.5 w-3.5 shrink-0 ${direction ? "text-foreground" : "text-muted-foreground/60"}`} />
                      </button>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
          </Table>
        </div>

          <Table noWrapper style={tableStyle} className={TABLE_CLASSES}>
            {colgroup}
            <TruncationContext.Provider value={truncation.observe}>
              <TableBody>
                {sortedRows.map((row) => (
                  <DataRow key={row.id} row={row} columns={columns} describeRow={describeRow} onOpen={openPopup} onHint={showHint} suspicious={suspiciousByRow.get(row.id)} />
                ))}
              </TableBody>
            </TruncationContext.Provider>
          </Table>
      </div>

      {hint && createPortal(
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 max-w-64 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2 py-1 text-center text-xs text-popover-foreground shadow-md"
          style={{ left: hint.x, top: hint.y - 6 }}
        >
          {hint.text}
        </div>,
        document.body
      )}

      <Dialog open={popup !== null} onOpenChange={(open) => { if (!open) setPopup(null); }}>
        <DialogContent className={popup?.imageUrl ? "sm:max-w-2xl" : "sm:max-w-lg"}>
          {popup && (
            <>
              <DialogHeader>
                <DialogTitle>{popup.title}</DialogTitle>
                <DialogDescription>{popup.description}</DialogDescription>
              </DialogHeader>
              {popup.imageUrl ? (
                <img src={popup.imageUrl} alt={popup.title} className="max-h-[70vh] w-full rounded-md bg-muted object-contain" />
              ) : (
                <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words text-sm">{popup.content}</div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Columns per data type
// ---------------------------------------------------------------------------

const timeScoutedColumn = <Row extends { scoutedAt: string }>(): DataColumn<Row> => ({
  header: "Time scouted",
  value: (row) => formatScoutedAt(row.scoutedAt),
  className: () => "text-xs tabular-nums",
  sortValue: (row) => row.scoutedAt,
});

const scouterColumn = <Row extends { scouterName: string | null }>(): DataColumn<Row> => ({
  header: "Scouter",
  value: (row) => row.scouterName ?? "",
  sortValue: (row) => row.scouterName,
});

// Alliance stations sort Red 1–3 then Blue 1–3 (red before blue for qualitative), not alphabetically.
const ROLE_SORT_ORDER = ["red1", "red2", "red3", "blue1", "blue2", "blue3"];

const QUANT_COLUMNS: DataColumn<QuantRow>[] = [
  timeScoutedColumn(),
  scouterColumn(),
  { header: "Match", value: (row) => String(row.matchNumber ?? ""), className: () => "tabular-nums", sortValue: (row) => row.matchNumber },
  {
    header: "Role",
    value: (row) => ROLE_LABELS[row.role] ?? row.role,
    className: (row) => `font-medium ${allianceTextClass(row.role)}`,
    sortValue: (row) => (ROLE_SORT_ORDER.includes(row.role) ? ROLE_SORT_ORDER.indexOf(row.role) : null),
  },
  { header: "Team", value: (row) => String(row.teamNumber ?? ""), className: () => "font-semibold tabular-nums", sortValue: (row) => row.teamNumber },
  { header: "Match type", value: (row) => capitalize(row.matchType) },
  { header: "Auto shots", value: (row) => String(row.autoShots), className: () => "tabular-nums", sortValue: (row) => row.autoShots, outlierValue: (row) => row.autoShots },
  { header: "Teleop shots", value: (row) => String(row.teleopShots), className: () => "tabular-nums", sortValue: (row) => row.teleopShots, outlierValue: (row) => row.teleopShots },
  { header: "Auto climb", value: (row) => formatClimb(row.autoClimb) },
  { header: "Endgame climb", value: (row) => formatClimb(row.endgameClimb) },
  { header: "Total points", value: (row) => String(row.totalPoints), className: () => "font-semibold tabular-nums", sortValue: (row) => row.totalPoints, outlierValue: (row) => row.totalPoints },
  { header: "Comments", value: (row) => row.comments, kind: "comment" },
  { header: "Robot problems", value: (row) => row.robotProblems, kind: "comment" },
  { header: "Errors", value: (row) => row.errors, kind: "comment" },
  { header: "Defense", value: (row) => row.defense, kind: "comment" },
];

// Darker shades in light themes so yellow stays readable on a light background.
const RANK_TEXT_CLASSES: Record<number, string> = {
  1: "text-green-600 dark:text-green-400",
  2: "text-yellow-600 dark:text-yellow-400",
  3: "text-red-600 dark:text-red-400",
};

const rankedTeams = (row: QualRow) => row.teams.filter((team) => team.teamNumber !== null);

const QUAL_COLUMNS: DataColumn<QualRow>[] = [
  timeScoutedColumn(),
  scouterColumn(),
  { header: "Match", value: (row) => String(row.matchNumber ?? ""), className: () => "tabular-nums", sortValue: (row) => row.matchNumber },
  {
    header: "Color",
    value: (row) => capitalize(row.alliance),
    className: (row) => `font-medium ${allianceTextClass(row.alliance)}`,
    sortValue: (row) => (row.alliance === "red" ? 0 : row.alliance === "blue" ? 1 : null),
  },
  {
    // Best-ranked first (green 1st, yellow 2nd, red 3rd), so each entry lines up
    // with the 1st / 2nd / 3rd comment columns after it.
    header: "Team rankings",
    value: (row) => rankedTeams(row).map((team) => team.teamNumber).join(", "),
    render: (row) => rankedTeams(row).map((team, index) => (
      <span key={team.teamNumber}>
        {index > 0 && <span className="text-muted-foreground">, </span>}
        <span className={`font-semibold ${team.rank ? RANK_TEXT_CLASSES[team.rank] ?? "" : ""}`}>{team.teamNumber}</span>
      </span>
    )),
    className: () => "tabular-nums",
  },
  ...[0, 1, 2].map((index): DataColumn<QualRow> => ({
    header: `${["1st", "2nd", "3rd"][index]} comments`,
    value: (row) => row.teams[index].comments,
    kind: "comment",
    popupTitle: (row) => `Team ${row.teams[index].teamNumber ?? index + 1} comments`,
  })),
];

const PIT_COLUMNS: DataColumn<PitRow>[] = [
  timeScoutedColumn(),
  scouterColumn(),
  { header: "Team", value: (row) => String(row.teamNumber ?? ""), className: () => "font-semibold tabular-nums", sortValue: (row) => row.teamNumber },
  { header: "Bumper dimensions", value: (row) => row.dimensions },
  { header: "Robot weight", value: (row) => row.weight },
  { header: "Drivetrain", value: (row) => row.drivetrain },
  { header: "Hopper capacity", value: (row) => row.hopperCapacity },
  { header: "Hopper capacity (raised)", value: (row) => row.hopperCapacityRaised },
  { header: "Shooting speed", value: (row) => row.shootingSpeed },
  { header: "Climb", value: (row) => row.climb },
  { header: "Terrain capabilities", value: (row) => row.terrain },
  { header: "Shooting mechanism", value: (row) => row.shootingMechanism },
  { header: "Driver experience", value: (row) => row.driverExperience },
  { header: "Auto description", value: (row) => row.autoDescription, kind: "comment" },
  { header: "Robot photo", value: (row) => row.photoUrl ?? "", kind: "photo" },
  { header: "Extra notes", value: (row) => row.notes, kind: "comment" },
];

const joinContext = (parts: Array<string | number | false | null | undefined>) => parts.filter(Boolean).join(" · ");

const quantTeam = (row: QuantRow) => row.teamNumber;

const describeQuantRow = (row: QuantRow) => joinContext([
  row.teamNumber && `Team ${row.teamNumber}`,
  row.matchNumber && `Match ${row.matchNumber}`,
  ROLE_LABELS[row.role] ?? row.role,
  row.scouterName && `Scouted by ${row.scouterName}`,
]);

const describeQualRow = (row: QualRow) => joinContext([
  row.matchNumber && `Match ${row.matchNumber}`,
  row.alliance && `${capitalize(row.alliance)} alliance`,
  row.scouterName && `Scouted by ${row.scouterName}`,
]);

const describePitRow = (row: PitRow) => joinContext([
  row.teamNumber && `Team ${row.teamNumber}`,
  row.scouterName && `Scouted by ${row.scouterName}`,
]);

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

type LoadedRows =
  | { type: "quantitative"; rows: QuantRow[] }
  | { type: "qualitative"; rows: QualRow[] }
  | { type: "pit"; rows: PitRow[] };

async function loadRows(type: ScoutingDataType, eventId: string, sandbox: { userId: string; userName: string | null } | null): Promise<LoadedRows> {
  switch (type) {
    case "quantitative":
      return { type, rows: sandbox ? getDevEventQuantRows(sandbox.userId, eventId, sandbox.userName) : await getEventQuantRows(eventId) };
    case "qualitative":
      return { type, rows: sandbox ? getDevEventQualRows(sandbox.userId, eventId, sandbox.userName) : await getEventQualRows(eventId) };
    case "pit":
      // The sandbox has no local pit scouting store.
      return { type, rows: sandbox ? [] : await getEventPitRows(eventId) };
  }
}

const EMPTY_MESSAGES: Record<ScoutingDataType, string> = {
  quantitative: "No quantitative scouting submitted for this event yet.",
  qualitative: "No qualitative scouting submitted for this event yet.",
  pit: "No pit scouting submitted for this event yet.",
};

/** The selected event's quantitative, qualitative or pit scouting submissions as a table. */
export function ScoutingDataTable({ eventId, dataType, userId, userName, devMode }: {
  eventId: string;
  dataType: ScoutingDataType;
  userId: string | undefined;
  userName: string | null;
  devMode: boolean;
}) {
  const loadKey = `${dataType}:${eventId}`;
  // Tagged with what it was loaded for, so switching event or data type shows
  // the loading state instead of the previous table.
  const [loaded, setLoaded] = useState<{ key: string; data: LoadedRows | null; error: string | null } | null>(null);

  useEffect(() => {
    if (!eventId) return;
    let mounted = true;
    const key = `${dataType}:${eventId}`;
    const sandbox = devMode && userId && isDevEventId(eventId) ? { userId, userName } : null;
    loadRows(dataType, eventId, sandbox)
      .then((data) => { if (mounted) setLoaded({ key, data, error: null }); })
      .catch((cause) => {
        console.error(`Could not load ${dataType} scouting data:`, cause);
        if (mounted) setLoaded({ key, data: null, error: cause instanceof Error ? cause.message : "Could not load scouting data." });
      });
    return () => { mounted = false; };
  }, [eventId, dataType, userId, userName, devMode]);

  const current = loaded?.key === loadKey ? loaded : null;

  if (current?.error) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{current.error}</span>
      </div>
    );
  }
  const data = current?.data;
  if (!data) {
    return (
      <p className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />Loading scouting data...
      </p>
    );
  }
  if (data.rows.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground">{EMPTY_MESSAGES[data.type]}</p>
      </Card>
    );
  }

  // Keyed by type so each table keeps its own popup and truncation state.
  switch (data.type) {
    case "quantitative":
      return <DataTable key="quantitative" rows={data.rows} columns={QUANT_COLUMNS} describeRow={describeQuantRow} outlierGroup={quantTeam} />;
    case "qualitative":
      return <DataTable key="qualitative" rows={data.rows} columns={QUAL_COLUMNS} describeRow={describeQualRow} />;
    case "pit":
      return <DataTable key="pit" rows={data.rows} columns={PIT_COLUMNS} describeRow={describePitRow} />;
  }
}
