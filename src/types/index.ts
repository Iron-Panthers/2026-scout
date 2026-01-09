// Scout/User Types
export interface Scout {
  id: string; // Changed from number to string (UUID from database)
  name: string;
  initials: string;
  avatar: string;
}

// Profile Type (from Supabase)
export interface Profile {
  id: string;
  name: string | null;
  role: "scout" | "manager" | "admin";
  is_manager: boolean;
  created_at: string;
  updated_at: string;
}

// Event Type
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
}

export interface SelectedCell {
  matchNumber: number;
  role: Role;
}

// Component Props Types
export interface DashboardHeaderProps {
  userName: string;
  subtitle?: string;
}

export interface UserProfileMenuProps {
  userName: string;
  userInitials: string;
  avatarUrl?: string;
  isManager?: boolean;
}
