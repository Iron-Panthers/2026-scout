import { supabase } from "@/lib/supabase";
import type { PitScoutingAssignment } from "@/types";

export async function getPitAssignmentsForEvent(
  eventId: string
): Promise<PitScoutingAssignment[]> {
  const { data, error } = await supabase
    .from("pit_scouting_assignments")
    .select("*")
    .eq("event_id", eventId)
    .order("team_number");

  if (error) {
    console.error("Error fetching pit assignments:", error);
    return [];
  }
  return data ?? [];
}

export async function upsertPitAssignment(
  eventId: string,
  teamNumber: number,
  scouterId: string | null
): Promise<boolean> {
  const { error } = await supabase
    .from("pit_scouting_assignments")
    .upsert(
      {
        event_id: eventId,
        team_number: teamNumber,
        scouter_id: scouterId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "event_id,team_number" }
    );

  if (error) {
    console.error("Error upserting pit assignment:", error);
    return false;
  }
  return true;
}

export async function removePitAssignment(
  eventId: string,
  teamNumber: number
): Promise<boolean> {
  const { error } = await supabase
    .from("pit_scouting_assignments")
    .delete()
    .eq("event_id", eventId)
    .eq("team_number", teamNumber);

  if (error) {
    console.error("Error removing pit assignment:", error);
    return false;
  }
  return true;
}

export interface UserPitAssignment extends PitScoutingAssignment {
  event_code: string | null;
  event_name: string;
}

export async function getUserPitAssignments(
  userId: string
): Promise<UserPitAssignment[]> {
  const { data, error } = await supabase
    .from("pit_scouting_assignments")
    .select("*, events(id, name, event_code)")
    .eq("scouter_id", userId);

  if (error) {
    console.error("Error fetching user pit assignments:", error);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    event_id: row.event_id,
    team_number: row.team_number,
    scouter_id: row.scouter_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    event_code: row.events?.event_code ?? null,
    event_name: row.events?.name ?? "Unknown Event",
  }));
}
