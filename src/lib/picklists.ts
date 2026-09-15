import { supabase } from "@/lib/supabase";
import type { PicklistRow } from "@/types";

/**
 * Get the saved picklist/do-not-pick team numbers for a user at an event.
 * Returns null if none has been saved yet.
 */
export async function getPicklist(
  userId: string,
  eventId: string
): Promise<PicklistRow | null> {
  const { data, error } = await supabase
    .from("picklists")
    .select("*")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching picklist:", error);
    return null;
  }

  return data;
}

/**
 * Save (insert or update) a user's picklist/do-not-pick team numbers for an event.
 */
export async function upsertPicklist(
  userId: string,
  eventId: string,
  pickedTeamNumbers: number[],
  doNotPickTeamNumbers: number[]
): Promise<boolean> {
  const { error } = await supabase.from("picklists").upsert(
    {
      user_id: userId,
      event_id: eventId,
      picked_team_numbers: pickedTeamNumbers,
      do_not_pick_team_numbers: doNotPickTeamNumbers,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,event_id" }
  );

  if (error) {
    console.error("Error upserting picklist:", error);
    return false;
  }

  return true;
}
