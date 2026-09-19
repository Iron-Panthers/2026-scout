import type { Role } from "@/types";

export function prettifyRole(role: string): string {
  switch (role) {
    case "red1": return "Red 1";
    case "red2": return "Red 2";
    case "red3": return "Red 3";
    case "qualRed": return "Qual Red";
    case "blue1": return "Blue 1";
    case "blue2": return "Blue 2";
    case "blue3": return "Blue 3";
    case "qualBlue": return "Qual Blue";
    default: return "Unknown Role";
  }
}

export const ROLES: Role[] = [
  "red1",
  "red2",
  "red3",
  "qualRed",
  "blue1",
  "blue2",
  "blue3",
  "qualBlue",
];

// Primary scouter column per role.
export const ROLE_TO_COLUMN: Record<Role, string> = {
  red1: "red1_scouter_id",
  red2: "red2_scouter_id",
  red3: "red3_scouter_id",
  qualRed: "qual_red_scouter_id",
  blue1: "blue1_scouter_id",
  blue2: "blue2_scouter_id",
  blue3: "blue3_scouter_id",
  qualBlue: "qual_blue_scouter_id",
};

// Secondary ("co-scout") column per role — same role, a second person
// attached alongside the primary. No alternating/rotation logic; both are
// just assigned to the role together.
export const ROLE_TO_COLUMN_2: Record<Role, string> = {
  red1: "red1_scouter_id_2",
  red2: "red2_scouter_id_2",
  red3: "red3_scouter_id_2",
  qualRed: "qual_red_scouter_id_2",
  blue1: "blue1_scouter_id_2",
  blue2: "blue2_scouter_id_2",
  blue3: "blue3_scouter_id_2",
  qualBlue: "qual_blue_scouter_id_2",
};

export function roleColumn(role: Role, slot: 1 | 2 = 1): string {
  return slot === 2 ? ROLE_TO_COLUMN_2[role] : ROLE_TO_COLUMN[role];
}

// Flattened (role, slot, column) list — handy for iterating every scouter
// column on a match/roster row (e.g. to find which role/slot a user id is in).
export const ALL_ROLE_COLUMNS: Array<{ role: Role; slot: 1 | 2; column: string }> = [
  ...ROLES.map((role) => ({ role, slot: 1 as const, column: ROLE_TO_COLUMN[role] })),
  ...ROLES.map((role) => ({ role, slot: 2 as const, column: ROLE_TO_COLUMN_2[role] })),
];
