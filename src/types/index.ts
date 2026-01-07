// Scout/User Types
export interface Scout {
  id: number;
  name: string;
  initials: string;
  avatar: string;
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
