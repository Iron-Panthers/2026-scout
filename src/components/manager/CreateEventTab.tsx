import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface CreateEventTabProps {
  newEventName: string;
  setNewEventName: (value: string) => void;
  newEventId: string;
  setNewEventId: (value: string) => void;
  numQualMatches: string;
  setNumQualMatches: (value: string) => void;
  isCreatingEvent: boolean;
  onCreateEvent: () => void;
}

export function CreateEventTab({
  newEventName,
  setNewEventName,
  newEventId,
  setNewEventId,
  numQualMatches,
  setNumQualMatches,
  isCreatingEvent,
  onCreateEvent,
}: CreateEventTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create New Event</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="eventName">Event Name</Label>
            <Input
              id="eventName"
              placeholder="e.g., 2026 Regional Championship"
              value={newEventName}
              onChange={(e) => setNewEventName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="eventId">Event ID</Label>
            <Input
              id="eventId"
              placeholder="e.g., 2026-regional"
              value={newEventId}
              onChange={(e) => setNewEventId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              This will be used as a prefix for match names (e.g.,
              2026-regional-Q1)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="numMatches">Number of Qualification Matches</Label>
            <Input
              id="numMatches"
              type="number"
              min="1"
              placeholder="e.g., 100"
              value={numQualMatches}
              onChange={(e) => setNumQualMatches(e.target.value)}
            />
          </div>

          <Button
            onClick={onCreateEvent}
            disabled={isCreatingEvent}
            className="w-full"
            size="lg"
          >
            {isCreatingEvent ? "Creating..." : "Create Event"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
