import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * A piece of page state (e.g. the open tab) kept in the page's address as `?key=value`,
 * so reloading — or sharing the link — comes back to the same place. Unknown values fall
 * back to `fallback`, which is left out of the address. Changes replace the current history
 * entry, so switching tabs doesn't fill up the Back button.
 */
export function useUrlState<T extends string>(key: string, fallback: T, allowed: readonly T[]): [T, (value: T) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(key);
  const value = raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;

  const setValue = useCallback(
    (next: T) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current);
          if (next === fallback) params.delete(key);
          else params.set(key, next);
          return params;
        },
        { replace: true }
      );
    },
    [key, fallback, setSearchParams]
  );

  return [value, setValue];
}
