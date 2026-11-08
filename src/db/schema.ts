import {
  pgTable, pgEnum, text, timestamp, boolean, integer, jsonb, uuid, primaryKey, uniqueIndex, index, date,
} from "drizzle-orm/pg-core";

/* ───────────── Enums ───────────── */

export const roleEnum = pgEnum("role", ["admin", "leader", "volunteer"]);
export const userStatusEnum = pgEnum("user_status", ["active", "deactivated"]);

export const taskStatusEnum = pgEnum("task_status", [
  "not_started", "in_progress", "submitted", "under_review", "revision_requested", "approved",
  "canceled", "excused", "blocked",
]);
export const priorityEnum = pgEnum("priority", ["low", "medium", "high", "urgent"]);
export const reviewDecisionEnum = pgEnum("review_decision", ["approved", "revision_requested"]);
export const extensionStatusEnum = pgEnum("extension_status", ["pending", "approved", "declined", "withdrawn"]);
export const recurrenceEnum = pgEnum("recurrence", ["weekly", "biweekly", "monthly", "custom"]);
export const projectStatusEnum = pgEnum("project_status", ["planning", "active", "on_hold", "completed", "archived"]);
export const eventTypeEnum = pgEnum("event_type", ["meeting", "community", "fundraising", "volunteer", "milestone", "other"]);
export const visibilityEnum = pgEnum("visibility", ["everyone", "leadership", "admin"]);
export const accountabilityTypeEnum = pgEnum("accountability_type", ["coaching_note", "documented_warning", "improvement_plan", "follow_up"]);
export const accountabilityStatusEnum = pgEnum("accountability_status", ["open", "in_progress", "resolved"]);

/* ───────────── Org & people ───────────── */

