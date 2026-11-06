import "server-only";
import { getCategories, getDepartments, getPeople, getProjectsLite } from "@/server/queries";

export async function taskFormOptions() {
  const [people, departments, categories, projects] = await Promise.all([getPeople(), getDepartments(), getCategories(), getProjectsLite()]);
  return {
    people: people.map((p) => ({ id: p.id, name: p.name, title: p.title, avatarFileId: p.avatarFileId, departmentId: p.departmentId, role: p.role })),
    departments: departments.map((d) => ({ id: d.id, name: d.name })),
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    projects: projects.filter((p) => p.status !== "archived").map((p) => ({ id: p.id, name: p.name })),
    reviewers: people.filter((p) => p.role !== "volunteer").map((p) => ({ id: p.id, name: p.name })),
  };
}
