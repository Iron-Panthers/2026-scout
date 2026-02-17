import { supabase } from "./supabase";
import type { PitScoutingSubmission, PitScoutingFormData } from "@/types/pitScouting";

/**
 * Current pit scouting schema version
 */
export const PIT_SCHEMA_VERSION = 1;

/**
 * Submit pit scouting data to the database
 * @param teamNum - Team number
 * @param eventId - Event ID
 * @param scouterId - Scouter's user ID
 * @param scouterName - Scouter's name
 * @param formData - Form data object
 * @param photoUrls - Array of photo URLs from storage
 * @returns Created submission record
 */
export async function submitPitScouting(
  teamNum: number,
  eventId: string,
  scouterId: string,
  scouterName: string,
  formData: PitScoutingFormData,
  photoUrls: string[] = []
): Promise<PitScoutingSubmission> {
  const { data, error } = await supabase
    .from("pit_scouting_submissions")
    .insert({
      team_num: teamNum,
      event_id: eventId,
      scouter_id: scouterId || null,
      scouter_name: scouterName,
      pit_data: formData,
      photo_urls: photoUrls,
      schema_version: PIT_SCHEMA_VERSION,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to submit pit scouting: ${error.message}`);
  }

  return data;
}

/**
 * Check if a pit scouting submission already exists for the given team/event/scouter
 * @param teamNum - Team number
 * @param eventId - Event ID
 * @param scouterId - Scouter's user ID
 * @returns True if submission exists
 */
export async function hasExistingPitScouting(
  teamNum: number,
  eventId: string,
  scouterId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("pit_scouting_submissions")
    .select("id")
    .eq("team_num", teamNum)
    .eq("event_id", eventId)
    .eq("scouter_id", scouterId)
    .maybeSingle();

  if (error) {
    console.error("Error checking existing pit scouting:", error);
    return false;
  }

  return data !== null;
}

/**
 * Get pit scouting submissions for an event
 * @param eventId - Event ID
 * @returns Array of pit scouting submissions
 */
export async function getPitScoutingByEvent(
  eventId: string
): Promise<PitScoutingSubmission[]> {
  const { data, error } = await supabase
    .from("pit_scouting_submissions")
    .select("*")
    .eq("event_id", eventId)
    .order("team_num", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch pit scouting: ${error.message}`);
  }

  return data || [];
}

/**
 * Get pit scouting submissions for a specific team
 * @param teamNum - Team number
 * @param eventId - Optional event ID to filter by
 * @returns Array of pit scouting submissions
 */
export async function getPitScoutingByTeam(
  teamNum: number,
  eventId?: string
): Promise<PitScoutingSubmission[]> {
  let query = supabase
    .from("pit_scouting_submissions")
    .select("*")
    .eq("team_num", teamNum);

  if (eventId) {
    query = query.eq("event_id", eventId);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch pit scouting: ${error.message}`);
  }

  return data || [];
}

/**
 * Update an existing pit scouting submission
 * @param submissionId - Submission ID
 * @param updates - Partial updates to apply
 * @returns Updated submission record
 */
export async function updatePitScouting(
  submissionId: string,
  updates: Partial<{
    pit_data: PitScoutingFormData;
    photo_urls: string[];
    scouter_name: string;
  }>
): Promise<PitScoutingSubmission> {
  const { data, error } = await supabase
    .from("pit_scouting_submissions")
    .update(updates)
    .eq("id", submissionId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update pit scouting: ${error.message}`);
  }

  return data;
}

/**
 * Delete a pit scouting submission (managers only)
 * @param submissionId - Submission ID
 */
export async function deletePitScouting(submissionId: string): Promise<void> {
  const { error } = await supabase
    .from("pit_scouting_submissions")
    .delete()
    .eq("id", submissionId);

  if (error) {
    throw new Error(`Failed to delete pit scouting: ${error.message}`);
  }
}

/**
 * Get team photo URL from pit scouting submissions
 * @param teamNum - Team number
 * @param eventId - Event ID
 * @returns First photo URL if available, null otherwise
 */
export async function getTeamPhotoFromPitScouting(
  teamNum: number,
  eventId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("pit_scouting_submissions")
    .select("photo_urls")
    .eq("team_num", teamNum)
    .eq("event_id", eventId)
    .maybeSingle();

  if (error || !data || !data.photo_urls || data.photo_urls.length === 0) {
    return null;
  }

  return data.photo_urls[0];
}
