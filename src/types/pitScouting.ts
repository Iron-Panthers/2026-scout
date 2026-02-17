export interface PitScoutingSubmission {
  id: string;
  team_num: number;
  event_id: string;
  scouter_id?: string;
  scouter_name: string;
  pit_data: Record<string, any>;
  photo_urls: string[];
  schema_version: number;
  created_at: string;
  updated_at: string;
}

export interface PitScoutingFormData {
  weight?: string;
  dimensions?: string;
  drivetrain?: string;
  "hopper-space"?: string;
  "shooting-intake-speed"?: string;
  "climb-levels"?: string[];
  "outpost-interaction"?: string;
  "terrain-capability"?: string[];
  "driver-competitions"?: string;
  "additional-notes"?: string;
}

export interface OfflinePitScoutingData {
  teamNumber: number;
  scouterName: string;
  eventCode: string;
  eventId?: string;
  formData: PitScoutingFormData;
  photoDataUrl?: string;
  timestamp: number;
  uploaded: boolean;
  uploadedAt?: number;
  schemaVersion: number;
}
