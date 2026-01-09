import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { getEventMatches } from "@/lib/blueAlliance";

interface CreateEventTabProps {
  newEventName: string;
  setNewEventName: (value: string) => void;
  newEventCode: string;
  setNewEventCode: (value: string) => void;
  numQualMatches: string;
  setNumQualMatches: (value: string) => void;
  isCreatingEvent: boolean;
  onCreateEvent: () => void;
}

export function CreateEventTab({
  newEventName,
  setNewEventName,
  newEventCode,
  setNewEventCode,
  numQualMatches,
  setNumQualMatches,
  isCreatingEvent,
  onCreateEvent,
}: CreateEventTabProps) {
  const [isFetchingMatches, setIsFetchingMatches] = useState(false);

  const handleFetchFromTBA = async () => {
    if (!newEventCode) return;

    setIsFetchingMatches(true);
    try {
      const matches = await getEventMatches(newEventCode);

      if (matches && matches.length > 0) {
        // Count qualification matches
        const qualMatches = matches.filter((m) => m.comp_level === "qm");
        setNumQualMatches(qualMatches.length.toString());
      } else {
        alert(
          "No matches found for this event code. Please check the code and try again."
        );
      }
    } catch (error) {
      console.error("Error fetching matches from TBA:", error);
      alert(
        "Failed to fetch matches from The Blue Alliance. Please check the event code."
      );
    } finally {
      setIsFetchingMatches(false);
    }
  };
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
            <Label htmlFor="eventCode">Event Code (TBA)</Label>
            <Input
              id="eventCode"
              placeholder="e.g., 2024caln"
              value={newEventCode}
              onChange={(e) => setNewEventCode(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The Blue Alliance event code - also used as match name prefix
              (e.g., 2024caln-Q1)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="numMatches">Number of Qualification Matches</Label>
            <div className="flex gap-2">
              <Input
                id="numMatches"
                type="number"
                min="1"
                placeholder="e.g., 100"
                value={numQualMatches}
                onChange={(e) => setNumQualMatches(e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleFetchFromTBA}
                disabled={!newEventCode || isFetchingMatches}
                title={
                  !newEventCode
                    ? "Enter event code first"
                    : "Fetch from The Blue Alliance"
                }
              >
                <Download className="h-4 w-4 mr-2" />
                {isFetchingMatches ? "Fetching..." : "Fetch from TBA"}
              </Button>
            </div>
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