export const departments = pgTable("departments", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""),
  color: text("color").notNull().default("#004F81"),
  leadId: uuid("lead_id"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(), // stored lowercase
  name: text("name").notNull(),
  title: text("title").notNull().default(""),
  role: roleEnum("role").notNull().default("volunteer"),
  status: userStatusEnum("status").notNull().default("active"),
  departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
  passwordHash: text("password_hash"),
  avatarFileId: uuid("avatar_file_id"),
  responsibilities: text("responsibilities").notNull().default(""),
  showEmail: boolean("show_email").notNull().default(true),
  timezone: text("timezone").notNull().default("America/New_York"),
  notificationPrefs: jsonb("notification_prefs").$type<NotificationPrefs>().notNull().default({}),
  calendarToken: text("calendar_token"),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  /** "MM-DD" only — no year. */
  birthday: text("birthday"),
  birthdayPostedYear: integer("birthday_posted_year"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type NotificationPrefs = {
  /** in-app nonessential toggles */
  announcements?: boolean;
  deadlineReminders?: boolean;
  /** email toggles (only used when org email is enabled) */
  emailAssignments?: boolean;
  emailReminders?: boolean;
  emailAnnouncements?: boolean;
  emailReviews?: boolean;
};

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256 of the cookie token
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  userAgent: text("user_agent").notNull().default(""),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  title: text("title").notNull().default(""),
  role: roleEnum("role").notNull(),
  departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
  tokenHash: text("token_hash").notNull().unique(),
  invitedById: uuid("invited_by_id").references(() => users.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const passwordResets = pgTable("password_resets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdById: uuid("created_by_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Rate-limit buckets (login attempts, resets, uploads). */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
});

/* ───────────── Files ───────────── */

export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  storageKey: text("storage_key").notNull().unique(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  uploadedById: uuid("uploaded_by_id").references(() => users.id, { onDelete: "set null" }),
  /** What this file belongs to; access is derived from the owner record. */
  ownerType: text("owner_type").notNull(), // task | submission | announcement | resource | avatar | project | branding
  ownerId: uuid("owner_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("files_owner_idx").on(t.ownerType, t.ownerId)]);

/* ───────────── Projects ───────────── */

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  directorId: uuid("director_id").references(() => users.id, { onDelete: "set null" }),
  departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
  status: projectStatusEnum("status").notNull().default("planning"),
  startDate: date("start_date"),
  targetDate: date("target_date"),
  links: jsonb("links").$type<LinkItem[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const milestones = pgTable("milestones", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  dueDate: date("due_date"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  position: integer("position").notNull().default(0),
});

export type LinkItem = { label: string; url: string };
export type ChecklistItem = { id: string; label: string };
export type ChecklistState = { id: string; label: string; done: boolean };

/* ───────────── Tasks ───────────── */

export const taskCategories = pgTable("task_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("#64748b"),
});

/** A recurring schedule that generates task instances. */
export const taskSeries = pgTable("task_series", {
  id: uuid("id").primaryKey().defaultRandom(),
  active: boolean("active").notNull().default(true),
  recurrence: recurrenceEnum("recurrence").notNull(),
  intervalDays: integer("interval_days"), // for custom
  nextDueAt: timestamp("next_due_at", { withTimezone: true }).notNull(),
  leadDays: integer("lead_days").notNull().default(7), // create instance this many days before due
  endsOn: date("ends_on"),
  /** Snapshot of task fields used for each instance. */
  template: jsonb("template").$type<TaskTemplate>().notNull(),
  assigneeIds: jsonb("assignee_ids").$type<string[]>().notNull().default([]),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TaskTemplate = {
  title: string; instructions: string; departmentId: string | null; categoryId: string | null; projectId: string | null;
  priority: "low" | "medium" | "high" | "urgent"; deliverables: string; completionCriteria: string;
  submissionTypes: SubmissionType[]; checklist: ChecklistItem[]; links: LinkItem[]; requiresReview: boolean;
  reviewerId: string | null; timezone: string;
};
export type SubmissionType = "file" | "text" | "link" | "checklist";

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  instructions: text("instructions").notNull().default(""),
  departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
  categoryId: uuid("category_id").references(() => taskCategories.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  priority: priorityEnum("priority").notNull().default("medium"),
  status: taskStatusEnum("status").notNull().default("not_started"),
  /** Status before being blocked, so unblocking returns to it. */
  statusBeforeBlock: taskStatusEnum("status_before_block"),
  blockedReason: text("blocked_reason"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  originalDueAt: timestamp("original_due_at", { withTimezone: true }),
  timezone: text("timezone").notNull().default("America/New_York"),
  deliverables: text("deliverables").notNull().default(""),
  completionCriteria: text("completion_criteria").notNull().default(""),
  submissionTypes: jsonb("submission_types").$type<SubmissionType[]>().notNull().default(["text"]),
  checklist: jsonb("checklist").$type<ChecklistItem[]>().notNull().default([]),
  links: jsonb("links").$type<LinkItem[]>().notNull().default([]),
  requiresReview: boolean("requires_review").notNull().default(true),
  reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
  internalNotes: text("internal_notes").notNull().default(""), // admin + reviewer only
  seriesId: uuid("series_id").references(() => taskSeries.id, { onDelete: "set null" }),
  /** Set when the task was assigned to a work pair/group (a "workgroup" conversation). */
  workGroupId: uuid("work_group_id"),
  /** Set when the task came from a meeting's action items. */
  meetingId: uuid("meeting_id"),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  firstSubmittedAt: timestamp("first_submitted_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  excusedReason: text("excused_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("tasks_due_idx").on(t.dueAt), index("tasks_status_idx").on(t.status), index("tasks_project_idx").on(t.projectId)]);

/** Anything an admin saves privately (tasks, announcements, polls, events…). Nobody sees it or is notified until it is published. */
export const taskDrafts = pgTable("task_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** What it becomes when published: task, announcement, poll, event, meeting, resource. */
  kind: text("kind").notNull().default("task"),
  /** How it's stored: "task-input" (parsed task), "api" (an API request body) or "form" (a portal form's fields). */
  format: text("format").notNull().default("task-input"),
  title: text("title").notNull().default(""),
  /** Groups drafts so a whole week can be published at once, e.g. "Week of Nov 9". */
  batch: text("batch").notNull().default(""),
  /** task-input: TaskInput (dueAt as ISO). api: request body. form: { entries: [name, value][] }. */
  input: jsonb("input").$type<Record<string, unknown>>().notNull(),
  assigneeIds: jsonb("assignee_ids").$type<string[]>().notNull().default([]),
  separate: boolean("separate").notNull().default(true),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taskAssignees = pgTable("task_assignees", {
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.taskId, t.userId] }), index("task_assignees_user_idx").on(t.userId)]);

export const submissions = pgTable("submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  submittedById: uuid("submitted_by_id").references(() => users.id, { onDelete: "set null" }),
  text: text("text").notNull().default(""),
  links: jsonb("links").$type<LinkItem[]>().notNull().default([]),
  checklist: jsonb("checklist").$type<ChecklistState[]>().notNull().default([]),
  note: text("note").notNull().default(""),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  /** Due date in effect when submitted (after any approved extension). */
  dueAtSubmission: timestamp("due_at_submission", { withTimezone: true }),
}, (t) => [uniqueIndex("submissions_task_version_uq").on(t.taskId, t.version)]);

export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  submissionId: uuid("submission_id").references(() => submissions.id, { onDelete: "cascade" }),
  reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
  decision: reviewDecisionEnum("decision").notNull(),
  feedback: text("feedback").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taskComments = pgTable("task_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Timeline of task changes (status, due date, reassignment...). Visible to anyone who can see the task. */
export const taskEvents = pgTable("task_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  kind: text("kind").notNull(), // created | status | due_changed | reassigned | submitted | reviewed | extension | edited
  detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("task_events_task_idx").on(t.taskId)]);

export const extensionRequests = pgTable("extension_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  requestedById: uuid("requested_by_id").references(() => users.id, { onDelete: "set null" }),
  currentDueAt: timestamp("current_due_at", { withTimezone: true }),
  requestedDueAt: timestamp("requested_due_at", { withTimezone: true }).notNull(),
  reason: text("reason").notNull(),
  note: text("note").notNull().default(""),
  status: extensionStatusEnum("status").notNull().default("pending"),
  decidedById: uuid("decided_by_id").references(() => users.id, { onDelete: "set null" }),
  decisionNote: text("decision_note").notNull().default(""),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ───────────── Announcements ───────────── */

export type Audience = { roles?: ("admin" | "leader" | "volunteer")[]; departmentIds?: string[] };

export const announcements = pgTable("announcements", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  category: text("category").notNull().default("update"), // update | reminder | event | news | policy | meeting
  pinned: boolean("pinned").notNull().default(false),
  requireAck: boolean("require_ack").notNull().default(false),
  /** Empty audience = everyone. */
  audience: jsonb("audience").$type<Audience>().notNull().default({}),
  publishAt: timestamp("publish_at", { withTimezone: true }).notNull().defaultNow(),
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const announcementReads = pgTable("announcement_reads", {
  announcementId: uuid("announcement_id").notNull().references(() => announcements.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
}, (t) => [primaryKey({ columns: [t.announcementId, t.userId] })]);

/* ───────────── Calendar ───────────── */

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  type: eventTypeEnum("type").notNull().default("other"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  allDay: boolean("all_day").notNull().default(false),
  location: text("location").notNull().default(""),
  visibility: visibilityEnum("visibility").notNull().default("everyone"),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("events_starts_idx").on(t.startsAt)]);

/* ───────────── Notifications ───────────── */

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  href: text("href"),
  /** Prevents duplicate reminders: unique per user. */
  dedupeKey: text("dedupe_key"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("notifications_user_idx").on(t.userId, t.createdAt), uniqueIndex("notifications_dedupe_uq").on(t.userId, t.dedupeKey)]);

/** Every email the system would send. Only delivered when email is enabled by an admin. */
export const emailOutbox = pgTable("email_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  toEmail: text("to_email").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("held"), // held | sent | failed | skipped
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

/* ───────────── Resources ───────────── */

export const resources = pgTable("resources", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull().default("General"),
  kind: text("kind").notNull(), // file | link | note
  url: text("url"),
  body: text("body"),
  fileId: uuid("file_id"),
  visibility: visibilityEnum("visibility").notNull().default("everyone"),
  pinned: boolean("pinned").notNull().default(false),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ───────────── Accountability (admin only) ───────────── */

export const accountabilityRecords = pgTable("accountability_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  memberId: uuid("member_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: accountabilityTypeEnum("type").notNull(),
  title: text("title").notNull(),
  details: text("details").notNull().default(""),
  followUpDate: date("follow_up_date"),
  status: accountabilityStatusEnum("status").notNull().default("open"),
  resolution: text("resolution").notNull().default(""),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ───────────── Settings & audit ───────────── */

export type OrgSettings = {
  orgName: string;
  tagline: string;
  logoFileId?: string | null;
  /** Hours before a deadline to send reminders, e.g. [48, 24]. */
  reminderHours: number[];
  overdueReminders: boolean;
  emailEnabled: boolean;
  emailFrom: string;
  quietHoursStart?: number; // local hour (org timezone) — reminders wait until after quiet hours
  quietHoursEnd?: number;
  timezone: string;
  lastMaintenanceAt?: string;
  /** Members besides admins who can log donations and make receipts. */
  donationManagerIds?: string[];
  /** Printed on donation receipts. */
  receiptAddress?: string;
  receiptSignerName?: string;
  receiptSignerTitle?: string;
};

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  data: jsonb("data").$type<OrgSettings>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
  ip: text("ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("audit_created_idx").on(t.createdAt)]);

/* ───────────── Phone notifications (Web Push) ───────────── */

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
}, (t) => [index("push_user_idx").on(t.userId)]);

/* ───────────── Chat ───────────── */

export const conversationKindEnum = pgEnum("conversation_kind", ["team", "dm", "group", "workgroup"]);

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: conversationKindEnum("kind").notNull(),
  title: text("title"),
  description: text("description").notNull().default(""),
  /** For DMs: the two user ids sorted and joined, so each pair has exactly one DM. */
  dmKey: text("dm_key").unique(),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  archived: boolean("archived").notNull().default(false),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("conversations_last_idx").on(t.lastMessageAt)]);

export const conversationMembers = pgTable("conversation_members", {
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }),
  lastPushAt: timestamp("last_push_at", { withTimezone: true }),
  /** Last "is typing" ping; shown to others for a few seconds. */
  typingAt: timestamp("typing_at", { withTimezone: true }),
  muted: boolean("muted").notNull().default(false),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.conversationId, t.userId] }), index("conversation_members_user_idx").on(t.userId)]);

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  body: text("body").notNull().default(""),
  /** System lines like "Jacob added Julia". */
  system: boolean("system").notNull().default(false),
  editedAt: timestamp("edited_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedById: uuid("deleted_by_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("messages_conv_created_idx").on(t.conversationId, t.createdAt)]);

