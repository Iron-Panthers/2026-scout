import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { eventBBots, type BBot } from "@/lib/bbots";
import type { Event } from "@/types";

const BBotContext = createContext<Map<number, BBot>>(new Map());

/** Converts the event's off-season demo team numbers (when it's set to) for everything inside. */
export function BBotProvider({ event, children }: { event: Event | null | undefined; children: ReactNode }) {
  const convertBBots = event?.convert_bbots;
  const bbotTeams = event?.bbot_teams;
  const bbots = useMemo(() => eventBBots({ convert_bbots: convertBBots, bbot_teams: bbotTeams }), [convertBBots, bbotTeams]);
  return <BBotContext.Provider value={bbots}>{children}</BBotContext.Provider>;
}

/** The main team and letter a demo team number stands for at the current event, if any. */
// eslint-disable-next-line react-refresh/only-export-components
export function useBBot(teamNumber: number): BBot | undefined {
  return useContext(BBotContext).get(teamNumber);
}
