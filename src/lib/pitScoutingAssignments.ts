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
  isRescout?: boolean;
  existingSubmissionId?: string;
}

export async function getUserPitAssignments(
  userId: string
): Promise<UserPitAssignment[]> {
  const [{ data: assignments, error }, { data: userSubmissions }] =
    await Promise.all([
      supabase
        .from("pit_scouting_assignments")
        .select("*, events(id, name, event_code)")
        .eq("scouter_id", userId),
      supabase
        .from("pit_scouting_submissions")
        .select("team_num, event_id")
        .eq("scouter_id", userId),
    ]);

  if (error) {
    console.error("Error fetching user pit assignments:", error);
    return [];
  }

  // Filter out assignments this user has already personally submitted
  const userSubmitted = new Set(
    (userSubmissions ?? []).map((s) => `${s.event_id}:${s.team_num}`)
  );

  const pending = (assignments ?? []).filter(
    (row: any) => !userSubmitted.has(`${row.event_id}:${row.team_number}`)
  );

  if (!pending.length) return [];

  // Check if anyone has already submitted for these teams (rescout detection)
  const eventIds = [...new Set(pending.map((a: any) => a.event_id))];
  const { data: anySubmissions } = await supabase
    .from("pit_scouting_submissions")
    .select("team_num, event_id, id")
    .in("event_id", eventIds);

  const anyoneSubmitted = new Map<string, string>();
  for (const s of anySubmissions ?? []) {
    const key = `${s.event_id}:${s.team_num}`;
    if (!anyoneSubmitted.has(key)) anyoneSubmitted.set(key, s.id);
  }

  return pending.map((row: any) => {
    const key = `${row.event_id}:${row.team_number}`;
    return {
      id: row.id,
      event_id: row.event_id,
      team_number: row.team_number,
      scouter_id: row.scouter_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      event_code: row.events?.event_code ?? null,
      event_name: row.events?.name ?? "Unknown Event",
      isRescout: anyoneSubmitted.has(key),
      existingSubmissionId: anyoneSubmitted.get(key),
    };
  });
}
