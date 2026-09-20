// Scout/User Types
export interface Scout {
  id: string; // Changed from number to string (UUID from database)
  name: string;
  initials: string;
  avatar: string;
  // Whether this scout is on the currently selected event's registered
  // roster (availableScouts) vs. only found in the full scout list
  // (allScouts) as a fallback — false surfaces a "Not registered for
  // Event" warning in the manager's assignment grid.
  registered?: boolean;
}

// Profile Type (from Supabase)
export interface Profile {
  id: string;
  name: string | null;
  role: "scout" | "manager" | "admin";
  is_manager: boolean;
  avatar_url: string | null;
  clocked_in: boolean;
  clocked_in_at: string | null;
  created_at: string;
  updated_at: string;
}

// Event Type (database event)
export interface Event {
  id: string;
  name: string;
  event_code: string | null; // TBA event code (e.g., "2024cmp", "2024caln")
  is_active: boolean; // Only one event should be active at a time
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  scouting_map_url: string | null; // URL to the scouting map image
  created_at: string;
  updated_at: string;
  users: string[];
}

// Scouting Event (action logged during match)
export interface ScoutingEvent {
  type: string;
  timestamp: number;
}

// Shot Event (shot location with timestamp)
export interface ShotEvent {
  x: number;
  y: number;
  timestamp: number;
}

// Match Type (from Supabase)
export interface Match {
  id: string;
  name: string;
  event_id: string | null;
  match_number: number;
  red1_scouter_id: string | null;
  red2_scouter_id: string | null;
  red3_scouter_id: string | null;
  qual_red_scouter_id: string | null;
  blue1_scouter_id: string | null;
  blue2_scouter_id: string | null;
  blue3_scouter_id: string | null;
  qual_blue_scouter_id: string | null;
  // Second ("co-scout") slot per role — see ROLE_TO_COLUMN_2 in roleUtils.ts.
  red1_scouter_id_2: string | null;
  red2_scouter_id_2: string | null;
  red3_scouter_id_2: string | null;
  qual_red_scouter_id_2: string | null;
  blue1_scouter_id_2: string | null;
  blue2_scouter_id_2: string | null;
  blue3_scouter_id_2: string | null;
  qual_blue_scouter_id_2: string | null;
  winning_alliance: "red" | "blue" | "tie" | null;
  // Deprecated — predictions now come from match13 (see match13_red_win_prob).
  // Left in place since dropping the column isn't necessary; nothing writes to it anymore.
  statbotics_red_win_prob: number | null;
  match13_red_win_prob: number | null;
  pred_time: string | null;
  red_score: number | null;
  blue_score: number | null;
  created_at: string;
  updated_at: string;
}

// Roster Type (from Supabase) - scout assignment templates
export interface Roster {
  id: string;
  name: string;
  description: string | null;
  event_id: string;
  created_by: string;
  red1_scouter_id: string | null;
  red2_scouter_id: string | null;
  red3_scouter_id: string | null;
  qual_red_scouter_id: string | null;
  blue1_scouter_id: string | null;
  blue2_scouter_id: string | null;
  blue3_scouter_id: string | null;
  qual_blue_scouter_id: string | null;
  // Second ("co-scout") slot per role — see ROLE_TO_COLUMN_2 in roleUtils.ts.
  red1_scouter_id_2: string | null;
  red2_scouter_id_2: string | null;
  red3_scouter_id_2: string | null;
  qual_red_scouter_id_2: string | null;
  blue1_scouter_id_2: string | null;
  blue2_scouter_id_2: string | null;
  blue3_scouter_id_2: string | null;
  qual_blue_scouter_id_2: string | null;
  created_at: string;
  updated_at: string;
}

// Role Types
export type Role =
  | "red1"
  | "red2"
  | "red3"
  | "blue1"
  | "blue2"
  | "blue3"
  | "qualRed"
  | "qualBlue";

// Match Types
export interface ScheduledMatch {
  id: number;
  scouterName: string;
  matchNumber: string;
  team: number;
  role: Role;
  time: string;
}

export interface PastMatch {
  id: number;
  scouterName: string;
  matchNumber: string;
  team: number;
  role: Role;
  time: string;
}

// Manager Assignment Types
export interface MatchAssignment {
  matchNumber: number;
  matchId?: string;
  assignments: Partial<Record<Role, Scout | null>>;
  // Second ("co-scout") slot per role, shown/edited alongside `assignments`.
  assignments2?: Partial<Record<Role, Scout | null>>;
}

export interface SelectedCell {
  matchNumber: number;
  role: Role;
  slot?: 1 | 2;
}

// Component Props Types
export interface DashboardHeaderProps {
  userName: string;
  subtitle?: string;
  subtitles?: string[];
}

export interface UserProfileMenuProps {
  userName: string;
  userInitials: string;
  avatarUrl?: string;
  isManager?: boolean;
}

// Pit Scouting Types
export * from "./pitScouting";

export interface PitScoutingAssignment {
  id: string;
  event_id: string;
  team_number: number;
  scouter_id: string | null;
  created_at: string;
  updated_at: string;
}

// Picklist Types
export interface PicklistRow {
  id: string;
  user_id: string;
  event_id: string;
  picked_team_numbers: number[];
  do_not_pick_team_numbers: number[];
  created_at: string;
  updated_at: string;
}

export interface PicklistTeamNote {
  id: string;
  user_id: string;
  event_id: string;
  team_number: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

// Game Shop Types
export interface GameDefinition {
  id: string;
  name: string;
  description: string;
  cost: number;
  iframeUrl: string;
  thumbnailUrl: string;
}

export interface GameProfile {
  id: string;
  user_id: string;
  points: number;
  event_points: number; // separate currency, spent on event-exclusive cosmetics
  unlocked_games: string[];
  owned_cosmetics: string[];
  equipped_cosmetics: Record<string, string>; // slot -> cosmetic id
  event_cosmetic_sources: Record<string, string>; // cosmetic id -> event name it was purchased from
  created_at: string;
  updated_at: string;
}
