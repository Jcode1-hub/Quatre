import { pgTable, text, timestamp, uuid, jsonb, pgEnum, integer, boolean, primaryKey, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const conversationMode = pgEnum("conversation_mode", ["solo", "compare", "panel", "auto"]);
export const quatreNotificationType = pgEnum("quatre_notification_type", [
  "connection_request", "connection_accepted", "message_request", "new_message",
  "profile_interaction", "community", "system", "usage", "product", "security",
]);

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(), // Supabase Auth user id.
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  plan: text("plan").$type<"free" | "plus" | "max">().notNull().default("free"),
  username: text("username"),
  bio: text("bio").notNull().default(""),
  occupation: text("occupation"),
  region: text("region"),
  roles: jsonb("roles").$type<string[]>().notNull().default([]),
  interests: jsonb("interests").$type<string[]>().notNull().default([]),
  skills: jsonb("skills").$type<string[]>().notNull().default([]),
  usageInterests: jsonb("usage_interests").$type<string[]>().notNull().default([]),
  communityVisible: boolean("community_visible").notNull().default(false),
  contactPolicy: text("contact_policy").notNull().default("requests"),
  notifyCommunity: boolean("notify_community").notNull().default(true),
  notifyMessages: boolean("notify_messages").notNull().default(true),
  notifyProduct: boolean("notify_product").notNull().default(true),
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  avatarStoragePath: text("avatar_storage_path"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const profileBlocks = pgTable("profile_blocks", {
  blockerId: uuid("blocker_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  blockedId: uuid("blocked_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.blockerId, table.blockedId] })]);

export const profileMutes = pgTable("profile_mutes", {
  muterId: uuid("muter_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  mutedId: uuid("muted_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.muterId, table.mutedId] })]);

export const connections = pgTable("connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  requesterId: uuid("requester_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  recipientId: uuid("recipient_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("connections_pair_unique").on(table.requesterId, table.recipientId)]);

export const communityReports = pgTable("community_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  reporterId: uuid("reporter_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  reportedUserId: uuid("reported_user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  details: text("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const communityThreads = pgTable("community_threads", {
  id: uuid("id").primaryKey().defaultRandom(),
  requesterId: uuid("requester_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  recipientId: uuid("recipient_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("community_threads_pair_unique").on(table.requesterId, table.recipientId)]);

export const communityMessages = pgTable("community_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: uuid("thread_id").notNull().references(() => communityThreads.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipientId: uuid("recipient_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").references(() => profiles.id, { onDelete: "set null" }),
  type: quatreNotificationType("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  href: text("href"),
  sourceType: text("source_type"),
  sourceId: uuid("source_id"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("notifications_source_unique").on(table.recipientId, table.type, table.sourceType, table.sourceId).where(sql`${table.sourceId} is not null`),
]);

export const usageLimits = pgTable("usage_limits", {
  userId: uuid("user_id").primaryKey().references(() => profiles.id, { onDelete: "cascade" }),
  hourStartedAt: timestamp("hour_started_at", { withTimezone: true }).notNull().defaultNow(),
  hourlyRequests: integer("hourly_requests").notNull().default(0),
  minuteStartedAt: timestamp("minute_started_at", { withTimezone: true }).notNull().defaultNow(),
  minuteRequests: integer("minute_requests").notNull().default(0),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull(), // References auth.users(id) in Supabase migration.
  name: text("name").notNull().default("Personal workspace"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  mode: conversationMode("mode").notNull().default("auto"),
  modelConfig: jsonb("model_config").$type<{ modelIds: string[] }>().notNull().default({ modelIds: [] }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
  content: text("content").notNull(),
  provider: text("provider"),
  model: text("model"),
  coordination: jsonb("coordination").$type<{ mode: string; participantModels?: string[] }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
