import { useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { getEventTeams } from "@/lib/blueAlliance";
import { formatBBotLines, parseBBotLines } from "@/lib/bbots";
import { isDevEventId, updateDevEvent } from "@/lib/devMode";
import { updateEvent } from "@/lib/matches";
import { useToast } from "@/hooks/use-toast";
import type { Event } from "@/types";

/** FIRST's off-season demo team numbers, which events hand out to teams' extra robots. */
const isDemoTeamNumber = (teamNumber: number) => teamNumber >= 9970 && teamNumber <= 9999;

/**
 * The "Convert B-bots" setting: whether the event's off-season demo team numbers show as
 * their main team's B/C/D/E robot (its logo with the letter), and which number is whose.
 * Key it by event so the list resets when switching events.
 */
export function BBotSettings({ event, devUserId, onSaved }: {
  event: Event;
  devUserId?: string;
  onSaved?: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const savedText = formatBBotLines(event.bbot_teams);
  const [text, setText] = useState(savedText);
  const { teams, errors } = useMemo(() => parseBBotLines(text), [text]);
  const changed = formatBBotLines(teams) !== savedText;
  const [demoTeams, setDemoTeams] = useState<number[] | null>(null);

  // Demo numbers TBA lists at the event, to point out any still without a conversion
  useEffect(() => {
    if (!event.event_code || isDevEventId(event.id)) return;
    let cancelled = false;
    getEventTeams(event.event_code).then((eventTeams) => {
      if (!cancelled) setDemoTeams(eventTeams.map((team) => team.team_number).filter(isDemoTeamNumber).sort((a, b) => a - b));
    });
    return () => {
      cancelled = true;
    };
  }, [event.event_code, event.id]);
  const unconverted = demoTeams?.filter((teamNumber) => !(String(teamNumber) in teams)) ?? [];

  const save = async (updates: { convert_bbots?: boolean; bbot_teams?: Record<string, string> }, failure: string) => {
    setSaving(true);
    const success = devUserId && isDevEventId(event.id)
      ? updateDevEvent(devUserId, event.id, updates)
      : await updateEvent(event.id, updates);
    setSaving(false);
    if (success) onSaved?.();
    else toast({ title: failure, variant: "destructive" });
    return success;
  };

  const saveList = async () => {
    if (errors.length > 0) return;
    if (await save({ bbot_teams: teams }, "Could not save the B-bot list")) {
      // Tidied into the saved form (sorted, one style)
      setText(formatBBotLines(teams));
    }
  };

  return (
    <div>
      <Label htmlFor="convert-bbots" className="text-sm font-medium text-muted-foreground">
        Convert B-bots
      </Label>
      <div className="mt-1 flex items-center gap-3">
        <Switch
          id="convert-bbots"
          checked={!!event.convert_bbots}
          onCheckedChange={(checked) => void save({ convert_bbots: checked }, "Could not update Convert B-bots")}
          disabled={saving}
        />
        <span className="text-lg">{event.convert_bbots ? "On" : "Off"}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Off-season demo team numbers (like 9991) that are really a team's B, C, D or E robot show with that team's
        logo and the robot's letter.
      </p>

      {event.convert_bbots && (
        <div className="mt-3 space-y-2">
          <Label htmlFor="bbot-teams" className="text-xs text-muted-foreground">
            One per line: the demo number, then the main team and letter
          </Label>
          <Textarea
            id="bbot-teams"
            value={text}
            onChange={(changeEvent) => setText(changeEvent.target.value)}
            placeholder={"9991 → 581 B\n9981 → 581 C"}
            className="min-h-32 font-mono text-sm sm:max-w-sm"
          />
          {errors.map((error) => (
            <p key={error} className="text-xs text-destructive">{error}</p>
          ))}
          {unconverted.length > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              The Blue Alliance lists {unconverted.length === 1 ? "this demo number" : "these demo numbers"} at the event
              without a conversion yet: {unconverted.join(", ")}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button size="sm" className="gap-1.5" disabled={saving || !changed || errors.length > 0} onClick={() => void saveList()}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save list
            </Button>
            <span className="text-xs text-muted-foreground">
              {Object.keys(teams).length} conversion{Object.keys(teams).length === 1 ? "" : "s"}
              {changed && " (not saved)"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
