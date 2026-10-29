import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getLivePicklist, type LivePicklistRow } from "@/lib/livePicklists";

/**
 * An event's shared live picklist, kept up to date as the host changes it.
 * Pass no event id (e.g. for a sandbox event) to skip loading.
 */
export function useLivePicklist(eventId: string | undefined) {
  const [state, setState] = useState<{ eventId: string; row: LivePicklistRow | null } | null>(null);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    const load = () =>
      getLivePicklist(eventId).then((row) => {
        if (!cancelled) setState({ eventId, row });
      });
    void load();
    const channel = supabase
      .channel(`live-picklist-row-${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_picklists", filter: `event_id=eq.${eventId}` },
        () => void load()
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  const current = eventId && state?.eventId === eventId ? state : null;
  return { row: current?.row ?? null, loaded: current != null };
}
