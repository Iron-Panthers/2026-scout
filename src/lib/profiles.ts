import { supabase } from "./supabase";
import type { Profile } from "@/types";

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("Error fetching profile:", error);
    return null;
  }

  return data;
}

// For debug purposes (i dont have access to supabase)
export async function getAllData(): Promise<Object> {
  const p_data = await supabase
    .from("profiles")
    .select("*");
  // console.log(supabase.storage);
  const e_data = await supabase
    .from("events")
    .select("*");
  const m_data = await supabase
    .from("matches")
    .select("*");

  if (p_data.error) {
    console.error("Error fetching:", p_data.error);
  }
  if (e_data.error) {
    console.error("Error fetching:", e_data.error);
  }
  if (m_data.error) {
    console.error("Error fetching:", m_data.error);
  }
  return [ p_data.data, e_data.data, m_data.data ];
}

export async function updateProfile(
  userId: string,
  updates: Partial<Profile>
): Promise<boolean> {
  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", userId);

  if (error) {
    console.error("Error updating profile:", error);
    return false;
  }

  return true;
}

export async function createProfile(
  userId: string,
  name: string
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .insert([
      {
        id: userId,
        name,
        role: "scout",
        is_manager: false,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error("Error creating profile:", error);
    return null;
  }

  return data;
}
