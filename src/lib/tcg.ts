import { supabase } from "@/lib/supabase";
import { getDevTcgBinder, isDevModeActive, openDevTcgPack } from "@/lib/devMode";

/** Card rarities, most common first. */
export const TCG_RARITIES = ["common", "uncommon", "rare", "double_rare", "ultra_rare"] as const;
export type TcgRarity = (typeof TCG_RARITIES)[number];

export const TCG_RARITY_LABEL: Record<TcgRarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  // Stored as double_rare / ultra_rare; shown as Epic and Legendary
  double_rare: "Epic",
  ultra_rare: "Legendary",
};

/** "MTTD 26" for the pack "mttd26": a short set code for the card's bottom line. */
export function setCodeFor(packId: string): string {
  const match = /^([a-z]+)(\d+)$/i.exec(packId);
  return match ? `${match[1].toUpperCase()} ${match[2]}` : packId.toUpperCase();
}

/** A card pack sold in the Shop's TCG tab. */
export interface TcgPack {
  id: string;
  name: string;
  cost: number;
  cards_per_pack: number;
}

/** One team's card in a pack's set. */
export interface TcgCard {
  id: string;
  pack_id: string;
  /** Its number in the set ("12/34"). */
  number: number;
  team_number: number;
  team_name: string;
  location: string | null;
  image_url: string | null;
  /** "logo": image_url is the team's logo (stored with the card), drawn small and centered. */
  image_kind?: "photo" | "logo";
  rarity: TcgRarity;
}

/** A card pulled from a pack, in pull order. */
export interface PulledCard {
  card: TcgCard;
  /** The first copy the user has. */
  isNew: boolean;
}

/** The packs on sale, with every card in each one's set. */
export async function getTcgPacks(): Promise<Array<TcgPack & { cards: TcgCard[] }>> {
  const [{ data: packs, error: packError }, { data: cards, error: cardError }] = await Promise.all([
    // Not the odds: players can't read them (open_tcg_pack rolls on the server)
    supabase.from("tcg_packs").select("id, name, cost, cards_per_pack").eq("active", true).order("sort_order"),
    supabase.from("tcg_cards").select("*").order("number"),
  ]);
  if (packError || cardError) {
    console.error("Error loading card packs:", packError ?? cardError);
    return [];
  }
  return ((packs ?? []) as TcgPack[]).map((pack) => ({
    ...pack,
    cards: ((cards ?? []) as TcgCard[]).filter((card) => card.pack_id === pack.id),
  }));
}

/** Every card, for showing a binder (including sets no longer on sale). */
export async function getAllTcgCards(): Promise<TcgCard[]> {
  const { data, error } = await supabase.from("tcg_cards").select("*").order("pack_id").order("number");
  if (error) {
    console.error("Error loading cards:", error);
    return [];
  }
  return (data ?? []) as TcgCard[];
}

/** Every set's name, by pack id (including packs no longer on sale). */
export async function getTcgPackNames(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from("tcg_packs").select("id, name");
  if (error) {
    console.error("Error loading card packs:", error);
    return {};
  }
  return Object.fromEntries(((data ?? []) as Array<{ id: string; name: string }>).map((pack) => [pack.id, pack.name]));
}

/**
 * How many of each card a user has, by card id. `sandbox`: the dev mode sandbox's binder
 * (only for the signed-in user's own) instead of the account's.
 */
export async function getBinder(userId: string, sandbox = false): Promise<Map<string, number>> {
  if (sandbox) return new Map(Object.entries(getDevTcgBinder(userId)));
  const { data, error } = await supabase.from("user_tcg_cards").select("card_id, count").eq("user_id", userId);
  if (error) {
    console.error("Error loading card binder:", error);
    return new Map();
  }
  return new Map(((data ?? []) as Array<{ card_id: string; count: number }>).map((row) => [row.card_id, row.count]));
}

/** A random card from the set, by the pack's odds (as open_tcg_pack rolls on the server). */
function rollCard(pack: TcgPack & { cards: TcgCard[] }, odds: Partial<Record<TcgRarity, number>>): TcgCard {
  const roll = Math.random();
  let upTo = 0;
  const rarity = TCG_RARITIES.find((tier) => roll < (upTo += odds[tier] ?? 0)) ?? "common";
  const pool = pack.cards.filter((card) => card.rarity === rarity);
  const from = pool.length > 0 ? pool : pack.cards;
  return from[Math.floor(Math.random() * from.length)];
}

/**
 * Opens a pack for the signed-in user: pays for it and adds the cards to their binder. In dev
 * mode it's the sandbox's points and binder (`userId`), never the account's.
 */
export async function openTcgPack(
  pack: TcgPack & { cards: TcgCard[] },
  userId: string
): Promise<{ points: number; pulled: PulledCard[] }> {
  if (isDevModeActive()) {
    if (pack.cards.length === 0) throw new Error("That pack has no cards yet");
    // Odds are hidden from players; dev mode (developers only) gets them to roll the sandbox's pack
    const { data: odds, error: oddsError } = await supabase.rpc("get_tcg_pack_odds", { p_pack_id: pack.id });
    if (oddsError) throw oddsError;
    const cards = Array.from({ length: pack.cards_per_pack }, () => rollCard(pack, (odds ?? {}) as Partial<Record<TcgRarity, number>>));
    const result = openDevTcgPack(userId, pack.cost, cards.map((card) => card.id));
    if ("error" in result) throw new Error(result.error);
    return { points: result.points, pulled: cards.map((card, i) => ({ card, isNew: result.isNew[i] })) };
  }

  const { data, error } = await supabase.rpc("open_tcg_pack", { p_pack_id: pack.id });
  if (error) throw error;
  const result = data as { points: number; cards: Array<{ card_id: string; is_new: boolean }> };
  const byId = new Map(pack.cards.map((card) => [card.id, card]));
  return {
    points: result.points,
    pulled: result.cards
      .map((pull) => ({ card: byId.get(pull.card_id), isNew: pull.is_new }))
      .filter((pull): pull is PulledCard => !!pull.card),
  };
}
