import type {
  CommunicationChannel,
  CommunicationPriority,
  CommunicationStatus,
} from "@/lib/communication";

export type CommunicationFilterPreset = {
  search: string;
  status: CommunicationStatus | "all";
  priority: CommunicationPriority | "all";
  channel: CommunicationChannel | "all";
  client: string;
  assignee: string;
  followUp: "all" | "today" | "overdue" | "future";
};

export type SavedCommunicationFilter = {
  id: string;
  name: string;
  filters: CommunicationFilterPreset;
};

const MAX_SAVED_FILTERS = 8;

export function communicationFilterStorageKey(organizationId: string) {
  return `fluxa:communication-filters:${organizationId}`;
}

export function readSavedCommunicationFilters(
  storage: Pick<Storage, "getItem">,
  organizationId: string,
): SavedCommunicationFilter[] {
  try {
    const parsed = JSON.parse(
      storage.getItem(communicationFilterStorageKey(organizationId)) ?? "[]",
    );
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is SavedCommunicationFilter =>
        Boolean(
          item &&
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          item.filters &&
          typeof item.filters === "object",
        ),
      )
      .slice(0, MAX_SAVED_FILTERS);
  } catch {
    return [];
  }
}

export function writeSavedCommunicationFilters(
  storage: Pick<Storage, "setItem">,
  organizationId: string,
  filters: SavedCommunicationFilter[],
) {
  storage.setItem(
    communicationFilterStorageKey(organizationId),
    JSON.stringify(filters.slice(0, MAX_SAVED_FILTERS)),
  );
}

export function addSavedCommunicationFilter(
  current: SavedCommunicationFilter[],
  name: string,
  filters: CommunicationFilterPreset,
): SavedCommunicationFilter[] {
  const normalizedName = name.trim().slice(0, 40);
  if (!normalizedName) return current;
  const withoutSameName = current.filter(
    (item) => item.name.toLocaleLowerCase("pt-BR") !== normalizedName.toLocaleLowerCase("pt-BR"),
  );
  return [
    {
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      name: normalizedName,
      filters,
    },
    ...withoutSameName,
  ].slice(0, MAX_SAVED_FILTERS);
}
