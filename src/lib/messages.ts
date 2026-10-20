import { supabase } from "@/lib/supabase";

export interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface MessageContact {
  id: string;
  name: string;
  avatar_url: string | null;
  is_manager: boolean;
}

export const MAX_MESSAGE_LENGTH = 2000;

/** Everyone the signed-in user can message (everyone but themselves), managers first. */
export async function getMessageContacts(): Promise<MessageContact[]> {
  const { data, error } = await supabase.rpc("list_message_contacts");
  if (error) {
    console.error("Error loading message contacts:", error);
    return [];
  }
  return (data ?? []) as MessageContact[];
}

/** The signed-in user's recent messages, sent and received, newest first. */
export async function getMyMessages(userId: string, limit = 500): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("Error loading messages:", error);
    return [];
  }
  return (data ?? []) as Message[];
}

export async function getUnreadMessageCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .is("read_at", null);
  if (error) {
    console.error("Error counting unread messages:", error);
    return 0;
  }
  return count ?? 0;
}

export async function sendMessage(senderId: string, recipientId: string, body: string): Promise<Message | null> {
  const { data, error } = await supabase
    .from("messages")
    .insert({ sender_id: senderId, recipient_id: recipientId, body: body.trim() })
    .select()
    .single();
  if (error) {
    console.error("Error sending message:", error);
    return null;
  }
  return data as Message;
}

/** Marks everything `senderId` sent the signed-in user as read. */
export async function markConversationRead(senderId: string): Promise<void> {
  const { error } = await supabase.rpc("mark_messages_read", { p_sender: senderId });
  if (error) console.error("Error marking messages read:", error);
}

export function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";
}
