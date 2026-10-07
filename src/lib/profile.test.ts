import { describe, expect, it } from "vitest";
import { emptyProfile, profileFromRow, profileToRow } from "./profile";

describe("profile serialization", () => {
  it("normalizes incomplete database rows to safe private defaults", () => {
    const profile = profileFromRow({ display_name: "Judah", roles: ["Student", 4], community_visible: false });

    expect(profile.displayName).toBe("Judah");
    expect(profile.roles).toEqual(["Student"]);
    expect(profile.contactPolicy).toBe("requests");
    expect(profile.communityVisible).toBe(false);
    expect(profile.avatarStoragePath).toBeNull();
  });

  it("bounds and normalizes user-editable fields before persistence", () => {
    const row = profileToRow({
      ...emptyProfile,
      username: "@Study_Buddy",
      displayName: "  Quatre member  ",
      bio: "b".repeat(300),
      skills: Array.from({ length: 30 }, (_, index) => `Skill ${index}`),
      communityVisible: true,
      contactPolicy: "connections",
      notifyCommunity: false,
      notifyMessages: true,
      notifyProduct: false,
    });

    expect(row.username).toBe("study_buddy");
    expect(row.display_name).toBe("Quatre member");
    expect(row.bio).toHaveLength(240);
    expect(row.skills).toHaveLength(20);
    expect(row.community_visible).toBe(true);
    expect(row.contact_policy).toBe("connections");
    expect(row.notify_community).toBe(false);
    expect(row.notify_messages).toBe(true);
    expect(row.notify_product).toBe(false);
    expect(row.onboarding_completed_at).toEqual(expect.any(String));
  });
});
