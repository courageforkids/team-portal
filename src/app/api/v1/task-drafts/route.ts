import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { apiRoute } from "@/server/api-auth";
import { listDrafts } from "@/server/drafts";

export const GET = apiRoute(async () => {
  const drafts = await listDrafts();
  const ids = [...new Set(drafts.flatMap((d) => d.assigneeIds))];
  const names = new Map((ids.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids)) : []).map((u) => [u.id, u.name]));
  return { drafts: drafts.map((d) => ({ id: d.id, kind: d.kind, batch: d.batch, title: d.title, dueAt: d.input.dueAt ?? null, assignees: d.assigneeIds.map((i) => names.get(i) ?? i) })) };
});
