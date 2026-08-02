export const NOTIFICATION_KINDS = ["task", "process", "document", "monitoring", "team", "system"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type Notification = {
  id: string; organization_id: string; user_id: string; kind: string; title: string;
  body: string | null; entity_type: string | null; entity_id: string | null;
  action_url: string | null; read_at: string | null; archived_at: string | null; created_at: string;
};

export function isSafeNotificationUrl(value: string | null | undefined): value is string {
  return Boolean(value && /^\/(?!\/)/.test(value) && !value.includes("\\") && !Array.from(value).some((char) => char.charCodeAt(0) < 32));
}

export function unreadCount(rows: readonly Notification[]): number {
  return rows.filter((row) => !row.read_at && !row.archived_at).length;
}

export function filterNotifications(rows: readonly Notification[], filter: string): Notification[] {
  const visible = rows.filter((row) => !row.archived_at);
  if (filter === "unread") return visible.filter((row) => !row.read_at);
  if (filter === "all") return [...visible];
  return visible.filter((row) => row.kind === filter);
}

export function newestFirst(rows: readonly Notification[]): Notification[] {
  return [...rows].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}
