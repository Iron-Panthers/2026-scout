import { AUTO_SHOTS_END } from "@/lib/useMatchTimer";
import type { MatchRescoutField } from "@/config/matchRescoutFields";

/**
 * The submission a partial rescout saves: the original's data, with the rescout's fields
 * taken from the new scouting. Fuel splits at AUTO_SHOTS_END, so auto and teleop can each
 * come from either. The new scouting's own error report replaces the original's, since the
 * original's is what the rescout answers.
 */
export function mergeRescoutData(
  original: Record<string, unknown>,
  rescout: Record<string, unknown>,
  fields: readonly string[]
): Record<string, unknown> {
  const has = (field: MatchRescoutField) => fields.includes(field);
  const shotsOf = (data: Record<string, unknown>) =>
    (Array.isArray(data.shots) ? data.shots : []).filter((t: unknown): t is number => typeof t === "number");
  const autoShots = shotsOf(has("autoShots") ? rescout : original).filter((t) => t < AUTO_SHOTS_END);
  const teleopShots = shotsOf(has("teleopShots") ? rescout : original).filter((t) => t >= AUTO_SHOTS_END);
  const from = (field: MatchRescoutField, key: string) => (has(field) ? rescout : original)[key] ?? null;

  return {
    ...original,
    shots: [...autoShots, ...teleopShots].sort((a, b) => a - b),
    primaryShotPosition: from("shotPositions", "primaryShotPosition"),
    secondaryShotPosition: from("shotPositions", "secondaryShotPosition"),
    robot_problems: from("robotProblems", "robot_problems"),
    defenseDescription: from("defense", "defenseDescription"),
    comments: from("comments", "comments") ?? "",
    errors: rescout.errors ?? null,
  };
}
