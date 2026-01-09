import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon, Save } from "lucide-react";
import { format } from "date-fns";
import { updateEvent } from "@/lib/matches";
import type { Event, Profile, MatchAssignment } from "@/types";

interface EventInformationTabProps {
  selectedEvent: string;
  events: Event[];
  matches: MatchAssignment[];
  availableScouts: Profile[];
  onEventUpdate?: () => void;
}

export function EventInformationTab({
  selectedEvent,
  events,
  matches,
  availableScouts,
  onEventUpdate,
}: EventInformationTabProps) {
  const currentEvent = events.find((e) => e.id === selectedEvent);
  const isAllEvents = selectedEvent === "all";

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editedEvent, setEditedEvent] = useState<Partial<Event>>({
    name: currentEvent?.name || "",
    event_code: currentEvent?.event_code || "",
    location: currentEvent?.location || "",
    start_date: currentEvent?.start_date || "",
    end_date: currentEvent?.end_date || "",
    scouting_map_url: currentEvent?.scouting_map_url || "",
  });

  const handleSave = async () => {
    if (!currentEvent || isAllEvents) return;

    setIsSaving(true);
    const success = await updateEvent(currentEvent.id, {
      name: editedEvent.name,
      event_code: editedEvent.event_code || undefined,
      location: editedEvent.location || undefined,
      start_date: editedEvent.start_date || undefined,
      end_date: editedEvent.end_date || undefined,
      scouting_map_url: editedEvent.scouting_map_url || undefined,
    });

    if (success) {
      setIsEditing(false);
      onEventUpdate?.();
    }
    setIsSaving(false);
  };

  const handleCancel = () => {
    setEditedEvent({
      name: currentEvent?.name || "",
      event_code: currentEvent?.event_code || "",
      location: currentEvent?.location || "",
      start_date: currentEvent?.start_date || "",
      end_date: currentEvent?.end_date || "",
      scouting_map_url: currentEvent?.scouting_map_url || "",
    });
    setIsEditing(false);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              {isAllEvents
                ? "All Events Overview"
                : currentEvent?.name || "Event Information"}
            </CardTitle>
            {!isAllEvents && (
              <div className="flex gap-2">
                {isEditing ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancel}
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={isSaving}>
                      <Save className="h-4 w-4 mr-2" />
                      {isSaving ? "Saving..." : "Save Changes"}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                  >
                    Edit Event
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-muted-foreground">
                Event Name
              </Label>
              {isEditing ? (
                <Input
                  value={editedEvent.name}
                  onChange={(e) =>
                    setEditedEvent({ ...editedEvent, name: e.target.value })
                  }
                  className="mt-1"
                />
              ) : (
                <p className="text-lg font-semibold">
                  {isAllEvents
                    ? "All Events"
                    : currentEvent?.name || "Unknown Event"}
                </p>
              )}
            </div>

            <div>
              <Label className="text-sm font-medium text-muted-foreground">
                Event Code (TBA)
              </Label>
              {isEditing ? (
                <Input
                  value={editedEvent.event_code || ""}
                  onChange={(e) =>
                    setEditedEvent({
                      ...editedEvent,
                      event_code: e.target.value,
                    })
                  }
                  placeholder="e.g., 2024caln"
                  className="mt-1"
                />
              ) : (
                <p className="text-lg">
                  {isAllEvents
                    ? "Multiple Codes"
                    : currentEvent?.event_code || "Not set"}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-muted-foreground">
                  Location
                </Label>
                {isEditing ? (
                  <Input
                    value={editedEvent.location || ""}
                    onChange={(e) =>
                      setEditedEvent({
                        ...editedEvent,
                        location: e.target.value,
                      })
                    }
                    className="mt-1"
                  />
                ) : (
                  <p className="text-lg">
                    {isAllEvents
                      ? "Multiple Locations"
                      : currentEvent?.location || "TBD"}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">
                  Total Matches
                </Label>
                <p className="text-lg font-semibold">{matches.length}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-muted-foreground">
                  Start Date
                </Label>
                {isEditing ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal mt-1"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {editedEvent.start_date
                          ? format(new Date(editedEvent.start_date), "PPP")
                          : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={
                          editedEvent.start_date
                            ? new Date(editedEvent.start_date)
                            : undefined
                        }
                        onSelect={(date) =>
                          setEditedEvent({
                            ...editedEvent,
                            start_date: date?.toISOString() || "",
                          })
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                ) : (
                  <p className="text-lg">
                    {isAllEvents
                      ? "Season Long"
                      : currentEvent?.start_date
                      ? format(new Date(currentEvent.start_date), "PPP")
                      : "TBD"}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">
                  End Date
                </Label>
                {isEditing ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal mt-1"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {editedEvent.end_date
                          ? format(new Date(editedEvent.end_date), "PPP")
                          : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={
                          editedEvent.end_date
                            ? new Date(editedEvent.end_date)
                            : undefined
                        }
                        onSelect={(date) =>
                          setEditedEvent({
                            ...editedEvent,
                            end_date: date?.toISOString() || "",
                          })
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                ) : (
                  <p className="text-lg">
                    {isAllEvents
                      ? "Season Long"
                      : currentEvent?.end_date
                      ? format(new Date(currentEvent.end_date), "PPP")
                      : "TBD"}
                  </p>
                )}
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium text-muted-foreground">
                Scouting Map URL
              </Label>
              {isEditing ? (
                <Input
                  value={editedEvent.scouting_map_url || ""}
                  onChange={(e) =>
                    setEditedEvent({
                      ...editedEvent,
                      scouting_map_url: e.target.value,
                    })
                  }
                  placeholder="https://example.com/map.png"
                  className="mt-1"
                />
              ) : (
                <p className="text-lg">
                  {currentEvent?.scouting_map_url ? (
                    <a
                      href={currentEvent.scouting_map_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline"
                    >
                      View Map
                    </a>
                  ) : (
                    "Not set"
                  )}
                </p>
              )}
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
