/** Shared (client + server) task vocabulary. */

export const TASK_STATUSES = [
  "not_started", "in_progress", "submitted", "under_review", "revision_requested", "approved", "canceled", "excused", "blocked",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted",
  under_review: "Under review",
  revision_requested: "Revision requested",
  approved: "Approved",
  canceled: "Canceled",
  excused: "Excused",
  blocked: "Blocked",
};

/** Tone keys map to badge styles in the UI. */
export const STATUS_TONE: Record<TaskStatus, "neutral" | "blue" | "violet" | "amber" | "green" | "muted" | "red"> = {
  not_started: "neutral",
  in_progress: "blue",
  submitted: "violet",
  under_review: "violet",
  revision_requested: "amber",
  approved: "green",
  canceled: "muted",
  excused: "muted",
  blocked: "red",
};

/** Work is still owed by the assignee. Only these can be overdue. */
export const OPEN_FOR_ASSIGNEE: TaskStatus[] = ["not_started", "in_progress", "revision_requested", "blocked"];
/** Waiting on a reviewer — never counted as overdue for the member. */
export const AWAITING_REVIEW: TaskStatus[] = ["submitted", "under_review"];
/** No more work happening. */
export const CLOSED: TaskStatus[] = ["approved", "canceled", "excused"];
export const ACTIVE: TaskStatus[] = [...OPEN_FOR_ASSIGNEE, ...AWAITING_REVIEW];

/** Board columns (blocked shown inside its own column). */
export const BOARD_COLUMNS: { key: string; label: string; statuses: TaskStatus[] }[] = [
  { key: "todo", label: "Not started", statuses: ["not_started"] },
  { key: "doing", label: "In progress", statuses: ["in_progress", "blocked"] },
  { key: "review", label: "In review", statuses: ["submitted", "under_review"] },
  { key: "revise", label: "Needs revision", statuses: ["revision_requested"] },
  { key: "done", label: "Approved", statuses: ["approved"] },
];

export function isOverdue(t: { status: TaskStatus; dueAt: Date | string | null }, now = new Date()) {
  if (!t.dueAt) return false;
  if (!OPEN_FOR_ASSIGNEE.includes(t.status)) return false;
  return new Date(t.dueAt).getTime() < now.getTime();
}

export function isDueSoon(t: { status: TaskStatus; dueAt: Date | string | null }, hours = 72, now = new Date()) {
  if (!t.dueAt || !OPEN_FOR_ASSIGNEE.includes(t.status)) return false;
  const ms = new Date(t.dueAt).getTime() - now.getTime();
  return ms >= 0 && ms <= hours * 3600_000;
}

export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };
export const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export const SUBMISSION_TYPE_LABEL = { file: "File upload", text: "Written response", link: "Link", checklist: "Checklist" } as const;

export const ROLE_LABEL = { admin: "Executive Administrator", leader: "Leadership Member", volunteer: "Volunteer" } as const;

export const EVENT_TYPE_LABEL = {
  meeting: "Meeting", community: "Community event", fundraising: "Fundraising", volunteer: "Volunteer opportunity", milestone: "Milestone", other: "Other",
} as const;

export const VISIBILITY_LABEL = { everyone: "Everyone", leadership: "Leadership & admins", admin: "Administrators only" } as const;
