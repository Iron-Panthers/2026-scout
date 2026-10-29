import { supabase } from "@/lib/supabase";

/**
 * Get a user's freeform note for a team at an event. Returns an empty
 * string if none has been saved yet.
 */
export async function getTeamNote(
  userId: string,
  eventId: string,
  teamNumber: number
): Promise<string> {
  const { data, error } = await supabase
    .from("picklist_team_notes")
    .select("notes")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .eq("team_number", teamNumber)
    .maybeSingle();

  if (error) {
    console.error("Error fetching picklist team note:", error);
    return "";
  }

  return data?.notes ?? "";
}

/**
 * Save (insert or update) a user's note for a team at an event.
 */
export async function upsertTeamNote(
  userId: string,
  eventId: string,
  teamNumber: number,
  notes: string
): Promise<boolean> {
  const { error } = await supabase.from("picklist_team_notes").upsert(
    {
      user_id: userId,
      event_id: eventId,
      team_number: teamNumber,
      notes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,event_id,team_number" }
  );

  if (error) {
    console.error("Error upserting picklist team note:", error);
    return false;
  }

  return true;
}

export interface UserTeamNote {
  userId: string;
  notes: string;
  updatedAt: string | null;
}

/**
 * Everyone's notes on a team at an event, newest first, leaving out blank ones. Only the
 * event's picklist host can read other people's; anyone else just gets their own back.
 * Returns null if they couldn't be loaded.
 */
export async function getEveryoneTeamNotes(eventId: string, teamNumber: number): Promise<UserTeamNote[] | null> {
  const { data, error } = await supabase
    .from("picklist_team_notes")
    .select("user_id, notes, updated_at")
    .eq("event_id", eventId)
    .eq("team_number", teamNumber)
    .neq("notes", "")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Error fetching picklist team notes:", error);
    return null;
  }

  return (data ?? [])
    .filter((row) => row.notes.trim() !== "")
    .map((row) => ({ userId: row.user_id, notes: row.notes, updatedAt: row.updated_at }));
}
