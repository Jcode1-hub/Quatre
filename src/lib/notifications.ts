export type NotificationKind =
  | "connection_request" | "connection_accepted" | "message_request" | "new_message"
  | "profile_interaction" | "community" | "system" | "usage" | "product" | "security";

export type QuatreNotification = {
  id: string;
  actor_id: string | null;
  type: NotificationKind;
  title: string;
  body: string;
  href: string | null;
  source_id: string | null;
  read_at: string | null;
  created_at: string;
};

export type NotificationGroup = { label: "Today" | "Yesterday" | "Earlier"; items: QuatreNotification[] };

export function groupNotifications(items: QuatreNotification[], now = new Date()): NotificationGroup[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toDateString();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toDateString();
  const groups: Record<NotificationGroup["label"], QuatreNotification[]> = { Today: [], Yesterday: [], Earlier: [] };
  for (const item of items) {
    const date = new Date(item.created_at);
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toDateString();
    groups[day === today ? "Today" : day === yesterday ? "Yesterday" : "Earlier"].push(item);
  }
  return (["Today", "Yesterday", "Earlier"] as const).filter((label) => groups[label].length > 0).map((label) => ({ label, items: groups[label] }));
}

export function notificationCategory(type: NotificationKind): "Community" | "Messages" | "Quatre" {
  if (type === "connection_request" || type === "connection_accepted" || type === "profile_interaction" || type === "community") return "Community";
  if (type === "message_request" || type === "new_message") return "Messages";
  return "Quatre";
}
