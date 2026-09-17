import { useEffect, useRef } from "react";

const FILTER_MEMORY_PREFIX = "fluxa:filters:";

function storageKey(scope: string) {
  return `${FILTER_MEMORY_PREFIX}${scope}`;
}

export function clearRememberedFilters(scope: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(storageKey(scope));
}

export function useFilterMemory<T extends Record<string, unknown>>(
  scope: string,
  value: T,
  restore: (remembered: Partial<T>) => void,
) {
  const restored = useRef(false);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;

  useEffect(() => {
    restored.current = false;
    try {
      const raw = window.sessionStorage.getItem(storageKey(scope));
      if (raw) restoreRef.current(JSON.parse(raw) as Partial<T>);
    } catch {
      window.sessionStorage.removeItem(storageKey(scope));
    }

    queueMicrotask(() => {
      restored.current = true;
    });
  }, [scope]);

  useEffect(() => {
    if (!restored.current) return;
    try {
      window.sessionStorage.setItem(storageKey(scope), JSON.stringify(value));
    } catch {
      // A navegação continua funcionando mesmo quando o armazenamento está indisponível.
    }
  }, [scope, value]);
}
