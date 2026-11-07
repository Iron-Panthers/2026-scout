// What a partial match rescout can redo. The manager picks some; the rescout's submission
// takes those from the new scouting and keeps everything else from the original. Stored in
// match_rescouts.rescout_fields by id, so keep ids stable.
export const MATCH_RESCOUT_FIELDS = [
  { id: "autoShots", label: "Auto fuel" },
  { id: "teleopShots", label: "Teleop fuel" },
  { id: "shotPositions", label: "Shooting positions" },
  { id: "robotProblems", label: "Robot problems" },
  { id: "defense", label: "Defense" },
  { id: "comments", label: "Comments" },
] as const;

export type MatchRescoutField = (typeof MATCH_RESCOUT_FIELDS)[number]["id"];

/** "Auto fuel, Defense": a rescout's fields as the scout reads them. */
export function matchRescoutFieldLabels(fields: readonly string[]): string {
  return MATCH_RESCOUT_FIELDS.filter((field) => fields.includes(field.id)).map((field) => field.label).join(", ");
}
