import { test } from "node:test";
import assert from "node:assert/strict";
import { isOverdue, isDueSoon, OPEN_FOR_ASSIGNEE, AWAITING_REVIEW } from "../../src/lib/task-meta";
import { dueLabel, parseLocalInput, toLocalInput } from "../../src/lib/dates";
import { nextOccurrence } from "../../src/lib/recurrence";

const now = new Date("2026-11-10T15:00:00Z");
const past = new Date("2026-11-09T15:00:00Z");

test("submitted or approved work is never overdue", () => {
  for (const s of [...AWAITING_REVIEW, "approved", "canceled", "excused"] as const) assert.equal(isOverdue({ status: s, dueAt: past }, now), false, s);
  for (const s of OPEN_FOR_ASSIGNEE) assert.equal(isOverdue({ status: s, dueAt: past }, now), true, s);
  assert.equal(isOverdue({ status: "in_progress", dueAt: null }, now), false);
});

test("due soon window", () => {
  assert.equal(isDueSoon({ status: "not_started", dueAt: new Date(now.getTime() + 10 * 3600_000) }, 48, now), true);
  assert.equal(isDueSoon({ status: "not_started", dueAt: new Date(now.getTime() + 60 * 3600_000) }, 48, now), false);
  assert.equal(isDueSoon({ status: "submitted", dueAt: new Date(now.getTime() + 10 * 3600_000) }, 48, now), false);
});

test("friendly due labels", () => {
  assert.equal(dueLabel(null), "No due date");
  assert.match(dueLabel(new Date("2026-11-10T22:00:00Z"), "America/New_York", now), /^Due today/);
  assert.match(dueLabel(new Date("2026-11-11T22:00:00Z"), "America/New_York", now), /^Due tomorrow/);
  assert.equal(dueLabel(new Date("2026-11-08T15:00:00Z"), "America/New_York", now), "2 days past due");
});

test("datetime-local values are interpreted in the task's time zone", () => {
  const d = parseLocalInput("2026-11-10T17:00", "America/New_York")!;
  assert.equal(d.toISOString(), "2026-11-10T22:00:00.000Z");
  assert.equal(toLocalInput(d, "America/Los_Angeles"), "2026-11-10T14:00");
  assert.equal(parseLocalInput("2026-11-10", "America/New_York")!.toISOString(), "2026-11-11T04:59:00.000Z");
  assert.equal(parseLocalInput("not a date"), null);
});

test("recurrence rules", () => {
  const d = new Date("2026-01-31T17:00:00Z");
  assert.equal(nextOccurrence(d, "weekly").toISOString(), "2026-02-07T17:00:00.000Z");
  assert.equal(nextOccurrence(d, "biweekly").toISOString(), "2026-02-14T17:00:00.000Z");
  assert.equal(nextOccurrence(d, "monthly").toISOString().slice(0, 10), "2026-02-28");
  assert.equal(nextOccurrence(d, "custom", 10).toISOString(), "2026-02-10T17:00:00.000Z");
  assert.equal(nextOccurrence(d, "custom", 0).toISOString(), "2026-02-01T17:00:00.000Z");
});
