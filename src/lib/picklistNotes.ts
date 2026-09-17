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
