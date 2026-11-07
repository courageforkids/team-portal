# Team Portal API

For trusted automation (e.g. Claude) acting on behalf of an Executive Administrator.

- **Create a key:** Portal → Settings → API keys. Shown once. Revoke anytime.
- **Auth:** `Authorization: Bearer cfk_…` · JSON bodies (`Content-Type: application/json`) · base URL = the portal's address.
- **Acts as** the admin who created the key; stops working if they're deactivated or demoted. Every write is logged in Settings → Activity log as "via API key".
- **Can't:** change passwords/roles, invite or remove people, read accountability records, post in chats.
- **Rate limit:** 120 requests/minute per key.
- **Dates:** `2026-12-01T18:00` (interpreted in America/New_York) or an ISO timestamp with offset.
- **People** may be given by id, full name, or a unique first name ("Julia").

| Method | Path | Body / query |
|---|---|---|
| GET | `/api/v1` | who the key acts as + endpoint list |
| GET | `/api/v1/lookups` | people, departments, projects, categories, work groups |
| GET | `/api/v1/tasks` | `?view=active\|overdue\|review\|completed\|everything&member=Julia&q=text` |
| POST | `/api/v1/tasks` | `{ title, assignees: ["Julia"], dueAt, instructions?, priority?: low\|medium\|high\|urgent, department?, project?, category?, submissionTypes?: ["file","text","link","checklist"], checklist?: ["step"], links?: [{label,url}], deliverables?, completionCriteria?, requiresReview?: true, reviewer?, separate?: true, workGroup? }` |
| GET | `/api/v1/tasks/:id` | task + assignees + submissions + reviews |
| PATCH | `/api/v1/tasks/:id` | any of `title, instructions, dueAt, priority, department, project, category, deliverables, completionCriteria, assignees, requiresReview, reviewer`, and/or `{ status, reason }` (status: not_started, in_progress, approved, canceled, excused, blocked…) |
| POST | `/api/v1/tasks/:id/review` | `{ decision: "approved" \| "revision_requested", feedback }` |
| GET | `/api/v1/review` | submissions waiting + pending extension requests |
| GET/POST | `/api/v1/announcements` | `{ title, body, category?: update\|reminder\|event\|news\|policy\|meeting, pinned?, requireAck?, audience?: { roles?: ["leader"], departments?: ["Media"] }, publishAt? }` |
| GET/POST | `/api/v1/events` | GET `?from&to`; POST `{ title, startsAt, endsAt?, allDay?, location?, description?, type?: meeting\|community\|fundraising\|volunteer\|milestone\|other, visibility?: everyone\|leadership\|admin, project? }` |
| POST | `/api/v1/events/:id/shifts` | `{ label, startsAt, endsAt, capacity?, notes? }` |
| GET/POST | `/api/v1/meetings` | `{ title, startsAt, agenda?, visibility? }` or `{ event: "<calendar event id>", agenda? }` (reuses that event's meeting page) |
| GET/POST | `/api/v1/polls` | `{ question, options: ["A","B"], description?, closesAt?, roles?: ["leader"], multiple?, anonymous?, showResults?: always\|after_vote\|after_close }`. Notifies the audience. |
| GET/POST | `/api/v1/resources` | `{ title, kind?: note\|link, body? (note), url? (link), category?, description?, visibility?, pinned? }` |

Example:
```bash
curl -s -X POST "$PORTAL_URL/api/v1/tasks" -H "Authorization: Bearer $PORTAL_API_KEY" -H "Content-Type: application/json" \
  -d '{"title":"Post Dickens graphics","assignees":["Arleigh"],"dueAt":"2026-11-20T17:00","submissionTypes":["file"]}'
```
