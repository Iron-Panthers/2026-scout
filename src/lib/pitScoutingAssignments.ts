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
  isRescout: boolean;
}

export async function getUserPitAssignments(
  userId: string
): Promise<UserPitAssignment[]> {
  const [{ data: assignments, error }, { data: submissions }] =
    await Promise.all([
      supabase
        .from("pit_scouting_assignments")
        .select("*, events!inner(id, name, event_code, is_active)")
        .eq("scouter_id", userId)
        .eq("events.is_active", true),
      supabase
        .from("pit_scouting_submissions")
        .select("team_num, event_id, updated_at")
        .eq("scouter_id", userId),
    ]);

  if (error) {
    console.error("Error fetching user pit assignments:", error);
    return [];
  }

  // Map of "event_id:team_num" -> submission updated_at
  // Using updated_at so that a rescout submission (which updates the row) also clears the card
  const submittedAt = new Map(
    (submissions ?? []).map((s) => [`${s.event_id}:${s.team_num}`, s.updated_at])
  );

  return (assignments ?? [])
    .filter((row: any) => {
      const submittedTime = submittedAt.get(`${row.event_id}:${row.team_number}`);
      if (!submittedTime) return true; // not submitted yet
      // Show if the assignment was updated AFTER submission (rescout)
      return row.updated_at > submittedTime;
    })
    .map((row: any) => ({
      id: row.id,
      event_id: row.event_id,
      team_number: row.team_number,
      scouter_id: row.scouter_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      event_code: row.events?.event_code ?? null,
      event_name: row.events?.name ?? "Unknown Event",
      isRescout: submittedAt.has(`${row.event_id}:${row.team_number}`),
    }));
}