/* ───────────── Volunteer sign-ups & hours ───────────── */

export const hoursStatusEnum = pgEnum("hours_status", ["pending", "approved", "rejected"]);

/** Sign-up slots for an event (e.g. "Setup 5:30–6:30, 3 spots"). */
export const eventShifts = pgTable("event_shifts", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  capacity: integer("capacity"), // null = unlimited
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("event_shifts_event_idx").on(t.eventId)]);

export const shiftSignups = pgTable("shift_signups", {
  shiftId: uuid("shift_id").notNull().references(() => eventShifts.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /** null = not marked yet. */
  attended: boolean("attended"),
  hoursEntryId: uuid("hours_entry_id"),
}, (t) => [primaryKey({ columns: [t.shiftId, t.userId] }), index("shift_signups_user_idx").on(t.userId)]);

export const volunteerHours = pgTable("volunteer_hours", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  minutes: integer("minutes").notNull(),
  activity: text("activity").notNull(),
  description: text("description").notNull().default(""),
  source: text("source").notNull().default("manual"), // manual | shift | admin
  shiftId: uuid("shift_id").references(() => eventShifts.id, { onDelete: "set null" }),
  status: hoursStatusEnum("status").notNull().default("pending"),
  reviewedById: uuid("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewNote: text("review_note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("volunteer_hours_user_idx").on(t.userId, t.date), index("volunteer_hours_status_idx").on(t.status)]);

/* ───────────── API keys (for automation such as Claude) ───────────── */

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  /** First characters of the key, shown so you can tell keys apart. */
  prefix: text("prefix").notNull(),
  /** The administrator the key acts as. Deactivated or demoted → the key stops working. */
  createdById: uuid("created_by_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ───────────── Meetings ───────────── */

export const attendanceStatusEnum = pgEnum("attendance_status", ["present", "late", "absent", "excused"]);

export const meetings = pgTable("meetings", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Optional link to a calendar event (one meeting page per event). */
  eventId: uuid("event_id").unique().references(() => events.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  agenda: text("agenda").notNull().default(""),
  notes: text("notes").notNull().default(""),
  visibility: visibilityEnum("visibility").notNull().default("everyone"),
  notesSharedAt: timestamp("notes_shared_at", { withTimezone: true }),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("meetings_starts_idx").on(t.startsAt)]);

export const meetingAttendance = pgTable("meeting_attendance", {
  meetingId: uuid("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: attendanceStatusEnum("status").notNull(),
  markedAt: timestamp("marked_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.meetingId, t.userId] })]);

/* ───────────── Polls ───────────── */

export type PollOption = { id: string; label: string };

export const polls = pgTable("polls", {
  id: uuid("id").primaryKey().defaultRandom(),
  question: text("question").notNull(),
  description: text("description").notNull().default(""),
  options: jsonb("options").$type<PollOption[]>().notNull(),
  multiple: boolean("multiple").notNull().default(false),
  anonymous: boolean("anonymous").notNull().default(false),
  /** always | after_vote | after_close */
  showResults: text("show_results").notNull().default("after_vote"),
  audience: jsonb("audience").$type<Audience>().notNull().default({}),
  closesAt: timestamp("closes_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("polls_created_idx").on(t.createdAt)]);

export const pollVotes = pgTable("poll_votes", {
  pollId: uuid("poll_id").notNull().references(() => polls.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  optionIds: jsonb("option_ids").$type<string[]>().notNull(),
  votedAt: timestamp("voted_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.pollId, t.userId] })]);

/* ───────────── Shout-outs ───────────── */

export const shoutouts = pgTable("shoutouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  fromId: uuid("from_id").references(() => users.id, { onDelete: "set null" }),
  message: text("message").notNull(),
  badge: text("badge").notNull().default("thanks"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("shoutouts_created_idx").on(t.createdAt)]);

export const shoutoutRecipients = pgTable("shoutout_recipients", {
  shoutoutId: uuid("shoutout_id").notNull().references(() => shoutouts.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.shoutoutId, t.userId] }), index("shoutout_recipients_user_idx").on(t.userId)]);

export const shoutoutCheers = pgTable("shoutout_cheers", {
  shoutoutId: uuid("shoutout_id").notNull().references(() => shoutouts.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.shoutoutId, t.userId] })]);

/* ───────────── Monthly reports ───────────── */

/** Numbers and notes the admin adds by hand; everything else in the report is calculated. */
export const monthlyReports = pgTable("monthly_reports", {
  month: text("month").primaryKey(), // YYYY-MM
  highlights: text("highlights").notNull().default(""),
  challenges: text("challenges").notNull().default(""),
  nextMonth: text("next_month").notNull().default(""),
  boxesDelivered: integer("boxes_delivered"),
  hospitalsServed: integer("hospitals_served"),
  moneyRaised: text("money_raised").notNull().default(""),
  updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ───────────── Donations ───────────── */

export const donorKindEnum = pgEnum("donor_kind", ["individual", "business", "foundation", "school", "church", "other"]);
/** cash = money (cash, check, card, online); in_kind = donated items; other = stock, donor-advised fund, vehicle, services, crypto… (acknowledged without tax wording). */
export const giftTypeEnum = pgEnum("gift_type", ["cash", "in_kind", "other"]);

export const donors = pgTable("donors", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: donorKindEnum("kind").notNull().default("individual"),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  address: text("address").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("donors_name_idx").on(t.name)]);

export const donations = pgTable("donations", {
  id: uuid("id").primaryKey().defaultRandom(),
  donorId: uuid("donor_id").notNull().references(() => donors.id, { onDelete: "restrict" }),
  receivedOn: date("received_on").notNull(),
  type: giftTypeEnum("type").notNull().default("cash"),
  /** Cash gifts only, in cents. In-kind gifts never get a value from us. */
  amountCents: integer("amount_cents"),
  method: text("method").notNull().default(""),
  /** What was given (in-kind / other), or an optional note for cash. */
  description: text("description").notNull().default(""),
  goodsProvided: boolean("goods_provided").notNull().default(false),
  goodsDescription: text("goods_description").notNull().default(""),
  goodsValueCents: integer("goods_value_cents"),
  eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
  receiptNumber: text("receipt_number").notNull().unique(),
  notes: text("notes").notNull().default(""),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("donations_donor_idx").on(t.donorId), index("donations_received_idx").on(t.receivedOn)]);

