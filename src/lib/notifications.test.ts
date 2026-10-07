import { describe, expect, it } from "vitest";
import { groupNotifications, notificationCategory, type QuatreNotification } from "./notifications";

const sample = (id: string, createdAt: string, type: QuatreNotification["type"] = "new_message"): QuatreNotification => ({
  id, actor_id: null, type, title: "New message", body: "Someone sent you a message.", href: "/community", source_id: null, read_at: null, created_at: createdAt,
});

describe("notification presentation", () => {
  it("groups notifications by local day without reordering the incoming list", () => {
    const now = new Date("2026-10-07T12:00:00");
    const groups = groupNotifications([
      sample("today", "2026-10-07T08:00:00"),
      sample("yesterday", "2026-10-06T23:00:00"),
      sample("earlier", "2026-10-04T08:00:00"),
    ], now);

    expect(groups.map((group) => group.label)).toEqual(["Today", "Yesterday", "Earlier"]);
    expect(groups.map((group) => group.items[0].id)).toEqual(["today", "yesterday", "earlier"]);
  });

  it("keeps community and message categories understandable", () => {
    expect(notificationCategory("connection_request")).toBe("Community");
    expect(notificationCategory("message_request")).toBe("Messages");
    expect(notificationCategory("product")).toBe("Quatre");
  });
});
