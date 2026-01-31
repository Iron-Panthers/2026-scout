/**
 * Scouting Data Schema Versioning
 *
 * This module handles versioning of the scouting data JSON schema.
 * When the structure of scouting data changes, increment CURRENT_SCHEMA_VERSION
 * and add a migration function to handle old data formats.
 */

import { supabase } from './supabase';

/**
 * Current schema version - increment when scouting data structure changes
 */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Schema version metadata
 */
export interface SchemaVersion {
  version: number;
  description: string;
  implemented_at: string;
  schema_definition?: Record<string, any>;
  migration_notes?: string;
}

/**
 * Scouting submission record
 */
export interface ScoutingSubmission {
  id: string;
  match_id: string;
  role: string;
  scouting_data: Record<string, any>;
  schema_version: number;
  time: string;
  scouter_id?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Fetch all schema versions from the database
 */
export async function getSchemaVersions(): Promise<SchemaVersion[]> {
  const { data, error } = await supabase
    .from('scouting_schema_versions')
    .select('*')
    .order('version', { ascending: false });

  if (error) {
    console.error('Error fetching schema versions:', error);
    return [];
  }

  return data || [];
}

/**
 * Get a specific schema version
 */
export async function getSchemaVersion(version: number): Promise<SchemaVersion | null> {
  const { data, error } = await supabase
    .from('scouting_schema_versions')
    .select('*')
    .eq('version', version)
    .single();

  if (error) {
    console.error(`Error fetching schema version ${version}:`, error);
    return null;
  }

  return data;
}

/**
 * Migrate scouting data from an old schema version to the current version
 * Add migration logic here as schema evolves
 */
export function migrateScoutingData(
  data: Record<string, any>,
  fromVersion: number,
  toVersion: number = CURRENT_SCHEMA_VERSION
): Record<string, any> {
  let migratedData = { ...data };

  // Migration chain - apply migrations sequentially
  for (let version = fromVersion; version < toVersion; version++) {
    migratedData = applyMigration(migratedData, version, version + 1);
  }

  return migratedData;
}

/**
 * Apply a specific migration step
 */
function applyMigration(
  data: Record<string, any>,
  fromVersion: number,
  toVersion: number
): Record<string, any> {
  console.log(`Migrating scouting data from v${fromVersion} to v${toVersion}`);

  // Add migration cases as schema evolves
  switch (toVersion) {
    case 1:
      // No migration needed for initial version
      return data;

    // Future migrations go here:
    // case 2:
    //   return migrateV1ToV2(data);
    // case 3:
    //   return migrateV2ToV3(data);

    default:
      console.warn(`No migration defined for v${fromVersion} to v${toVersion}`);
      return data;
  }
}

/**
 * Resolve event_code to event_id
 */
export async function resolveEventId(event_code: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('events')
    .select('id')
    .eq('event_code', event_code)
    .single();

  if (error) {
    console.error('Error resolving event_id from event_code:', error);
    return null;
  }

  return data?.id || null;
}

/**
 * Resolve matchId from event_code, match_number, and role
 * This is useful when matchId is not available but we have event and match info
 */
export async function resolveMatchId(
  event_code: string,
  match_number: number,
  role: string
): Promise<string | null> {
  // First resolve event_code to event_id
  const event_id = await resolveEventId(event_code);

  if (!event_id) {
    console.error('Could not resolve event_code to event_id:', event_code);
    return null;
  }

  // Query the matches table to find the match with the given event and match number
  const { data, error } = await supabase
    .from('matches')
    .select('id')
    .eq('event_id', event_id)
    .eq('match_number', match_number)
    .single();

  if (error) {
    console.error('Error resolving matchId:', error);
    return null;
  }

  return data?.id || null;
}

/**
 * Submit scouting data with current schema version
 */
export async function submitScoutingData(
  matchId: string,
  role: string,
  scoutingData: Record<string, any>,
  scouterId?: string
) {
  const { data, error } = await supabase
    .from('scouting_submissions')
    .insert({
      match_id: matchId,
      role: role,
      scouting_data: scoutingData,
      schema_version: CURRENT_SCHEMA_VERSION,
      scouter_id: scouterId,
    })
    .select()
    .single();

  if (error) {
    console.error('Error submitting scouting data:', error);
    throw error;
  }

  return data as ScoutingSubmission;
}

/**
 * Get scouting submissions for a match, with automatic migration
 */
export async function getMatchSubmissions(
  matchId: string,
  autoMigrate: boolean = true
): Promise<ScoutingSubmission[]> {
  const { data, error } = await supabase
    .from('scouting_submissions')
    .select('*')
    .eq('match_id', matchId)
    .order('time', { ascending: false });

  if (error) {
    console.error('Error fetching match submissions:', error);
    throw error;
  }

  if (!data) return [];

  // Optionally migrate old data to current schema
  if (autoMigrate) {
    return data.map((submission) => {
      if (submission.schema_version < CURRENT_SCHEMA_VERSION) {
        return {
          ...submission,
          scouting_data: migrateScoutingData(
            submission.scouting_data,
            submission.schema_version,
            CURRENT_SCHEMA_VERSION
          ),
          schema_version: CURRENT_SCHEMA_VERSION,
        };
      }
      return submission;
    });
  }

  return data;
}

/**
 * Get all submissions by a specific scout
 */
export async function getScouterSubmissions(
  scouterId: string,
  autoMigrate: boolean = true
): Promise<ScoutingSubmission[]> {
  const { data, error } = await supabase
    .from('scouting_submissions')
    .select('*')
    .eq('scouter_id', scouterId)
    .order('time', { ascending: false });

  if (error) {
    console.error('Error fetching scouter submissions:', error);
    throw error;
  }

  if (!data) return [];

  if (autoMigrate) {
    return data.map((submission) => {
      if (submission.schema_version < CURRENT_SCHEMA_VERSION) {
        return {
          ...submission,
          scouting_data: migrateScoutingData(
            submission.scouting_data,
            submission.schema_version,
            CURRENT_SCHEMA_VERSION
          ),
          schema_version: CURRENT_SCHEMA_VERSION,
        };
      }
      return submission;
    });
  }

  return data;
}

/**
 * Update a submission (managers only)
 */
export async function updateScoutingSubmission(
  submissionId: string,
  updates: Partial<Pick<ScoutingSubmission, 'scouting_data' | 'role'>>
) {
  const { data, error } = await supabase
    .from('scouting_submissions')
    .update(updates)
    .eq('id', submissionId)
    .select()
    .single();

  if (error) {
    console.error('Error updating submission:', error);
    throw error;
  }

  return data as ScoutingSubmission;
}

/**
 * Delete a submission (managers only)
 */
export async function deleteScoutingSubmission(submissionId: string) {
  const { error } = await supabase
    .from('scouting_submissions')
    .delete()
    .eq('id', submissionId);

  if (error) {
    console.error('Error deleting submission:', error);
    throw error;
  }
}
