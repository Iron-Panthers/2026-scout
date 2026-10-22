import { useEffect, useState } from "react";
import {
  ACHIEVEMENT_UNLOCKED_EVENT,
  claimEarnedAchievements,
  evaluateAchievements,
  getAchievementData,
  getDevAchievementData,
  type AchievementProgress,
} from "@/lib/achievements";
import { useAuth } from "@/contexts/AuthContext";
import { useDevMode } from "@/contexts/DevModeContext";
import type { ScoutedEvent } from "@/lib/scoutingHistory";

/**
 * A scouter's achievements (null while loading). Pass `events` when the page already has
 * their scouting history, to avoid loading it twice. When they're your own, any you've
 * reached but not been paid for yet are recorded (paying their points).
 *
 * In the developer sandbox your own achievements are the sandbox's: they start from a
 * blank slate, are earned by playing in the sandbox, and never touch your real ones.
 */
export function useAchievements(userId: string | undefined | null, teamYears: number[], events?: ScoutedEvent[] | null) {
  const { user } = useAuth();
  const { devMode } = useDevMode();
  const [achievements, setAchievements] = useState<AchievementProgress[] | null>(null);
  // Bumped when one is earned while this is on screen, to show it straight away
  const [unlockCount, setUnlockCount] = useState(0);
  useEffect(() => {
    const onUnlocked = () => setUnlockCount((count) => count + 1);
    window.addEventListener(ACHIEVEMENT_UNLOCKED_EVENT, onUnlocked);
    return () => window.removeEventListener(ACHIEVEMENT_UNLOCKED_EVENT, onUnlocked);
  }, []);
  const yearsKey = [...teamYears].sort().join(",");

  useEffect(() => {
    // Waiting on the page's own copy of their events
    if (!userId || events === null) return;
    let cancelled = false;
    if (devMode && userId === user?.id) {
      // Sandbox: its own scouting history and achievements (recorded in the sandbox only)
      Promise.resolve().then(() => {
        if (cancelled) return;
        const data = getDevAchievementData(userId);
        const evaluated = evaluateAchievements(data);
        setAchievements(evaluated);
        claimEarnedAchievements(userId, evaluated, data);
      });
      return () => {
        cancelled = true;
      };
    }
    getAchievementData(userId, yearsKey ? yearsKey.split(",").map(Number) : [], events).then((data) => {
      if (cancelled) return;
      const evaluated = evaluateAchievements(data);
      setAchievements(evaluated);
      if (userId === user?.id) claimEarnedAchievements(userId, evaluated, data);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, yearsKey, events, user?.id, devMode, unlockCount]);

  return achievements;
}
