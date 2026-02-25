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

export async function uploadAvatar(
  userId: string,
  file: File
): Promise<string | null> {
  // Delete all existing avatar files for this user so storage stays clean
  // and the new URL will be different (busting the browser cache)
  const { data: existingFiles } = await supabase.storage
    .from("avatars")
    .list(userId);

  if (existingFiles && existingFiles.length > 0) {
    const filePaths = existingFiles.map((f) => `${userId}/${f.name}`);
    await supabase.storage.from("avatars").remove(filePaths);
  }

  const ext = file.name.split(".").pop() || "jpg";
  const path = `${userId}/avatar_${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file);

  if (uploadError) {
    console.error("Error uploading avatar:", uploadError);
    return null;
  }

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const publicUrl = data.publicUrl;

  await updateProfile(userId, { avatar_url: publicUrl });
  return publicUrl;
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
