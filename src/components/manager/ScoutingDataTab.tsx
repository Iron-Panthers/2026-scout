import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Trash2,
  Pencil,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { RecursiveJsonEditor } from "@/components/RecursiveJsonEditor";
import type { Event } from "@/types";

interface SubmissionWithDetails {
  id: string;
  match_id: string;
  role: string;
  scouting_data: Record<string, unknown>;
  schema_version: number;
  team_num: number;
  match_type: string;
  time: string;
  scouter_id?: string;
  created_at: string;
  updated_at: string;
  matches: { match_number: number; event_id: string } | null;
  profiles: { name: string | null } | null;
}

interface ScoutingDataTabProps {
  selectedEvent: string;
  events: Event[];
}

type SortColumn = "match" | "role" | "team" | "scout" | "submitted";
type SortDir = "asc" | "desc";

const ITEMS_PER_PAGE = 25;

const ROLE_LABELS: Record<string, string> = {
  red1: "Red 1",
  red2: "Red 2",
  red3: "Red 3",
  blue1: "Blue 1",
  blue2: "Blue 2",
  blue3: "Blue 3",
  qualRed: "Qual Red",
  qualBlue: "Qual Blue",
};

const ROLE_COLORS: Record<string, string> = {
  red1: "bg-red-950/30 text-red-400 border-red-800/40",
  red2: "bg-red-950/30 text-red-400 border-red-800/40",
  red3: "bg-red-950/30 text-red-400 border-red-800/40",
  qualRed: "bg-red-950/30 text-red-400 border-red-800/40",
  blue1: "bg-blue-950/30 text-blue-400 border-blue-800/40",
  blue2: "bg-blue-950/30 text-blue-400 border-blue-800/40",
  blue3: "bg-blue-950/30 text-blue-400 border-blue-800/40",
  qualBlue: "bg-blue-950/30 text-blue-400 border-blue-800/40",
};

function SortIcon({ col, sortCol, sortDir }: { col: SortColumn; sortCol: SortColumn; sortDir: SortDir }) {
  if (sortCol !== col) return <ChevronsUpDown className="h-3.5 w-3.5 ml-1 opacity-40" />;
  return sortDir === "asc"
    ? <ChevronUp className="h-3.5 w-3.5 ml-1" />
    : <ChevronDown className="h-3.5 w-3.5 ml-1" />;
}

