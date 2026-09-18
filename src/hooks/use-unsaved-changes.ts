import { useCallback, useEffect, useRef } from "react";
import { useBlocker } from "@tanstack/react-router";

const MESSAGE = "Você possui alterações não salvas. Deseja sair mesmo assim?";

export function useUnsavedChanges(isDirty: boolean) {
  const saved = useRef(false);

  useEffect(() => {
    if (!isDirty) saved.current = false;
  }, [isDirty]);

  useBlocker({
    shouldBlockFn: () => {
      if (!isDirty || saved.current) return false;
      return !window.confirm(MESSAGE);
    },
    enableBeforeUnload: isDirty && !saved.current,
  });

  return useCallback(() => {
    saved.current = true;
  }, []);
}
