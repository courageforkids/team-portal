import { apiRoute } from "@/server/api-auth";
import { getCategories, getDepartments, getPeople, getProjectsLite } from "@/server/queries";
import { workGroupsLite } from "@/server/chat";

export const GET = apiRoute(async () => {
  const [people, departments, projects, categories, workGroups] = await Promise.all([getPeople(), getDepartments(), getProjectsLite(), getCategories(), workGroupsLite()]);
  return {
    people: people.map((p) => ({ id: p.id, name: p.name, title: p.title, role: p.role, departmentId: p.departmentId })),
    departments: departments.map((d) => ({ id: d.id, name: d.name })),
    projects, categories: categories.map((c) => ({ id: c.id, name: c.name })), workGroups,
  };
});
