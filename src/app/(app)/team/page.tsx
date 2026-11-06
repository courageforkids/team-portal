import { requireUser } from "@/server/auth";
import { getDepartments } from "@/server/queries";
import { getDirectory } from "@/server/team";
import { getSettings } from "@/server/settings";
import { PageHeader } from "@/components/ui/page-header";
import { TeamDirectory } from "@/components/team/directory";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  await requireUser();
  const [people, departments, settings] = await Promise.all([getDirectory(), getDepartments(), getSettings()]);
  return (
    <>
      <PageHeader title="Team" description={`The ${people.length} ${people.length === 1 ? "person" : "people"} behind ${settings.orgName} — who they are and what they look after.`} />
      <TeamDirectory departments={departments.map((d) => ({ id: d.id, name: d.name }))}
        people={people.map((p) => ({
          id: p.id, name: p.name, title: p.title, role: p.role, avatarFileId: p.avatarFileId, responsibilities: p.responsibilities,
          departmentId: p.departmentId, departmentName: p.departmentName, departmentColor: p.departmentColor,
        }))} />
    </>
  );
}
