import { supabase } from "@/lib/supabase";
import { getGameProfile } from "@/lib/gameProfiles";
import type { GameProfile } from "@/types";

export const CRATE_COST = 25;

export type { GameProfile };

/**
 * Batch-fetch equipped cosmetics for a list of user IDs.
 * Returns a map of userId -> { slot: cosmeticId }.
 */
export async function getEquippedCosmeticsMap(
  userIds: string[]
): Promise<Record<string, Record<string, string>>> {
  if (userIds.length === 0) return {};
  const { data, error } = await supabase
    .from("game_profiles")
    .select("user_id, equipped_cosmetics")
    .in("user_id", userIds);

  if (error || !data) return {};

  const map: Record<string, Record<string, string>> = {};
  for (const row of data) {
    map[row.user_id] = (row.equipped_cosmetics as Record<string, string>) ?? {};
  }
  return map;
}

export async function getPointsMap(
  userIds: string[]
): Promise<Record<string, number>> {
  if (userIds.length === 0) return {};
  const { data, error } = await supabase
    .from("game_profiles")
    .select("user_id, points")
    .in("user_id", userIds);

  if (error || !data) return {};

  const map: Record<string, number> = {};
  for (const row of data) {
    map[row.user_id] = row.points ?? -1;
  }
  return map;
}

/**
 * Purchase a cosmetic item.
 * Deducts points and adds the cosmetic id to owned_cosmetics[].
 */
export async function purchaseCosmetic(
  userId: string,
  cosmeticId: string,
  cost: number
): Promise<{ success: boolean; newPoints: number; error?: string }> {
  const profile = await getGameProfile(userId);
  if (!profile) return { success: false, newPoints: 0, error: "Could not load your profile." };

  if ((profile.owned_cosmetics ?? []).includes(cosmeticId)) {
    return { success: false, newPoints: profile.points, error: "You already own this item." };
  }

  if (profile.points < cost) {
    return {
      success: false,
      newPoints: profile.points,
      error: `Not enough points. You need ${cost} but have ${profile.points}.`,
    };
  }

  const newPoints = profile.points - cost;
  const newOwned = [...(profile.owned_cosmetics ?? []), cosmeticId];

  const { data, error } = await supabase
    .from("game_profiles")
    .update({ points: newPoints, owned_cosmetics: newOwned })
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    console.error("[shopService] purchaseCosmetic error:", error);
    return { success: false, newPoints: profile.points, error: "Purchase failed. Please try again." };
  }

  return { success: true, newPoints: (data as GameProfile).points };
}

/**
 * Equip a cosmetic to its slot.
 * slot is the category ("hat" or "cosmetic").
 */
export async function equipCosmetic(
  userId: string,
  slot: string,
  cosmeticId: string
): Promise<{ success: boolean; error?: string }> {
  const profile = await getGameProfile(userId);
  if (!profile) return { success: false, error: "Could not load your profile." };

  if (!(profile.owned_cosmetics ?? []).includes(cosmeticId)) {
    return { success: false, error: "You don't own this item." };
  }

  const newEquipped = { ...(profile.equipped_cosmetics ?? {}), [slot]: cosmeticId };

  const { error } = await supabase
    .from("game_profiles")
    .update({ equipped_cosmetics: newEquipped })
    .eq("user_id", userId);

  if (error) {
    console.error("[shopService] equipCosmetic error:", error);
    return { success: false, error: "Failed to equip item." };
  }

  return { success: true };
}

/**
 * Open a mystery crate: deduct CRATE_COST points and record the won item.
 * The client-side rolls the item; this function just records the transaction.
 */
export async function openCrate(
  userId: string,
  itemId: string,
): Promise<{ success: boolean; newPoints: number; isDuplicate: boolean; error?: string }> {
  const profile = await getGameProfile(userId);
  if (!profile) {
    return { success: false, newPoints: 0, isDuplicate: false, error: "Could not load your profile." };
  }

  if (profile.points < CRATE_COST) {
    return {
      success: false,
      newPoints: profile.points,
      isDuplicate: false,
      error: `Not enough points. You need ${CRATE_COST} but have ${profile.points}.`,
    };
  }

  const isDuplicate = (profile.owned_cosmetics ?? []).includes(itemId);
  const newPoints = profile.points - CRATE_COST;
  const newOwned = isDuplicate
    ? (profile.owned_cosmetics ?? [])
    : [...(profile.owned_cosmetics ?? []), itemId];

  const { data, error } = await supabase
    .from("game_profiles")
    .update({ points: newPoints, owned_cosmetics: newOwned })
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    console.error("[shopService] openCrate error:", error);
    return { success: false, newPoints: profile.points, isDuplicate: false, error: "Failed to open crate." };
  }

  return { success: true, newPoints: (data as GameProfile).points, isDuplicate };
}

/**
 * Unequip a cosmetic slot (removes whatever is currently in that slot).
 */
export async function unequipCosmetic(
  userId: string,
  slot: string
): Promise<{ success: boolean; error?: string }> {
  const profile = await getGameProfile(userId);
  if (!profile) return { success: false, error: "Could not load your profile." };

  const newEquipped = { ...(profile.equipped_cosmetics ?? {}) };
  delete newEquipped[slot];

  const { error } = await supabase
    .from("game_profiles")
    .update({ equipped_cosmetics: newEquipped })
    .eq("user_id", userId);

  if (error) {
    console.error("[shopService] unequipCosmetic error:", error);
    return { success: false, error: "Failed to unequip item." };
  }

  return { success: true };
}
