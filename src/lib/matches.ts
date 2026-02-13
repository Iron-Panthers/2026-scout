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

// Fetch the currently active event
export async function getActiveEvent(): Promise<Event | null> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("is_active", true)
    .single();

  if (error) {
    if (error.code !== "PGRST116") {
      // PGRST116 is "no rows returned", which is expected if no active event
      console.error("Error fetching active event:", error);
    }
    return null;
  }

  return data;
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

// Fetch match from id
export async function getMatch(matchId: string): Promise<Match | null> {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .single();

  if (error) {
    console.error("Error fetching matches:", error);
    return null;
  }

  return data;
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
  eventCode: string,
  numMatches: number
): Promise<{ success: boolean; event?: Event; error?: string }> {
  try {
    // Create the event (database will generate UUID for id)
    const { data: eventData, error: eventError } = await supabase
      .from("events")
      .insert({
        name: eventName,
        event_code: eventCode,
      })
      .select()
      .single();

    if (eventError) {
      console.error("Error creating event:", eventError);
      return { success: false, error: eventError.message };
    }

    // Create matches for the event using the eventCode as prefix
    const matchesToCreate = Array.from({ length: numMatches }, (_, i) => ({
      name: `${eventCode}-Q${i + 1}`,
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

  // Map role names to display names
  const roleToDisplay: Record<string, string> = {
    red1: "Red 1",
    red2: "Red 2",
    red3: "Red 3",
    qualRed: "Qual Red",
    blue1: "Blue 1",
    blue2: "Blue 2",
    blue3: "Blue 3",
    qualBlue: "Qual Blue",
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

  // Get current assignment before updating (for unassignment notifications)
  const { data: currentMatch } = await supabase
    .from("matches")
    .select("*, events(name)")
    .eq("id", matchId)
    .single();

  const previousScouterId = currentMatch?.[roleColumn];

  // Update the assignment
  const { error } = await supabase
    .from("matches")
    .update({ [roleColumn]: scouterId })
    .eq("id", matchId);

  if (error) {
    console.error("Error updating match assignment:", error);
    return false;
  }

  // Send unassignment notification if scout was removed
  if (previousScouterId && !scouterId && currentMatch) {
    sendUnassignmentNotification(
      previousScouterId,
      currentMatch.match_number,
      currentMatch.events?.name || "Event",
      roleToDisplay[role] || role
    ).catch((err) =>
      console.error("Failed to send unassignment notification:", err)
    );
  }

  return true;
}

// Send unassignment notification via edge function
async function sendUnassignmentNotification(
  userId: string,
  matchNumber: number,
  eventName: string,
  role: string
): Promise<void> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("Supabase credentials not available for notification");
    return;
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/send-unassignment-notification`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          userId,
          matchNumber,
          eventName,
          role,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Unassignment notification failed:", error);
    } else {
      console.log("Unassignment notification sent successfully");
    }
  } catch (error) {
    console.error("Error sending unassignment notification:", error);
  }
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

// Update event details
export async function updateEvent(
  eventId: string,
  updates: {
    name?: string;
    event_code?: string;
    location?: string;
    start_date?: string;
    end_date?: string;
    scouting_map_url?: string;
  }
): Promise<boolean> {
  const { error } = await supabase
    .from("events")
    .update(updates)
    .eq("id", eventId);

  if (error) {
    console.error("Error updating event:", error);
    return false;
  }

  return true;
}

// Backfill event_id for matches that don't have it set
// Uses the active event as the event_id
export async function backfillMatchEventIds(): Promise<{
  success: boolean;
  updated: number;
  error?: string;
}> {
  try {
    // Get active event
    const activeEvent = await getActiveEvent();

    if (!activeEvent) {
      return { success: false, updated: 0, error: "No active event found" };
    }

    // Get all matches without event_id
    const { data: matchesWithoutEvent, error: fetchError } = await supabase
      .from("matches")
      .select("id")
      .is("event_id", null);

    if (fetchError) {
      console.error("Error fetching matches without event_id:", fetchError);
      return { success: false, updated: 0, error: fetchError.message };
    }

    if (!matchesWithoutEvent || matchesWithoutEvent.length === 0) {
      return { success: true, updated: 0 };
    }

    // Update all matches to have the active event_id
    const { error: updateError } = await supabase
      .from("matches")
      .update({ event_id: activeEvent.id })
      .is("event_id", null);

    if (updateError) {
      console.error("Error updating matches:", updateError);
      return { success: false, updated: 0, error: updateError.message };
    }

    console.log(
      `Backfilled event_id for ${matchesWithoutEvent.length} matches with event: ${activeEvent.name}`
    );

    return { success: true, updated: matchesWithoutEvent.length };
  } catch (error) {
    console.error("Error in backfillMatchEventIds:", error);
    return {
      success: false,
      updated: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
