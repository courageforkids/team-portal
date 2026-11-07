import { apiRoute } from "@/server/api-auth";

/** API index: who the key acts as, and what you can call. Full docs: docs/API.md in the repository. */
export const GET = apiRoute(async (_req, actor) => ({
  actingAs: { id: actor.id, name: actor.name, role: actor.role }, key: actor.apiKeyName,
  endpoints: [
    "GET  /api/v1/lookups                 people, departments, projects, categories, work groups",
    "GET  /api/v1/tasks?view=active|overdue|review|completed|everything&member=&q=",
    "POST /api/v1/tasks                   create (assignees by id or name)",
    "GET  /api/v1/tasks/:id               details + submissions",
    "PATCH /api/v1/tasks/:id              edit fields, change status or due date",
    "POST /api/v1/tasks/:id/review        { decision: approved|revision_requested, feedback }",
    "GET  /api/v1/review                  submissions waiting + extension requests",
    "GET|POST /api/v1/announcements",
    "GET|POST /api/v1/events?from=&to=",
    "POST /api/v1/events/:id/shifts       sign-up shift",
    "GET|POST /api/v1/resources",
    "GET|POST /api/v1/meetings             { title, startsAt, agenda } or { event: id, agenda }",
    "GET|POST /api/v1/polls                { question, options: [..], closesAt?, roles?, anonymous?, multiple? }",
  ],
}));
