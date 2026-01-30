import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Flattens an object (except arrays) into a single-level object with hyphen-joined keys.
 * Arrays are left as-is. Useful for preparing a record for Supabase.
 * Example: { a: { b: 1 }, c: [2,3] } => { 'a-b': 1, c: [2,3] }
 */
export function flattenForSupabase(obj: any, prefix = ""): Record<string, any> {
  let result: Record<string, any> = {};
  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    const value = obj[key];
    const newKey = prefix ? `${prefix}-${key}` : key;
    if (Array.isArray(value)) {
      result[newKey] = value;
    } else if (value !== null && typeof value === "object") {
      Object.assign(result, flattenForSupabase(value, newKey));
    } else {
      result[newKey] = value;
    }
  }
  return result;
}
