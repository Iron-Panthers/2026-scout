import { supabase } from "@/lib/supabase";
import { getGameProfile } from "@/lib/gameProfiles";
import { COSMETICS } from "@/config/cosmetics";
import type { GameProfile } from "@/types";

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
 * Deducts from the chosen currency balance ("points" or "event") and adds
 * the cosmetic id to owned_cosmetics[]. `newPoints` reflects whichever
 * balance was spent. When buying with "event" currency, `eventName` (if
 * given) is recorded so the Shop can label which event the item came from.
 */
export async function purchaseCosmetic(
  userId: string,
  cosmeticId: string,
  cost: number,
  currency: "points" | "event" = "points",
  eventName?: string
): Promise<{ success: boolean; newPoints: number; error?: string }> {
  const profile = await getGameProfile(userId);
  if (!profile) return { success: false, newPoints: 0, error: "Could not load your profile." };

  const balance = currency === "event" ? profile.event_points : profile.points;
  const currencyLabel = currency === "event" ? "event points" : "points";

  if ((profile.owned_cosmetics ?? []).includes(cosmeticId)) {
    return { success: false, newPoints: balance, error: "You already own this item." };
  }

  if (balance < cost) {
    return {
      success: false,
      newPoints: balance,
      error: `Not enough ${currencyLabel}. You need ${cost} but have ${balance}.`,
    };
  }

  const newBalance = balance - cost;
  const newOwned = [...(profile.owned_cosmetics ?? []), cosmeticId];
  const update =
    currency === "event"
      ? {
          event_points: newBalance,
          owned_cosmetics: newOwned,
          ...(eventName
            ? { event_cosmetic_sources: { ...(profile.event_cosmetic_sources ?? {}), [cosmeticId]: eventName } }
            : {}),
        }
      : { points: newBalance, owned_cosmetics: newOwned };

  const { data, error } = await supabase
    .from("game_profiles")
    .update(update)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    console.error("[shopService] purchaseCosmetic error:", error);
    return { success: false, newPoints: balance, error: "Purchase failed. Please try again." };
  }

  const updated = data as GameProfile;
  return { success: true, newPoints: currency === "event" ? updated.event_points : updated.points };
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

  const isDefault = COSMETICS.find((c) => c.id === cosmeticId)?.default === true;
  if (!isDefault && !(profile.owned_cosmetics ?? []).includes(cosmeticId)) {
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
 * Open a mystery crate: deduct `cost` points and record the won item.
 * The client-side rolls the item; this function just records the transaction.
 */
export async function openCrate(
  userId: string,
  itemId: string,
  cost: number,
): Promise<{ success: boolean; newPoints: number; isDuplicate: boolean; refund: number; error?: string }> {
  const profile = await getGameProfile(userId);
  if (!profile) {
    return { success: false, newPoints: 0, isDuplicate: false, refund: 0, error: "Could not load your profile." };
  }

  if (profile.points < cost) {
    return {
      success: false,
      newPoints: profile.points,
      isDuplicate: false,
      refund: 0,
      error: `Not enough points. You need ${cost} but have ${profile.points}.`,
    };
  }

  const isDuplicate = (profile.owned_cosmetics ?? []).includes(itemId);
  // Duplicates refund half the crate cost since no new cosmetic was gained.
  const refund = isDuplicate ? Math.floor(cost / 2) : 0;
  const newPoints = profile.points - cost + refund;
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
    return { success: false, newPoints: profile.points, isDuplicate: false, refund: 0, error: "Failed to open crate." };
  }

  return { success: true, newPoints: (data as GameProfile).points, isDuplicate, refund };
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
