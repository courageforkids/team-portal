import "server-only";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers } from "@/db/schema";
import { getCategories, getDepartments, getPeople, getProjectsLite } from "@/server/queries";
import { workGroupsLite } from "@/server/chat";

export async function taskFormOptions() {
  const [people, departments, categories, projects, groups] = await Promise.all([getPeople(), getDepartments(), getCategories(), getProjectsLite(), workGroupsLite()]);
  const gm = groups.length ? await db.select().from(conversationMembers).where(inArray(conversationMembers.conversationId, groups.map((g) => g.id))) : [];
  return {
    people: people.map((p) => ({ id: p.id, name: p.name, title: p.title, avatarFileId: p.avatarFileId, departmentId: p.departmentId, role: p.role })),
    departments: departments.map((d) => ({ id: d.id, name: d.name })),
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    projects: projects.filter((p) => p.status !== "archived").map((p) => ({ id: p.id, name: p.name })),
    reviewers: people.filter((p) => p.role !== "volunteer").map((p) => ({ id: p.id, name: p.name })),
    workGroups: groups.map((g) => ({ id: g.id, name: g.title ?? "Work group", memberIds: gm.filter((m) => m.conversationId === g.id).map((m) => m.userId) })),
  };
}
