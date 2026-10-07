export const roleOptions = [
  "Student", "Entrepreneur", "Business owner", "Marketer", "Developer", "Designer", "Musician", "Artist", "Researcher", "Creator", "Teacher", "Founder", "Professional", "Freelancer", "Investor", "Writer", "Other",
] as const;

export const useOptions = [
  "Work", "School", "Business", "Research", "Coding", "Writing", "Creative work", "Learning", "Planning", "Personal projects", "Career", "Community", "Other",
] as const;

export type QuatreProfile = {
  plan: "free" | "plus" | "max";
  displayName: string;
  username: string;
  bio: string;
  occupation: string;
  region: string;
  roles: string[];
  interests: string[];
  skills: string[];
  usageInterests: string[];
  communityVisible: boolean;
  contactPolicy: "requests" | "connections" | "nobody";
  notifyCommunity: boolean;
  notifyMessages: boolean;
  notifyProduct: boolean;
  avatarUrl: string | null;
  avatarStoragePath: string | null;
};

export const emptyProfile: QuatreProfile = {
  plan: "free",
  displayName: "", username: "", bio: "", occupation: "", region: "", roles: [], interests: [], skills: [], usageInterests: [],
  communityVisible: false, contactPolicy: "requests", notifyCommunity: true, notifyMessages: true, notifyProduct: true,
  avatarUrl: null, avatarStoragePath: null,
};

export function profileFromRow(row: Record<string, unknown>): QuatreProfile {
  const string = (key: string) => typeof row[key] === "string" ? row[key] as string : "";
  const list = (key: string) => Array.isArray(row[key]) ? (row[key] as unknown[]).filter((item): item is string => typeof item === "string") : [];
  const policy = row.contact_policy;
  const plan = row.plan;
  return {
    plan: plan === "plus" || plan === "max" ? plan : "free",
    displayName: string("display_name"), username: string("username"), bio: string("bio"), occupation: string("occupation"), region: string("region"),
    roles: list("roles"), interests: list("interests"), skills: list("skills"), usageInterests: list("usage_interests"),
    communityVisible: row.community_visible === true, contactPolicy: policy === "connections" || policy === "nobody" ? policy : "requests",
    notifyCommunity: row.notify_community !== false, notifyMessages: row.notify_messages !== false, notifyProduct: row.notify_product !== false,
    avatarUrl: typeof row.avatar_url === "string" ? row.avatar_url : null,
    avatarStoragePath: typeof row.avatar_storage_path === "string" ? row.avatar_storage_path : null,
  };
}

export function profileToRow(profile: QuatreProfile) {
  return {
    display_name: profile.displayName.trim().slice(0, 80) || null,
    username: profile.username.trim().replace(/^@/, "").slice(0, 24).toLowerCase() || null,
    bio: profile.bio.trim().slice(0, 240),
    occupation: profile.occupation.trim().slice(0, 80) || null,
    region: profile.region.trim().slice(0, 80) || null,
    roles: profile.roles.slice(0, 8), interests: profile.interests.slice(0, 12), skills: profile.skills.slice(0, 20),
    usage_interests: profile.usageInterests.slice(0, 12), community_visible: profile.communityVisible,
    contact_policy: profile.contactPolicy, avatar_url: profile.avatarStoragePath ? null : profile.avatarUrl, avatar_storage_path: profile.avatarStoragePath,
    notify_community: profile.notifyCommunity, notify_messages: profile.notifyMessages, notify_product: profile.notifyProduct,
    onboarding_completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
}