export function ScoutingDataTab({ selectedEvent, events: _events }: ScoutingDataTabProps) {
  const { toast } = useToast();
  const [submissions, setSubmissions] = useState<SubmissionWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Sorting state
  const [sortCol, setSortCol] = useState<SortColumn>("match");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<SubmissionWithDetails | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit state
  const [editTarget, setEditTarget] = useState<SubmissionWithDetails | null>(null);
  const [editData, setEditData] = useState<Record<string, unknown>>({});
  const [editConfirming, setEditConfirming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      if (selectedEvent !== "all") {
        const { data: eventMatches, error: matchError } = await supabase
          .from("matches")
          .select("id")
          .eq("event_id", selectedEvent);

        if (matchError) throw matchError;

        if (!eventMatches || eventMatches.length === 0) {
          setSubmissions([]);
          setLoading(false);
          return;
        }

        const matchIds = eventMatches.map((m) => m.id);
        const { data, error } = await supabase
          .from("scouting_submissions")
          .select("*, matches(match_number, event_id), profiles(name)")
          .in("match_id", matchIds)
          .order("created_at", { ascending: false });

        if (error) throw error;
        setSubmissions((data as SubmissionWithDetails[]) || []);
      } else {
        const { data, error } = await supabase
          .from("scouting_submissions")
          .select("*, matches(match_number, event_id), profiles(name)")
          .order("created_at", { ascending: false });

        if (error) throw error;
        setSubmissions((data as SubmissionWithDetails[]) || []);
      }
    } catch (error) {
      console.error("Error loading submissions:", error);
      toast({
        title: "Error",
        description: "Failed to load scouting submissions",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [selectedEvent, toast]);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedEvent, sortCol, sortDir]);

  // Sorting logic
  const handleSort = (col: SortColumn) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const sorted = [...submissions].sort((a, b) => {
    let cmp = 0;
    switch (sortCol) {
      case "match":
        cmp = (a.matches?.match_number ?? 0) - (b.matches?.match_number ?? 0);
        break;
      case "role":
        cmp = (ROLE_LABELS[a.role] ?? a.role).localeCompare(ROLE_LABELS[b.role] ?? b.role);
        break;
      case "team":
        cmp = (a.team_num ?? 0) - (b.team_num ?? 0);
        break;
      case "scout":
        cmp = (a.profiles?.name ?? "").localeCompare(b.profiles?.name ?? "");
        break;
      case "submitted":
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedSubmissions = sorted.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const roleLabel = (role: string) => ROLE_LABELS[role] ?? role;

  // Delete handlers
  const handleDeleteClick = (submission: SubmissionWithDetails) => {
    setDeleteTarget(submission);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("scouting_submissions")
        .delete()
        .eq("id", deleteTarget.id);

      if (error) throw error;

      toast({
        title: "Deleted",
        description: `Submission for Q-${deleteTarget.matches?.match_number} (${roleLabel(deleteTarget.role)}) has been permanently deleted.`,
      });
      setDeleteTarget(null);
      loadSubmissions();
    } catch (error) {
      console.error("Error deleting submission:", error);
      toast({
        title: "Delete Failed",
        description: "Could not delete this submission",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Edit handlers
  const handleEditClick = (submission: SubmissionWithDetails) => {
    setEditTarget(submission);
    setEditData(submission.scouting_data);
    setEditConfirming(false);
  };

  const handleEditConfirm = async () => {
    if (!editTarget) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("scouting_submissions")
        .update({ scouting_data: editData })
        .eq("id", editTarget.id);

      if (error) throw error;

      toast({
        title: "Saved",
        description: `Scouting data updated for Q-${editTarget.matches?.match_number} (${roleLabel(editTarget.role)}).`,
      });
      setEditTarget(null);
      setEditConfirming(false);
      loadSubmissions();
    } catch (error) {
      console.error("Error updating submission:", error);
      toast({
        title: "Save Failed",
        description: "Could not update this submission",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const SortableHead = ({
    col,
    children,
    className,
  }: {
    col: SortColumn;
    children: React.ReactNode;
    className?: string;
  }) => (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => handleSort(col)}
        className="flex items-center font-semibold hover:text-foreground transition-colors select-none"
      >
        {children}
        <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
      </button>
    </TableHead>
  );

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Scouting Data</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {loading ? (
              "Loading submissions…"
            ) : (
              <>
                {submissions.length} submission{submissions.length !== 1 ? "s" : ""} — click a
                column header to sort, edit data or permanently delete entries
              </>
            )}
          </p>
        </div>
        {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
      </div>

      {/* Empty state */}
      {!loading && submissions.length === 0 && (
        <div className="p-8 text-center text-muted-foreground">
          No scouting submissions found{selectedEvent !== "all" ? " for this event" : ""}.
        </div>
      )}

      {/* Table */}
      {submissions.length > 0 && (
        <>
          <div className="overflow-auto max-h-[70vh]">
            <Table noWrapper>
              <TableHeader className="sticky top-0 bg-card z-20 shadow-sm">
                <TableRow>
                  <SortableHead col="match" className="w-24">
                    Match
                  </SortableHead>
                  <SortableHead col="role">Role</SortableHead>
                  <SortableHead col="team">Team #</SortableHead>
                  <SortableHead col="scout">Scout</SortableHead>
                  <SortableHead col="submitted">Submitted</SortableHead>
                  <TableHead className="w-16 text-center font-semibold">Schema</TableHead>
                  <TableHead className="w-24 text-right font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedSubmissions.map((submission) => (
                  <TableRow key={submission.id}>
                    <TableCell className="font-mono font-semibold">
                      Q-{submission.matches?.match_number ?? "?"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`border ${ROLE_COLORS[submission.role] ?? "bg-muted/30 text-foreground border-border"}`}
                      >
                        {roleLabel(submission.role)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {submission.team_num || "—"}
                    </TableCell>
                    <TableCell>
                      {submission.profiles?.name ?? (
                        <span className="text-muted-foreground text-sm">Unknown</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {submission.created_at
                        ? format(new Date(submission.created_at), "MMM d, yyyy h:mm a")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-xs text-muted-foreground font-mono">
                        v{submission.schema_version}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditClick(submission)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                          title="Edit scouting data"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteClick(submission)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          title="Delete submission"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="p-4 border-t border-border flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {startIndex + 1}–{Math.min(startIndex + ITEMS_PER_PAGE, sorted.length)} of{" "}
              {sorted.length} submissions
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4 md:mr-1" />
                <span className="hidden md:inline">Previous</span>
              </Button>
              <div className="text-sm font-medium">
                Page {currentPage} of {totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <span className="hidden md:inline">Next</span>
                <ChevronRight className="h-4 w-4 md:ml-1" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Submission?
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  You are about to permanently delete the scouting submission for{" "}
                  <strong className="text-foreground">
                    Q-{deleteTarget?.matches?.match_number}
                  </strong>{" "}
                  (
                  <strong className="text-foreground">
                    {deleteTarget ? roleLabel(deleteTarget.role) : ""}
                  </strong>
                  ) submitted by{" "}
                  <strong className="text-foreground">
                    {deleteTarget?.profiles?.name ?? "Unknown"}
                  </strong>
                  .
                </p>
                <p className="text-destructive font-medium">
                  This action cannot be undone and will remove the data from the database
                  immediately.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting…
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Permanently
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open) {
            setEditTarget(null);
            setEditConfirming(false);
          }
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {editConfirming ? "Confirm Save" : "Edit Scouting Data"}
            </DialogTitle>
            <DialogDescription>
              {editConfirming ? (
                <>
                  Confirm changes to{" "}
                  <strong>Q-{editTarget?.matches?.match_number}</strong> (
                  <strong>{editTarget ? roleLabel(editTarget.role) : ""}</strong>). This will
                  overwrite the existing data immediately.
                </>
              ) : (
                <>
                  Q-{editTarget?.matches?.match_number} —{" "}
                  {editTarget ? roleLabel(editTarget.role) : ""}
                  {editTarget?.profiles?.name && (
                    <> · Submitted by {editTarget.profiles.name}</>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {!editConfirming && (
            <div className="overflow-y-auto overflow-x-hidden max-h-[60vh] border border-border rounded-md p-5">
              <RecursiveJsonEditor
                value={editData}
                onChange={(newVal) => setEditData(newVal as Record<string, unknown>)}
              />
            </div>
          )}

          {editConfirming && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4">
              <p className="text-sm text-destructive font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                This will overwrite the existing scouting data. This action cannot be undone.
              </p>
            </div>
          )}

          <DialogFooter>
            {editConfirming ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setEditConfirming(false)}
                  disabled={isSaving}
                >
                  Back to Edit
                </Button>
                <Button onClick={handleEditConfirm} disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Confirm Save"
                  )}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setEditTarget(null)}>
                  Cancel
                </Button>
                <Button onClick={() => setEditConfirming(true)}>Save Changes</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
