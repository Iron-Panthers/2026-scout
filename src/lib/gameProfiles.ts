import { supabase } from "@/lib/supabase";
import type { GameProfile } from "@/types";

/**
 * Fetch the game profile for a user.
 * If no row exists yet (first visit), one is created automatically.
 */
export async function getGameProfile(userId: string): Promise<GameProfile | null> {
  const { data, error } = await supabase
    .from("game_profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error) {
    // PGRST116 = "no rows returned" — auto-create the profile
    if (error.code === "PGRST116") {
      return createGameProfile(userId);
    }
    console.error("[gameProfiles] getGameProfile error:", error);
    return null;
  }

  return data as GameProfile;
}

/**
 * Create a fresh game profile for a user with 0 points and no unlocked games.
 */
async function createGameProfile(userId: string): Promise<GameProfile | null> {
  const { data, error } = await supabase
    .from("game_profiles")
    .insert({ user_id: userId, points: 0, unlocked_games: [] })
    .select()
    .single();

  if (error) {
    console.error("[gameProfiles] createGameProfile error:", error);
    return null;
  }

  return data as GameProfile;
}

/**
 * Attempt to purchase a game.
 * Returns success/failure and the updated point balance.
 */
export async function purchaseGame(
  userId: string,
  gameId: string,
  cost: number
): Promise<{ success: boolean; newPoints: number; error?: string }> {
  const profile = await getGameProfile(userId);

  if (!profile) {
    return { success: false, newPoints: 0, error: "Could not load your game profile." };
  }

  if (profile.unlocked_games.includes(gameId)) {
    return { success: false, newPoints: profile.points, error: "You already own this game." };
  }

  if (profile.points < cost) {
    return {
      success: false,
      newPoints: profile.points,
      error: `Not enough points. You need ${cost} but have ${profile.points}.`,
    };
  }

  const newPoints = profile.points - cost;
  const newUnlocked = [...profile.unlocked_games, gameId];

  const { data, error } = await supabase
    .from("game_profiles")
    .update({ points: newPoints, unlocked_games: newUnlocked })
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    console.error("[gameProfiles] purchaseGame update error:", error);
    return { success: false, newPoints: profile.points, error: "Purchase failed. Please try again." };
  }

  return { success: true, newPoints: (data as GameProfile).points };
}

/**
 * Award points to a user (manager-only action).
 */
export async function awardPoints(targetUserId: string, amount: number): Promise<{ success: boolean; error?: string }> {
  // Use rpc or a read-then-write. Supabase doesn't support atomic increments
  // without an RPC, so we fetch and update.
  const profile = await getGameProfile(targetUserId);

  if (!profile) {
    return { success: false, error: "Could not load target user's game profile." };
  }

  const { error } = await supabase
    .from("game_profiles")
    .update({ points: profile.points + amount })
    .eq("user_id", targetUserId);

  if (error) {
    console.error("[gameProfiles] awardPoints error:", error);
    return { success: false, error: "Failed to award points." };
  }

  return { success: true };
}
