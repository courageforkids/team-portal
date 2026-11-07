import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { extensionRequests, tasks, users } from "@/db/schema";
import { apiRoute } from "@/server/api-auth";
import { loadTasks } from "@/server/queries";

export const GET = apiRoute(async (_req, actor) => {
  const waiting = await loadTasks(actor, { scope: "all", view: "review", sort: "updated" });
  const exts = await db.select({ id: extensionRequests.id, taskId: extensionRequests.taskId, title: tasks.title, who: users.name, requestedDueAt: extensionRequests.requestedDueAt, reason: extensionRequests.reason })
    .from(extensionRequests).innerJoin(tasks, eq(tasks.id, extensionRequests.taskId)).leftJoin(users, eq(users.id, extensionRequests.requestedById))
    .where(eq(extensionRequests.status, "pending")).orderBy(desc(extensionRequests.createdAt));
  return { submissions: waiting.map((t) => ({ id: t.id, title: t.title, assignees: t.assignees.map((a) => a.name), dueAt: t.dueAt })), extensionRequests: exts };
});
