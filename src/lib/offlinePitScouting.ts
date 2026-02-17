/**
 * Offline Pit Scouting Storage Service
 *
 * Manages local storage of pit scouting data for offline capability.
 * Provides failsafe storage when internet is unavailable.
 */

import { PIT_SCHEMA_VERSION } from "./pitScouting";
import type { OfflinePitScoutingData, PitScoutingFormData } from "@/types/pitScouting";

const STORAGE_KEY = "offline_pit_scouting";
const STORAGE_VERSION = 1;

/**
 * Storage container structure
 */
export interface OfflinePitScoutingStorage {
  version: number;
  entries: Record<string, OfflinePitScoutingData>;
}

/**
 * Generate unique key for offline pit scouting entry
 * Format: eventCode_teamNumber_scouterName
 */
export function generateOfflinePitKey(
  eventCode: string,
  teamNumber: number,
  scouterName: string
): string {
  // Sanitize scouter name for storage key
  const sanitizedName = scouterName.replace(/[^a-zA-Z0-9]/g, "_");
  return `${eventCode}_${teamNumber}_${sanitizedName}`;
}

/**
 * Check if localStorage is available
 */
function isLocalStorageAvailable(): boolean {
  try {
    const test = "__storage_test__";
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all offline pit scouting entries from localStorage
 */
export function getOfflinePitEntries(): Record<string, OfflinePitScoutingData> {
  if (!isLocalStorageAvailable()) {
    console.warn("localStorage is not available");
    return {};
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return {};
    }

    const storage: OfflinePitScoutingStorage = JSON.parse(stored);
    return storage.entries || {};
  } catch (error) {
    console.error("Failed to parse offline pit scouting storage:", error);
    return {};
  }
}

/**
 * Save offline pit scouting data to localStorage
 * @param teamNumber - Team number
 * @param scouterName - Scouter's name
 * @param eventCode - Event code
 * @param formData - Form data object
 * @param options - Optional metadata
 * @returns Storage key for the saved entry
 */
export function saveOfflinePit(
  teamNumber: number,
  scouterName: string,
  eventCode: string,
  formData: PitScoutingFormData,
  options?: {
    eventId?: string;
    photoDataUrl?: string;
  }
): string | null {
  if (!isLocalStorageAvailable()) {
    console.warn("localStorage is not available");
    return null;
  }

  try {
    const key = generateOfflinePitKey(eventCode, teamNumber, scouterName);
    const entries = getOfflinePitEntries();

    const entry: OfflinePitScoutingData = {
      teamNumber,
      scouterName,
      eventCode,
      eventId: options?.eventId,
      formData,
      photoDataUrl: options?.photoDataUrl,
      timestamp: Date.now(),
      uploaded: false,
      schemaVersion: PIT_SCHEMA_VERSION,
    };

    entries[key] = entry;

    const storage: OfflinePitScoutingStorage = {
      version: STORAGE_VERSION,
      entries,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
    console.log(`Offline pit scouting saved: ${key}`);
    return key;
  } catch (error) {
    console.error("Failed to save offline pit scouting:", error);

    // Check if quota exceeded
    if (error instanceof Error && error.name === "QuotaExceededError") {
      console.error("localStorage quota exceeded - cannot save offline pit scouting");
      throw new Error(
        "Storage quota exceeded. Please upload or clear some offline data."
      );
    }

    return null;
  }
}

/**
 * Mark offline pit scouting as uploaded
 * @param key - Storage key
 */
export function markPitAsUploaded(key: string): void {
  if (!isLocalStorageAvailable()) {
    return;
  }

  try {
    const entries = getOfflinePitEntries();

    if (entries[key]) {
      entries[key].uploaded = true;
      entries[key].uploadedAt = Date.now();

      const storage: OfflinePitScoutingStorage = {
        version: STORAGE_VERSION,
        entries,
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
      console.log(`Offline pit scouting marked as uploaded: ${key}`);
    }
  } catch (error) {
    console.error("Failed to mark pit scouting as uploaded:", error);
  }
}

/**
 * Delete offline pit scouting entry
 * @param key - Storage key
 */
export function deleteOfflinePit(key: string): void {
  if (!isLocalStorageAvailable()) {
    return;
  }

  try {
    const entries = getOfflinePitEntries();
    delete entries[key];

    const storage: OfflinePitScoutingStorage = {
      version: STORAGE_VERSION,
      entries,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
    console.log(`Offline pit scouting deleted: ${key}`);
  } catch (error) {
    console.error("Failed to delete offline pit scouting:", error);
  }
}

/**
 * Get count of pending (not uploaded) pit scouting entries
 */
export function getPendingPitCount(): number {
  const entries = getOfflinePitEntries();
  return Object.values(entries).filter((entry) => !entry.uploaded).length;
}

/**
 * Clear all offline pit scouting data
 */
export function clearOfflinePitData(): void {
  if (!isLocalStorageAvailable()) {
    return;
  }

  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log("All offline pit scouting data cleared");
  } catch (error) {
    console.error("Failed to clear offline pit scouting data:", error);
  }
}
