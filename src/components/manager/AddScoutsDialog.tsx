
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createRoster, updateRoster } from "@/lib/rosters";
import type { Roster, Profile, Role, MatchAssignment } from "@/types";
import { updateEvent } from "@/lib/matches";

interface AddScoutsDialogProps {
  open: boolean;
  eventName: string;
  onOpenChange: (open: boolean) => void;
  allScouts: Profile[];
  availableScouts: Profile[];
  onSave: (users: Profile[]) => void;
}

export function AddScoutsDialog({
  open,
  event,
  onOpenChange,
  allScouts,
  availableScouts,
  onSave,
}: AddScoutsDialogProps) {
  const [possibleOptions, setPossibleOptions] = useState<Profile[]>([]);
  const [addedUsers, setAddedUsers] = useState<Profile[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>("None");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Initialize form when roster changes
  useEffect(() => {
    setPossibleOptions(allScouts.filter(scout => !availableScouts.some(s => s.id === scout.id)))
    setLoading(false);
  }, [allScouts, availableScouts, open]);

  const handleSave = async () => {
    setLoading(true);
    addedUsers.forEach(user => {
      event.users.push(user.id);
    });

    await updateEvent(event.id, { users: event.users });
    onOpenChange(false);
    setAddedUsers([]);
    setLoading(false);
    onSave(event.users)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Assign Scouters to {event.name}
          </DialogTitle>
          <DialogDescription>
            Add more scouters to the roster for the event: {event.name}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md">
              {error}
            </div>
          )}

          {/* Scout Assignments */}

          <div className="space-y-3">
            <Label className="text-base font-semibold">Scouters to Assign:</Label>
            <div className="flex flex-wrap">
            {addedUsers.map((scouter, index) => (
              <div className="m-1">
              <Select
                value={scouter.id}
                onValueChange={(value) => {
                  const updatedUsers = [...addedUsers];
                  updatedUsers[index] = allScouts.find((s) => s.id === value) || scouter;
                  setAddedUsers(updatedUsers)
                  console.log(updatedUsers)
                }}
                disabled={loading}
              >
                <SelectTrigger id={`scout-${index}`} className="h-9">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {possibleOptions.map((scout) => (
                    <SelectItem key={scout.id} value={scout.id}>
                      {scout.name || "Unknown"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              </div>
            ))}
            </div>
            <Label className="text-base font-semibold">Add to list:</Label>
            <div className="flex">
            <Select
              onValueChange={(value) => {
                setSelectedUser(value)
              }}
              disabled={loading}
            >
              <SelectTrigger id={`scout-new`} className="h-9">
                <SelectValue placeholder="Choose scouter..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {possibleOptions.map((scout) => (
                  <SelectItem key={scout.id} value={scout.id}>
                    {scout.name || "Unknown"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant={"secondary"} className="ml-3" disabled={selectedUser === "None" || addedUsers.some(s => s.id === selectedUser)} onClick={() => { addedUsers.push(allScouts.find(s => s.id === selectedUser)); setAddedUsers(addedUsers); setSelectedUser("None"); console.log(addedUsers); }}>
              Add Scouter
            </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => { onOpenChange(false); setAddedUsers([]); }}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button disabled={loading} onClick={() => { handleSave(); }}>
            {loading
              ? "Saving..."
              : "Assign" }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
