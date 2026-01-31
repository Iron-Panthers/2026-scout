/**
 * Offline Storage Service
 *
 * Manages local storage of scouting data for offline capability.
 * Provides failsafe storage when internet is unavailable.
 */

import { CURRENT_SCHEMA_VERSION } from './scoutingSchema';

const STORAGE_KEY = 'offline_matches';
const STORAGE_VERSION = 1;

/**
 * Offline match data structure
 */
export interface OfflineMatchData {
  // Identifiers
  matchId?: string;          // From database (if available)
  eventCode: string;         // Event code
  eventId?: string;          // Event ID from database
  matchNumber: number;       // Match number
  role: string;              // Scout role (red1, blue1, etc.)

  // Metadata
  timestamp: number;         // When saved to local storage (ms)
  uploaded: boolean;         // Whether uploaded to database
  uploadedAt?: number;       // When uploaded (ms)
  schemaVersion: number;     // Schema version for migration compatibility

  // Data
  scoutingData: any;         // Full scouting data JSON
  scouterId?: string;        // Who scouted it
}

/**
 * Storage container structure
 */
export interface OfflineMatchStorage {
  version: number;
  matches: Record<string, OfflineMatchData>;
}

/**
 * Generate unique key for offline match
 * Format: eventCode_matchNumber_role_timestamp
 */
export function generateOfflineKey(
  eventCode: string,
  matchNumber: number,
  role: string,
  timestamp: number = Date.now()
): string {
  return `${eventCode}_${matchNumber}_${role}_${timestamp}`;
}

/**
 * Check if localStorage is available
 */
function isLocalStorageAvailable(): boolean {
  try {
    const test = '__storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all offline matches from localStorage
 */
export function getOfflineMatches(): Record<string, OfflineMatchData> {
  if (!isLocalStorageAvailable()) {
    console.warn('localStorage is not available');
    return {};
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return {};
    }

    const parsed: OfflineMatchStorage = JSON.parse(stored);

    // Validate structure
    if (!parsed.matches || typeof parsed.matches !== 'object') {
      console.warn('Invalid offline storage structure, resetting');
      return {};
    }

    return parsed.matches;
  } catch (error) {
    console.error('Error reading offline matches:', error);
    // Return empty on corrupted data
    return {};
  }
}

/**
 * Save offline matches to localStorage
 */
function saveOfflineMatches(matches: Record<string, OfflineMatchData>): boolean {
  if (!isLocalStorageAvailable()) {
    console.warn('localStorage is not available');
    return false;
  }

  try {
    const storage: OfflineMatchStorage = {
      version: STORAGE_VERSION,
      matches,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
    return true;
  } catch (error) {
    // Handle quota exceeded or other errors
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      console.error('localStorage quota exceeded');
      // Attempt cleanup of old uploaded matches
      const cleaned = cleanupUploadedMatches(matches, 7); // Keep only last 7 days
      try {
        const storage: OfflineMatchStorage = {
          version: STORAGE_VERSION,
          matches: cleaned,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
        console.log('Cleaned up old matches and retried save');
        return true;
      } catch (retryError) {
        console.error('Failed to save even after cleanup:', retryError);
        return false;
      }
    }
    console.error('Error saving offline matches:', error);
    return false;
  }
}

/**
 * Save a match to offline storage
 * @returns The key used to store the match, or null if failed
 */
export function saveOfflineMatch(
  eventCode: string,
  matchNumber: number,
  role: string,
  scoutingData: any,
  options: {
    matchId?: string;
    eventId?: string;
    scouterId?: string;
  } = {}
): string | null {
  const timestamp = Date.now();
  const key = generateOfflineKey(eventCode, matchNumber, role, timestamp);

  const matchData: OfflineMatchData = {
    eventCode,
    matchNumber,
    role,
    timestamp,
    uploaded: false,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    scoutingData,
    ...options,
  };

  const matches = getOfflineMatches();
  matches[key] = matchData;

  const success = saveOfflineMatches(matches);
  return success ? key : null;
}

/**
 * Get a specific offline match by key
 */
export function getOfflineMatch(key: string): OfflineMatchData | null {
  const matches = getOfflineMatches();
  return matches[key] || null;
}

/**
 * Mark an offline match as uploaded
 */
export function markAsUploaded(key: string): boolean {
  const matches = getOfflineMatches();

  if (!matches[key]) {
    console.warn(`Offline match ${key} not found`);
    return false;
  }

  matches[key].uploaded = true;
  matches[key].uploadedAt = Date.now();

  return saveOfflineMatches(matches);
}

/**
 * Delete an offline match
 */
export function deleteOfflineMatch(key: string): boolean {
  const matches = getOfflineMatches();

  if (!matches[key]) {
    console.warn(`Offline match ${key} not found`);
    return false;
  }

  delete matches[key];
  return saveOfflineMatches(matches);
}

/**
 * Clean up uploaded matches older than specified days
 */
function cleanupUploadedMatches(
  matches: Record<string, OfflineMatchData>,
  daysToKeep: number = 7
): Record<string, OfflineMatchData> {
  const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
  const cleaned: Record<string, OfflineMatchData> = {};

  Object.entries(matches).forEach(([key, match]) => {
    // Keep if not uploaded OR uploaded recently
    if (!match.uploaded || (match.uploadedAt && match.uploadedAt > cutoffTime)) {
      cleaned[key] = match;
    }
  });

  return cleaned;
}

/**
 * Manually clear all uploaded matches
 */
export function clearUploadedMatches(): boolean {
  const matches = getOfflineMatches();
  const cleaned = cleanupUploadedMatches(matches, 0); // Remove all uploaded
  return saveOfflineMatches(cleaned);
}

/**
 * Get count of pending (non-uploaded) matches
 */
export function getPendingMatchCount(): number {
  const matches = getOfflineMatches();
  return Object.values(matches).filter(m => !m.uploaded).length;
}

/**
 * Get count of uploaded matches
 */
export function getUploadedMatchCount(): number {
  const matches = getOfflineMatches();
  return Object.values(matches).filter(m => m.uploaded).length;
}

/**
 * Get storage size estimate in bytes
 */
export function getStorageSizeEstimate(): number {
  if (!isLocalStorageAvailable()) {
    return 0;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? new Blob([stored]).size : 0;
  } catch {
    return 0;
  }
}

/**
 * Check if approaching localStorage quota (rough estimate)
 * Returns true if storage is over 80% of typical 5MB limit
 */
export function isApproachingQuota(): boolean {
  const size = getStorageSizeEstimate();
  const estimatedLimit = 5 * 1024 * 1024; // 5MB typical limit
  return size > (estimatedLimit * 0.8);
}
