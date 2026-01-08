import { supabase } from "./supabase";
import type { Match, Profile, Event } from "@/types";

// Fetch all events
export async function getEvents(): Promise<Event[]> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("start_date", { ascending: false });

  if (error) {
    console.error("Error fetching events:", error);
    return [];
  }

  return data || [];
}

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

// Create a new event with matches
export async function createEventWithMatches(
  eventName: string,
  eventId: string,
  numMatches: number
): Promise<{ success: boolean; event?: Event; error?: string }> {
  try {
    // Create the event (database will generate UUID for id)
    const { data: eventData, error: eventError } = await supabase
      .from("events")
      .insert({
        name: eventName,
      })
      .select()
      .single();

    if (eventError) {
      console.error("Error creating event:", eventError);
      return { success: false, error: eventError.message };
    }

    // Create matches for the event using the eventId as prefix
    const matchesToCreate = Array.from({ length: numMatches }, (_, i) => ({
      name: `${eventId}-Q${i + 1}`,
      match_number: i + 1,
      event_id: eventData.id,
    }));

    const { error: matchesError } = await supabase
      .from("matches")
      .insert(matchesToCreate);

    if (matchesError) {
      console.error("Error creating matches:", matchesError);
      return { success: false, error: matchesError.message };
    }

    return { success: true, event: eventData };
  } catch (error) {
    console.error("Error in createEventWithMatches:", error);
    return { success: false, error: "Unknown error occurred" };
  }
}

// Update a specific scouter assignment
export async function updateMatchAssignment(
  matchId: string,
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
    matchId,
    role,
    roleColumn,
    scouterId,
  });

  const { error } = await supabase
    .from("matches")
    .update({ [roleColumn]: scouterId })
    .eq("id", matchId);

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

// Remove a user's assignment from a match
export async function removeUserFromMatch(
  matchId: string,
  userId: string,
  role: string
): Promise<boolean> {
  const roleColumn = `${role.toLowerCase()}_scouter_id`;

  const { error } = await supabase
    .from("matches")
    .update({ [roleColumn]: null })
    .eq("id", matchId)
    .eq(roleColumn, userId);

  if (error) {
    console.error("Error removing user from match:", error);
    return false;
  }

  return true;
}
