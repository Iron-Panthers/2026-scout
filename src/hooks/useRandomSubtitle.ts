import { useMemo, type DependencyList } from "react";

export function useRandomSubtitle(pool: string[], deps: DependencyList = []): string {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => pool[Math.floor(Math.random() * pool.length)], deps);
}
