export interface PitScoutingSubmission {
  id: string;
  team_num: number;
  event_id: string;
  scouter_id?: string;
  scouter_name: string;
  pit_data: Record<string, any>;
  photo_url: string | null;
  schema_version: number;
  created_at: string;
  updated_at: string;
}

export interface PitScoutingFormData {
  weight?: string;
  dimensions?: string;
  drivetrain?: string;
  event_code?: string;
  "hopper-space"?: string;
  /** Only for modular robots, whose "hopper-space" is when lowered. */
  "hopper-space-raised"?: string;
  "shooting-intake-speed"?: string;
  "shooting-method"?: string[];
  "climb-levels"?: string[];
  "outpost-interaction"?: string;
  "terrain-capability"?: string | string[]; // string[] on submissions from before it became single-select
  "driver-competitions"?: string;
  "additional-notes"?: string;
}
