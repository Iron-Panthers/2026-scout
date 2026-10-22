import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useDevMode } from "@/contexts/DevModeContext";
import {
  ACHIEVEMENT_CHECK_EVENT,
  ACHIEVEMENT_UNLOCKED_EVENT,
  claimEarnedAchievements,
  evaluateAchievements,
  getAchievementData,
  getDevAchievementData,
  type AchievementDefinition,
} from "@/lib/achievements";
import type { AchievementCheckRequest } from "@/lib/achievementEvents";

/** How often to check for achievements earned from scouting while the app is just left open. */
const CHECK_INTERVAL_MS = 3 * 60_000;

/**
 * Achievement notifications, anywhere in the app:
 *   - congratulates the scouter whenever unlockAchievement() records a new one (clicking
 *     the notification opens their achievements page);
 *   - checks in the background for ones earned from their scouting (matches, events, team
 *     years...), which aren't triggered by any one action, so those notify too instead of
 *     only when the profile or achievements page is opened.
 */
export default function AchievementToaster() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const { devMode } = useDevMode();
  const userId = user?.id ?? null;
  const teamYearsKey = (profile?.team_years ?? []).join(",");

  useEffect(() => {
    const onUnlocked = (event: Event) => {
      const achievement = (event as CustomEvent<AchievementDefinition & { points: number }>).detail;
      const { dismiss } = toast({
        title: `🏆 Achievement unlocked: ${achievement.name}`,
        description: `${achievement.description}${achievement.points > 0 ? ` · +${achievement.points} points` : ""} · Tap to view`,
        className: "cursor-pointer",
        // Shown as soon as the current notification closes, ahead of any others waiting
        priority: true,
        onClick: (e: React.MouseEvent) => {
          // The notification's own close (×) button just closes it
          if ((e.target as HTMLElement).closest("[toast-close]")) return;
          dismiss();
          navigate("/achievements");
        },
      });
    };
    window.addEventListener(ACHIEVEMENT_UNLOCKED_EVENT, onUnlocked);
    return () => window.removeEventListener(ACHIEVEMENT_UNLOCKED_EVENT, onUnlocked);
  }, [toast, navigate]);

  // Background check for scouting-based achievements, on opening the app, on every page
  // change, every few minutes, and straight away when asked (requestAchievementCheck(), e.g.
  // right after scouting is submitted). One runs at a time; a request that arrives during a
  // check runs right after it, so nothing earned is missed. Only the active event's
  // leaderboard is refreshed first, which keeps these frequent checks cheap.
  // The check lives in a ref and only stops for a different (or signed-out) user: changing
  // page never cancels one that's running.
  const checkingFor = useRef<string | null>(null);
  const inFlight = useRef(false);
  const again = useRef(false);
  const pendingRefresh = useRef<"all" | "active">("active");
  const runCheck = useRef<(refresh?: "all" | "active") => void>(() => {});
  useEffect(() => {
    checkingFor.current = userId;
    const run = (refresh: "all" | "active" = "active") => {
      if (!userId) return;
      if (refresh === "all") pendingRefresh.current = "all";
      if (inFlight.current) {
        again.current = true;
        return;
      }
      inFlight.current = true;
      const refreshNow = pendingRefresh.current;
      pendingRefresh.current = "active";
      const years = teamYearsKey ? teamYearsKey.split(",").map(Number) : [];
      const load = devMode ? Promise.resolve(getDevAchievementData(userId)) : getAchievementData(userId, years, undefined, refreshNow);
      load
        .then((data) => {
          // Still the same scouter signed in
          if (checkingFor.current === userId) claimEarnedAchievements(userId, evaluateAchievements(data), data);
        })
        .catch((error) => console.error("Achievement check failed:", error))
        .finally(() => {
          inFlight.current = false;
          if (again.current) {
            again.current = false;
            run();
          }
        });
    };
    runCheck.current = run;
    run();
    const interval = window.setInterval(() => run(), CHECK_INTERVAL_MS);
    const onRequest = (event: Event) => run((event as CustomEvent<AchievementCheckRequest>).detail?.refresh);
    window.addEventListener(ACHIEVEMENT_CHECK_EVENT, onRequest);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener(ACHIEVEMENT_CHECK_EVENT, onRequest);
    };
  }, [userId, devMode, teamYearsKey]);

  // ...and on every page change
  useEffect(() => {
    runCheck.current();
  }, [location.pathname]);

  return null;
}
