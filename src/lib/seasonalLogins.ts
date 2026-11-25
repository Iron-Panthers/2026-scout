import { supabase } from "@/lib/supabase";
import { getDevSeasonalLoginDays, isDevModeActive, recordDevSeasonalLogin } from "@/lib/devMode";
import { localDateKey } from "@/config/seasonalEvents";

/**
 * Records that the signed-in user opened the app today during a seasonal event, for rewards
 * that need every day of it. How many different days they have for it; null if it couldn't be
 * saved. In the developer sandbox it's the sandbox's own record.
 */
export async function recordSeasonalLogin(userId: string, eventId: string): Promise<number | null> {
  const today = localDateKey(new Date());
  if (isDevModeActive()) return recordDevSeasonalLogin(userId, eventId, today);
  const { data, error } = await supabase.rpc("record_seasonal_login", { p_event_id: eventId, p_day: today });
  if (error) {
    console.error("Error recording seasonal event login:", error);
    return null;
  }
  return data as number;
}

/** How many days the user has opened the app during a seasonal event. */
export async function getSeasonalLoginDays(userId: string, eventId: string): Promise<number> {
  if (isDevModeActive()) return getDevSeasonalLoginDays(userId, eventId);
  const { count, error } = await supabase
    .from("seasonal_event_logins")
    .select("day", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event_id", eventId);
  if (error) {
    console.error("Error loading seasonal event logins:", error);
    return 0;
  }
  return count ?? 0;
}
