import { supabase } from "./supabase";
import type { Match, Profile } from "@/types";

// Fetch all matches
export async function getMatches(): Promise<Match[]> {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .order("match_number", { ascending: true });

  if (error) {
    console.error("Error fetching matches:", error);
    return [];
  }

  return data || [];
}

// Fetch all profiles (for scout selection)
export async function getAllProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching profiles:", error);
    return [];
  }

  return data || [];
}

// Fetch matches with populated scouter profiles
export async function getMatchesWithProfiles(): Promise<{
  matches: Match[];
  profiles: Map<string, Profile>;
}> {
  const [matchesResult, profilesResult] = await Promise.all([
    getMatches(),
    getAllProfiles(),
  ]);

  const profilesMap = new Map<string, Profile>();
  profilesResult.forEach((profile) => {
    profilesMap.set(profile.id, profile);
  });

  return {
    matches: matchesResult,
    profiles: profilesMap,
  };
}

// Create or update match assignment
export async function upsertMatch(matchData: {
  name: string;
  match_number: number;
  event_id?: string;
  [key: string]: any;
}): Promise<Match | null> {
  const { data, error } = await supabase
    .from("matches")
    .upsert(matchData, { onConflict: "name" })
    .select()
    .single();

  if (error) {
    console.error("Error upserting match:", error);
    return null;
  }

  return data;
}

// Update a specific scouter assignment
export async function updateMatchAssignment(
  matchName: string,
  role: string,
  scouterId: string | null
): Promise<boolean> {
  // Map camelCase role names to snake_case database columns
  const roleToColumn: Record<string, string> = {
    red1: "red1_scouter_id",
    red2: "red2_scouter_id",
    red3: "red3_scouter_id",
    qualRed: "qual_red_scouter_id",
    blue1: "blue1_scouter_id",
    blue2: "blue2_scouter_id",
    blue3: "blue3_scouter_id",
    qualBlue: "qual_blue_scouter_id",
  };

  const roleColumn = roleToColumn[role];

  if (!roleColumn) {
    console.error(`Invalid role: ${role}`);
    return false;
  }

  console.log("Updating assignment:", {
    matchName,
    role,
    roleColumn,
    scouterId,
  });

  const { error } = await supabase.from("matches").upsert(
    {
      name: matchName,
      match_number: parseInt(matchName.replace(/\D/g, "")),
      [roleColumn]: scouterId,
    },
    { onConflict: "name" }
  );

  if (error) {
    console.error("Error updating match assignment:", error);
    return false;
  }

  return true;
}

// Get matches assigned to a specific user
export async function getUserMatches(userId: string): Promise<{
  matches: Match[];
  profile: Profile | null;
}> {
  // Fetch user's profile and all matches in parallel
  const [profileResult, matchesResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).single(),
    getMatches(),
  ]);

  const profile = profileResult.data || null;
  const allMatches = matchesResult;

  // Filter matches where the user is assigned to any role
  const userMatches = allMatches.filter(
    (match) =>
      match.red1_scouter_id === userId ||
      match.red2_scouter_id === userId ||
      match.red3_scouter_id === userId ||
      match.qual_red_scouter_id === userId ||
      match.blue1_scouter_id === userId ||
      match.blue2_scouter_id === userId ||
      match.blue3_scouter_id === userId ||
      match.qual_blue_scouter_id === userId
  );

  return {
    matches: userMatches,
    profile,
  };
}
