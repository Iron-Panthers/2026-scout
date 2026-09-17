import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, Loader2, NotebookPen } from "lucide-react";
import { TeamImage } from "@/components/TeamImage";
import { getEventMatches } from "@/lib/blueAlliance";
import { getPitScoutingForTeamAtEvent } from "@/lib/pitScouting";
import { pitScoutingQuestions } from "@/config/pitScoutingConfig";
import { getTeamNote, upsertTeamNote } from "@/lib/picklistNotes";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import type { PitScoutingSubmission } from "@/types/pitScouting";

interface TeamInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamNumber: number | null;
  nickname?: string | null;
  eventId?: string | null;
  eventCode?: string | null;
  userId?: string | null;
}

interface TeamMatchRow {
  matchNumber: number;
  alliance: "red" | "blue";
  redTeams: number[];
  blueTeams: number[];
  redScore: number;
  blueScore: number;
  played: boolean;
}

interface ScoutedAverages {
  matchesScouted: number;
  avgShots: number;
  avgEvents: number;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-sm font-semibold text-foreground">{children}</h3>
  );
}

function ComingSoon({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function allianceStripClass(
  alliance: "red" | "blue",
  winner: "red" | "blue" | "tie" | null
): string {
  const isWinner = winner === alliance;
  const isLoser = winner !== null && winner !== "tie" && winner !== alliance;
  if (alliance === "red") {
    if (isWinner) return "bg-red-900/60";
    if (isLoser) return "bg-red-950/10";
    return "bg-red-950/30";
  }
  if (isWinner) return "bg-blue-900/60";
  if (isLoser) return "bg-blue-950/10";
  return "bg-blue-950/30";
}

function AllianceTeamList({
  teams,
  colorClass,
  highlightTeam,
}: {
  teams: number[];
  colorClass: string;
  highlightTeam: number;
}) {
  return (
    <>
      {teams.map((team, i) => (
        <span key={team}>
          {i > 0 && <span className="text-muted-foreground"> </span>}
          <span className={team === highlightTeam ? "font-bold text-green-500" : colorClass}>
            {team}
          </span>
        </span>
      ))}
    </>
  );
}

export function TeamInfoDialog({
  open,
  onOpenChange,
  teamNumber,
  nickname,
  eventId,
  eventCode,
  userId,
}: TeamInfoDialogProps) {
  const { toast } = useToast();
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [teamMatches, setTeamMatches] = useState<TeamMatchRow[] | null>(null);

  const [statsLoading, setStatsLoading] = useState(true);
  const [scoutedAverages, setScoutedAverages] = useState<ScoutedAverages | null>(null);

  const [pitLoading, setPitLoading] = useState(true);
  const [pitSubmission, setPitSubmission] = useState<PitScoutingSubmission | null>(null);

  const [notesOpen, setNotesOpen] = useState(false);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [notes, setNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);

  useEffect(() => {
    if (!open || !teamNumber) return;
    let mounted = true;

    const loadSchedule = async () => {
      setMatchesLoading(true);
      setTeamMatches(null);
      if (!eventCode) {
        if (mounted) setMatchesLoading(false);
        return;
      }
      const teamKey = `frc${teamNumber}`;
      const matches = await getEventMatches(eventCode);
      if (!mounted) return;
      const rows: TeamMatchRow[] = (matches || [])
        .filter((m) => m.comp_level === "qm")
        .filter(
          (m) =>
            m.alliances.red.team_keys.includes(teamKey) ||
            m.alliances.blue.team_keys.includes(teamKey)
        )
        .map((m) => {
          const alliance: "red" | "blue" = m.alliances.red.team_keys.includes(teamKey)
            ? "red"
            : "blue";
          const toNum = (k: string) => parseInt(k.replace("frc", ""), 10);
          return {
            matchNumber: m.match_number,
            alliance,
            redTeams: m.alliances.red.team_keys.map(toNum),
            blueTeams: m.alliances.blue.team_keys.map(toNum),
            redScore: m.alliances.red.score,
            blueScore: m.alliances.blue.score,
            played: m.alliances.red.score >= 0 && m.alliances.blue.score >= 0,
          };
        })
        .sort((a, b) => a.matchNumber - b.matchNumber);
      setTeamMatches(rows);
      setMatchesLoading(false);
    };

    const loadStats = async () => {
      setStatsLoading(true);
      setScoutedAverages(null);
      if (!eventId) {
        if (mounted) setStatsLoading(false);
        return;
      }
      const { data: matchRows } = await supabase
        .from("matches")
        .select("id")
        .eq("event_id", eventId);
      const matchIds = (matchRows || []).map((m) => m.id);
      if (!mounted) return;
      if (matchIds.length === 0) {
        setScoutedAverages({ matchesScouted: 0, avgShots: 0, avgEvents: 0 });
        setStatsLoading(false);
        return;
      }
      const { data: subs } = await supabase
        .from("scouting_submissions")
        .select("scouting_data")
        .eq("team_num", teamNumber)
        .in("match_id", matchIds);
      if (!mounted) return;
      const rows = subs || [];
      const shotsTotal = rows.reduce(
        (sum, r) => sum + (Array.isArray(r.scouting_data?.shots) ? r.scouting_data.shots.length : 0),
        0
      );
      const eventsTotal = rows.reduce(
        (sum, r) => sum + (Array.isArray(r.scouting_data?.events) ? r.scouting_data.events.length : 0),
        0
      );
      setScoutedAverages({
        matchesScouted: rows.length,
        avgShots: rows.length > 0 ? shotsTotal / rows.length : 0,
        avgEvents: rows.length > 0 ? eventsTotal / rows.length : 0,
      });
      setStatsLoading(false);
    };

    const loadPit = async () => {
      setPitLoading(true);
      setPitSubmission(null);
      if (!eventId) {
        if (mounted) setPitLoading(false);
        return;
      }
      const submission = await getPitScoutingForTeamAtEvent(teamNumber, eventId);
      if (!mounted) return;
      setPitSubmission(submission);
      setPitLoading(false);
    };

    loadSchedule();
    loadStats();
    loadPit();

    return () => {
      mounted = false;
    };
  }, [open, teamNumber, eventId, eventCode]);

  // Reset the notes editor whenever a different team/dialog session opens,
  // so stale text from the previous team never briefly shows.
  useEffect(() => {
    setNotesOpen(false);
    setNotesLoaded(false);
    setNotes("");
  }, [open, teamNumber]);

  async function handleOpenNotes(nextOpen: boolean) {
    setNotesOpen(nextOpen);
    if (nextOpen && !notesLoaded && userId && eventId && teamNumber) {
      setNotesLoading(true);
      const existing = await getTeamNote(userId, eventId, teamNumber);
      setNotes(existing);
      setNotesLoaded(true);
      setNotesLoading(false);
    }
  }

  async function handleSaveNotes() {
    if (!userId || !eventId || !teamNumber) return;
    setNotesSaving(true);
    const success = await upsertTeamNote(userId, eventId, teamNumber, notes);
    setNotesSaving(false);
    if (success) {
      toast({ title: "Notes saved" });
    } else {
      toast({ title: "Failed to save notes", variant: "destructive" });
    }
  }

  if (!teamNumber) return null;

  const pitAnswers = pitSubmission
    ? pitScoutingQuestions
        .map((q) => {
          const raw = pitSubmission.pit_data?.[q.id];
          const value = Array.isArray(raw) ? raw.join(", ") : raw;
          return { label: q.label, value: value ? String(value) : null };
        })
        .filter((a) => a.value)
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-[calc(100%-0.5rem)] overflow-x-hidden overflow-y-auto p-2.5 sm:max-w-xl sm:p-6">
        <DialogHeader>
          <DialogTitle className="font-mono">Team {teamNumber}</DialogTitle>
          <DialogDescription>{nickname || "Unknown team"}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* My Notes */}
          <Collapsible open={notesOpen} onOpenChange={handleOpenNotes}>
            <CollapsibleTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-between gap-1.5"
                disabled={!userId || !eventId}
              >
                <span className="flex items-center gap-1.5">
                  <NotebookPen className="h-3.5 w-3.5" />
                  My Notes
                </span>
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${notesOpen ? "rotate-180" : ""}`}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              {notesLoading ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Write anything you want to remember about this team..."
                    className="min-h-24"
                  />
                  <div className="flex justify-end">
                    <Button size="sm" onClick={handleSaveNotes} disabled={notesSaving}>
                      {notesSaving ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </>
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Photo */}
          <div>
            <SectionHeading>Robot Photo</SectionHeading>
            <div className="h-64 w-full overflow-hidden rounded-lg border bg-muted">
              <TeamImage
                teamNumber={teamNumber}
                eventId={eventId || undefined}
                className="h-full w-full object-contain"
                fallbackClassName="h-full w-full flex items-center justify-center bg-muted"
              />
            </div>
          </div>

          {/* Qual schedule */}
          <div>
            <SectionHeading>Qualification Schedule</SectionHeading>
            {matchesLoading ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : !teamMatches ? (
              <ComingSoon>Match schedule isn't available yet for this event.</ComingSoon>
            ) : teamMatches.length === 0 ? (
              <ComingSoon>
                No qualification matches found.
              </ComingSoon>
            ) : (
              <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                {teamMatches.map((row) => {
                  const ownScore = row.alliance === "red" ? row.redScore : row.blueScore;
                  const oppScore = row.alliance === "red" ? row.blueScore : row.redScore;
                  const outcome = !row.played
                    ? null
                    : ownScore > oppScore
                    ? "W"
                    : ownScore < oppScore
                    ? "L"
                    : "T";
                  const winner = !row.played
                    ? null
                    : row.redScore > row.blueScore
                    ? "red"
                    : row.redScore < row.blueScore
                    ? "blue"
                    : "tie";
                  return (
                    <div
                      key={row.matchNumber}
                      className="grid grid-cols-[2.5rem_1fr_3.25rem] items-center justify-items-center gap-8 rounded-md border px-1.5 py-1 text-sm sm:grid-cols-[5rem_1fr_6rem] sm:gap-14 sm:px-2.5 sm:py-1.5"
                    >
                      <span className="whitespace-nowrap text-[10px] font-semibold text-muted-foreground sm:text-xs">
                        <span className="sm:hidden">Q{row.matchNumber}</span>
                        <span className="hidden sm:inline">Quals {row.matchNumber}</span>
                      </span>
                      <div className="flex w-full min-w-0 overflow-hidden rounded-md border">
                        <div
                          className={`min-w-0 flex-1 truncate px-0.5 py-0.5 text-center font-mono text-[7px] sm:px-1 sm:text-[10px] ${allianceStripClass(
                            "red",
                            winner
                          )}`}
                        >
                          <AllianceTeamList
                            teams={row.redTeams}
                            colorClass="text-red-400"
                            highlightTeam={teamNumber}
                          />
                        </div>
                        <div
                          className={`min-w-0 flex-1 truncate px-0.5 py-0.5 text-center font-mono text-[7px] sm:px-1 sm:text-[10px] ${allianceStripClass(
                            "blue",
                            winner
                          )}`}
                        >
                          <AllianceTeamList
                            teams={row.blueTeams}
                            colorClass="text-blue-400"
                            highlightTeam={teamNumber}
                          />
                        </div>
                      </div>
                      {row.played ? (
                        <span
                          className={`whitespace-nowrap text-[10px] font-bold sm:text-xs ${
                            outcome === "W"
                              ? "text-green-500"
                              : outcome === "L"
                              ? "text-red-500"
                              : "text-muted-foreground"
                          }`}
                        >
                          {outcome} {ownScore}-{oppScore}
                        </span>
                      ) : (
                        <span className="whitespace-nowrap text-[10px] text-muted-foreground sm:text-xs">
                          <span className="sm:hidden">—</span>
                          <span className="hidden sm:inline">Not yet played</span>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Scouted point averages */}
          <div>
            <SectionHeading>Scouted Averages</SectionHeading>
            {statsLoading ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : !scoutedAverages || scoutedAverages.matchesScouted === 0 ? (
              <ComingSoon>
                No scouting data yet.
              </ComingSoon>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border p-2.5 text-center">
                  <p className="text-lg font-bold">{scoutedAverages.avgShots.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">Shots / match</p>
                </div>
                <div className="rounded-md border p-2.5 text-center">
                  <p className="text-lg font-bold">{scoutedAverages.avgEvents.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">Actions / match</p>
                </div>
                <p className="col-span-2 text-xs text-muted-foreground">
                  Based on {scoutedAverages.matchesScouted} scouted match
                  {scoutedAverages.matchesScouted === 1 ? "" : "es"}. Scouting averages
                </p>
              </div>
            )}
          </div>

          {/* Pit scouting */}
          <div>
            <SectionHeading>Pit Scouting</SectionHeading>
            {pitLoading ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : !pitSubmission || pitAnswers.length === 0 ? (
              <ComingSoon>Pit scouting hasn't been submitted for this team yet.</ComingSoon>
            ) : (
              <div className="space-y-2">
                {pitAnswers.map((answer) => (
                  <div key={answer.label} className="text-sm">
                    <p className="text-xs font-medium text-muted-foreground">{answer.label}</p>
                    <p className="whitespace-pre-wrap">{answer.value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
