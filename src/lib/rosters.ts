import { supabase } from "./supabase";
import type { Roster, Role } from "@/types";

// Role to database column mapping (same as in matches.ts)
const roleToColumn: Record<Role, string> = {
  red1: "red1_scouter_id",
  red2: "red2_scouter_id",
  red3: "red3_scouter_id",
  qualRed: "qual_red_scouter_id",
  blue1: "blue1_scouter_id",
  blue2: "blue2_scouter_id",
  blue3: "blue3_scouter_id",
  qualBlue: "qual_blue_scouter_id",
};

/**
 * Fetch all rosters for a specific event
 */
export async function getRostersForEvent(eventId: string): Promise<Roster[]> {
  try {
    const { data, error } = await supabase
      .from("rosters")
      .select("*")
      .eq("event_id", eventId)
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching rosters:", error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("Error in getRostersForEvent:", error);
    return [];
  }
}

/**
 * Create a new roster
 */
export async function createRoster(
  name: string,
  eventId: string,
  description: string,
  assignments: Partial<Record<Role, string | null>>
): Promise<{ success: boolean; roster?: Roster; error?: string }> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      return { success: false, error: "Not authenticated" };
    }

    // Build roster data object
    const rosterData: any = {
      name,
      event_id: eventId,
      description: description || null,
      created_by: userData.user.id,
    };

    // Add scout assignments using role-to-column mapping
    Object.entries(assignments).forEach(([role, scouterId]) => {
      const column = roleToColumn[role as Role];
      if (column) {
        rosterData[column] = scouterId;
      }
    });

    const { data, error } = await supabase
      .from("rosters")
      .insert(rosterData)
      .select()
      .single();

    if (error) {
      console.error("Error creating roster:", error);
      // Check for unique constraint violation
      if (error.code === "23505") {
        return {
          success: false,
          error: "A roster with this name already exists for this event",
        };
      }
      return { success: false, error: error.message };
    }

    return { success: true, roster: data };
  } catch (error) {
    console.error("Error in createRoster:", error);
    return { success: false, error: "Unknown error occurred" };
  }
}

/**
 * Update an existing roster
 */
export async function updateRoster(
  rosterId: string,
  updates: {
    name?: string;
    description?: string;
    assignments?: Partial<Record<Role, string | null>>;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const updateData: any = {};

    if (updates.name) updateData.name = updates.name;
    if (updates.description !== undefined)
      updateData.description = updates.description || null;

    // Add scout assignment updates
    if (updates.assignments) {
      Object.entries(updates.assignments).forEach(([role, scouterId]) => {
        const column = roleToColumn[role as Role];
        if (column) {
          updateData[column] = scouterId;
        }
      });
    }

    const { error } = await supabase
      .from("rosters")
      .update(updateData)
      .eq("id", rosterId);

    if (error) {
      console.error("Error updating roster:", error);
      // Check for unique constraint violation
      if (error.code === "23505") {
        return {
          success: false,
          error: "A roster with this name already exists for this event",
        };
      }
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error("Error in updateRoster:", error);
    return { success: false, error: "Unknown error occurred" };
  }
}

/**
 * Delete a roster
 */
export async function deleteRoster(
  rosterId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from("rosters").delete().eq("id", rosterId);

    if (error) {
      console.error("Error deleting roster:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error("Error in deleteRoster:", error);
    return { success: false, error: "Unknown error occurred" };
  }
}

/**
 * Apply a roster to multiple matches
 */
export async function applyRosterToMatches(
  rosterId: string,
  matchIds: string[]
): Promise<{ success: boolean; updated: number; error?: string }> {
  try {
    // Fetch the roster
    const { data: roster, error: fetchError } = await supabase
      .from("rosters")
      .select("*")
      .eq("id", rosterId)
      .single();

    if (fetchError || !roster) {
      console.error("Error fetching roster:", fetchError);
      return { success: false, updated: 0, error: "Roster not found" };
    }

    // Build update object with scout assignments
    const updateData: any = {
      red1_scouter_id: roster.red1_scouter_id,
      red2_scouter_id: roster.red2_scouter_id,
      red3_scouter_id: roster.red3_scouter_id,
      qual_red_scouter_id: roster.qual_red_scouter_id,
      blue1_scouter_id: roster.blue1_scouter_id,
      blue2_scouter_id: roster.blue2_scouter_id,
      blue3_scouter_id: roster.blue3_scouter_id,
      qual_blue_scouter_id: roster.qual_blue_scouter_id,
    };

    // Update all matches at once using IN clause
    const { error: updateError, count } = await supabase
      .from("matches")
      .update(updateData)
      .in("id", matchIds);

    if (updateError) {
      console.error("Error applying roster to matches:", updateError);
      return {
        success: false,
        updated: 0,
        error: updateError.message,
      };
    }

    return { success: true, updated: count || matchIds.length };
  } catch (error) {
    console.error("Error in applyRosterToMatches:", error);
    return { success: false, updated: 0, error: "Unknown error occurred" };
  }
}

/**
 * Get a single roster by ID
 */
export async function getRosterById(
  rosterId: string
): Promise<Roster | null> {
  try {
    const { data, error } = await supabase
      .from("rosters")
      .select("*")
      .eq("id", rosterId)
      .single();

    if (error) {
      console.error("Error fetching roster:", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("Error in getRosterById:", error);
    return null;
  }
}
