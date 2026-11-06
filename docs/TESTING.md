# Test results — November 6, 2026

All runs: production build (`next build` + `next start`) against a freshly migrated and seeded PostgreSQL 16 database.

| Check | Result |
|---|---|
| `npm run typecheck` (TypeScript strict) | ✅ clean |
| `npx eslint src tests` | ✅ clean |
| Unit tests (`npm run test:unit`, 18 tests: deadlines, time zones, recurrence, metric math, passwords/tokens) | ✅ 18/18, server clock in UTC and America/Los_Angeles |
| Browser end-to-end tests (`npm run test:e2e`, Playwright, Chrome desktop + iPhone 13) | ✅ 9/9 |

## The 15 required workflows

| # | Workflow | How it was verified | Result |
|---|---|---|---|
| 1 | Administrator creates an account invitation | E2E `admin invites a new member…` | ✅ |
| 2 | Member signs in | Same test: invite link → set password → lands on Home → signs out → signs back in. Invalid and reused links are refused | ✅ |
| 3 | Administrator assigns a task | E2E `assign → submit → …` (New task form) | ✅ |
| 4 | Member views the task | Same: appears in My tasks + "New assignment" notification | ✅ |
| 5 | Member submits an attachment | Same: PNG upload + text + note → status **Submitted** (not completed). A renamed executable is rejected, nothing is saved, typed text is kept | ✅ |
| 6 | Administrator reviews the submission | Same: Review Center shows preview, text and image thumbnail | ✅ |
| 7 | Administrator requests revisions | Same: feedback required; status **Revision requested** | ✅ |
| 8 | Member resubmits | Same: feedback shown; version 2 uploaded; version 1 and its file kept | ✅ |
| 9 | Administrator approves | Same: status **Approved**, completion recorded separately from submission | ✅ |
| 10 | Dashboard statistics update | Same: member's "Completed this month" increases by exactly 1; "Approved" notification | ✅ |
| 11 | Reminders follow configured rules | E2E `cron endpoint…`: secret required (401 without); 3 runs → exactly **one** 24-hour reminder; changing the deadline re-arms exactly one new reminder. Quiet hours, thresholds and overdue notices are configurable in Settings → Reminders | ✅ |
| 12 | Members can't access another member's private information | E2E: volunteer opening a leader's task gets "not found" with no data; another member's submission file → 404; signed out → 401. Team profiles show no task/performance data. Accountability is admin-only | ✅ |
| 13 | Non-administrators can't access administrator functions | E2E: leader and volunteer are redirected away from All tasks, New task, Command center, Performance, Accountability and Settings; data export returns 403. Server actions check the role on the server | ✅ |
| 14 | Files accessible only to authorized users | Covered by #12 plus the feature agents' checks on announcement, resource and project files (admin-only resource file → 404 for a leader) | ✅ |
| 15 | Works on mobile | E2E on an emulated iPhone 13: no horizontal scrolling on Home, Tasks, Task detail, Calendar, Announcements, Notifications or Profile; checklist + text submitted from the phone. Screenshots at 390px reviewed for every page | ✅ |

Also verified: extension request → approval moves the deadline and keeps the original; recurring weekly task creates one copy per person and schedules the next one 7 days later; dark mode.

## Known limitations
- **Pages that are denied or not found return HTTP 200** (with the correct "not found" page or a redirect). This is how Next.js streaming works with loading skeletons; no data is sent. API routes return real 401/403/404 codes.
- **Email is off.** Messages are kept in Settings → Email → Outbox until an administrator turns email on (see DEPLOYMENT.md).
- **Calendar** uses the organization's time zone (Eastern) and the week view is a per-day list, not an hourly grid.
- **Editing a published announcement** doesn't re-notify people.
- **Board view:** cards aren't drag-and-drop. Status changes happen on the task itself, so the workflow rules (e.g. only a reviewer can approve) can't be bypassed.
- **No automatic virus scanning** of uploads (type, size and contents are checked). Add one if files ever come from outside the team.
- **Load:** the app has only been tested with a small team. Expected scale is 8–30 people.
