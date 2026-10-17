import { supabase } from "@/lib/supabase";
import { updateMatchAssignment } from "@/lib/matches";
import {
  addDevMatchRescout,
  deleteDevScoutingSubmission,
  isDevMatchId,
  setDevMatchAssignment,
} from "@/lib/devMode";
import { toQuantRow, type QuantRow } from "@/lib/strategyData";
import { getDevScoutingSubmissions } from "@/lib/devMode";
import type { Role } from "@/types";

export interface MatchRescout {
  match_id: string;
  role: string;
  scouter_id: string;
  reason: string;
}

/**
 * Hands a submission with a scouting error to a new scouter: records the rescout,
 * deletes the old submission and assigns the new scouter to the same slot.
 */
export async function assignMatchRescout(params: {
  matchId: string;
  role: Role;
  slot: 1 | 2;
  oldScouterId: string;
  newScouterId: string;
  reason: string;
  /** The signed-in user's id, needed to reach the sandbox dataset. */
  devUserId?: string;
}): Promise<boolean> {
  const { matchId, role, slot, oldScouterId, newScouterId, reason, devUserId } = params;

  if (isDevMatchId(matchId)) {
    if (!devUserId) return false;
    deleteDevScoutingSubmission(devUserId, matchId, role, oldScouterId);
    addDevMatchRescout(devUserId, { match_id: matchId, role, scouter_id: newScouterId, reason });
    setDevMatchAssignment(devUserId, matchId, role, slot, newScouterId);
    return true;
  }

  const { error: rescoutError } = await supabase
    .from("match_rescouts")
    .upsert({ match_id: matchId, role, scouter_id: newScouterId, reason }, { onConflict: "match_id,role,scouter_id" });
  if (rescoutError) {
    console.error("Error recording rescout:", rescoutError);
    return false;
  }

  const { error: deleteError } = await supabase
    .from("scouting_submissions")
    .delete()
    .eq("match_id", matchId)
    .eq("role", role)
    .eq("scouter_id", oldScouterId);
  if (deleteError) {
    console.error("Error deleting submission for rescout:", deleteError);
    return false;
  }

  return updateMatchAssignment(matchId, role, newScouterId, slot);
}

/** The rescouts assigned to a scouter, for their dashboard cards. */
export async function getUserRescouts(userId: string): Promise<MatchRescout[]> {
  const { data, error } = await supabase
    .from("match_rescouts")
    .select("match_id, role, scouter_id, reason")
    .eq("scouter_id", userId);
  if (error) {
    console.error("Error fetching rescouts:", error);
    return [];
  }
  return data ?? [];
}

export interface SubmissionDetails {
  row: QuantRow;
  /** The submission's raw scouting_data, for anything the summary doesn't cover. */
  raw: Record<string, unknown>;
}

/** One scouter's quantitative submission for a match role, for the manager's scouting error popup. */
export async function getSubmissionDetails(params: {
  matchId: string;
  role: string;
  scouterId: string;
  scouterName: string;
  matchNumber: number;
  devUserId?: string;
}): Promise<SubmissionDetails | null> {
  const { matchId, role, scouterId, scouterName, matchNumber, devUserId } = params;
  const names = new Map<string, string | null>([[scouterId, scouterName]]);

  if (isDevMatchId(matchId)) {
    const sub = devUserId
      ? getDevScoutingSubmissions(devUserId).find((s) => s.match_id === matchId && s.role === role && s.scouter_id === scouterId)
      : undefined;
    if (!sub) return null;
    return {
      row: toQuantRow({ ...sub, matchNumber }, names),
      raw: sub.scouting_data,
    };
  }

  const { data, error } = await supabase
    .from("scouting_submissions")
    .select("id, role, team_num, match_type, scouting_data, schema_version, scouter_id, created_at, tba_data")
    .eq("match_id", matchId)
    .eq("role", role)
    .eq("scouter_id", scouterId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("Error fetching submission details:", error);
    return null;
  }
  return { row: toQuantRow({ ...data, matchNumber }, names), raw: data.scouting_data ?? {} };
}
