import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Event, Profile, MatchAssignment } from "@/types";

interface EventInformationTabProps {
  selectedEvent: string;
  events: Event[];
  matches: MatchAssignment[];
  availableScouts: Profile[];
}

export function EventInformationTab({
  selectedEvent,
  events,
  matches,
  availableScouts,
}: EventInformationTabProps) {
  const currentEvent = events.find((e) => e.id === selectedEvent);
  const isAllEvents = selectedEvent === "all";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {isAllEvents
              ? "All Events Overview"
              : currentEvent?.name || "Event Information"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Event Name
              </label>
              <p className="text-lg font-semibold">
                {isAllEvents
                  ? "All Events"
                  : currentEvent?.name || "Unknown Event"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Location
                </label>
                <p className="text-lg">
                  {isAllEvents
                    ? "Multiple Locations"
                    : currentEvent?.location || "TBD"}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Total Matches
                </label>
                <p className="text-lg font-semibold">{matches.length}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Start Date
                </label>
                <p className="text-lg">
                  {isAllEvents
                    ? "Season Long"
                    : currentEvent?.start_date || "TBD"}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  End Date
                </label>
                <p className="text-lg">
                  {isAllEvents
                    ? "Season Long"
                    : currentEvent?.end_date || "TBD"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {isAllEvents ? "Season Statistics" : "Event Statistics"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 rounded-lg bg-primary/10">
              <p className="text-3xl font-bold text-primary">
                {availableScouts.length}
              </p>
              <p className="text-sm text-muted-foreground mt-1">Total Scouts</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-blue-500/10">
              <p className="text-3xl font-bold text-blue-400">
                {
                  matches.filter((m) => Object.keys(m.assignments).length > 0)
                    .length
                }
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Assigned Matches
              </p>
            </div>
            <div className="text-center p-4 rounded-lg bg-yellow-500/10">
              <p className="text-3xl font-bold text-yellow-400">
                {
                  matches.filter((m) => Object.keys(m.assignments).length === 0)
                    .length
                }
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Unassigned Matches
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scout List</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {availableScouts.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No scouts available
              </p>
            ) : (
              availableScouts.map((profile) => {
                const initials = (profile.name || "U")
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2);
                return (
                  <div
                    key={profile.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="text-sm bg-primary/20 text-primary">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-medium">{profile.name || "Unknown"}</p>
                      <p className="text-sm text-muted-foreground">
                        {profile.role} {profile.is_manager && "• Manager"}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
