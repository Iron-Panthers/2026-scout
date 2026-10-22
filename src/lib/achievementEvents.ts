// Window events for achievements, in their own module (no imports) so anything — including
// low-level data modules — can raise them without pulling in the achievements code.

/** Fired when an achievement is newly earned, so the app can congratulate them. */
export const ACHIEVEMENT_UNLOCKED_EVENT = "achievement-unlocked";

/** Fired to ask for an immediate check for newly earned achievements (e.g. after submitting scouting). */
export const ACHIEVEMENT_CHECK_EVENT = "achievement-check";

export interface AchievementCheckRequest {
  /**
   * Which events' leaderboards to bring up to date first: "all" when the scouting just done
   * may be for any event (a submission), "active" (the default) otherwise.
   */
  refresh?: "all" | "active";
}

export function requestAchievementCheck(request: AchievementCheckRequest = {}) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<AchievementCheckRequest>(ACHIEVEMENT_CHECK_EVENT, { detail: request }));
  }
}
