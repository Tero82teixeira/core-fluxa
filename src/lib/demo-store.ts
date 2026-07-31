/**
 * Estado da sessão de demonstração (somente memória).
 * TODO(supabase): substituído pelas mutações reais quando DEMO_MODE = false.
 * Nada aqui é gravado em banco, localStorage, cookies ou sessionStorage.
 */
import { useSyncExternalStore } from "react";

import {
  DEMO_CHECKLIST,
  DEMO_CLIENTS,
  DEMO_MOVEMENTS,
  DEMO_NOTIFICATIONS,
  DEMO_PROCESSES,
  DEMO_TASKS,
  type ChecklistItem,
  type DemoClient,
  type DemoProcess,
  type DemoTask,
} from "@/lib/demo-data";
import { PROCESS_STAGE, type ProcessStage } from "@/lib/domain";
import type { MovementRow, NotificationRow } from "@/hooks/use-operations";

type DemoState = {
  clients: DemoClient[];
  processes: DemoProcess[];
  tasks: DemoTask[];
  movements: MovementRow[];
  notifications: NotificationRow[];
  checklist: ChecklistItem[];
};

let state: DemoState = {
  clients: DEMO_CLIENTS,
  processes: DEMO_PROCESSES,
  tasks: DEMO_TASKS,
  movements: DEMO_MOVEMENTS,
  notifications: DEMO_NOTIFICATIONS,
  checklist: DEMO_CHECKLIST,
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getSnapshot = () => state;

export function useDemoState(): DemoState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function completeDemoTask(taskId: string) {
  state = {
    ...state,
    tasks: state.tasks.map((task) => (task.id === taskId ? { ...task, status: "concluida" } : task)),
  };
  emit();
}

export function moveDemoProcess(processId: string, to: ProcessStage, actor = "Ronaldo Prado") {
  const process = state.processes.find((item) => item.id === processId);
  if (!process || process.stage === to) return;
  const nowIso = new Date().toISOString();
  state = {
    ...state,
    processes: state.processes.map((item) =>
      item.id === processId ? { ...item, stage: to, last_movement_at: nowIso } : item,
    ),
    movements: [
      {
        id: `demo-${processId}-${Date.now()}`,
        description: `Etapa alterada para ${PROCESS_STAGE[to].label}.`,
        actor_name: actor,
        created_at: nowIso,
        from_stage: process.stage,
        to_stage: to,
        process_id: processId,
        processes: { code: process.code, clients: { name: process.clients?.name ?? "" } },
      },
      ...state.movements,
    ],
  };
  emit();
}
