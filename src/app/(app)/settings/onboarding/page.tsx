import { asc, desc } from "drizzle-orm";
import { db } from "@/db";
import { onboardingSteps, resources } from "@/db/schema";
import { requireAdmin } from "@/server/auth";
import { ensureDefaultSteps, onboardingStatus } from "@/server/onboarding";
import { getPeople } from "@/server/queries";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { AddStepButton, NudgeButton, StepRowActions } from "@/components/onboarding/admin";
import { ONBOARDING_KIND_LABEL as KIND_LABEL } from "@/lib/onboarding-meta";

export const metadata = { title: "Onboarding" };

export default async function OnboardingSettingsPage() {
  await requireAdmin();
  await ensureDefaultSteps();
  const [steps, res, people] = await Promise.all([
    db.select().from(onboardingSteps).orderBy(asc(onboardingSteps.position), asc(onboardingSteps.createdAt)),
    db.select({ id: resources.id, title: resources.title }).from(resources).orderBy(desc(resources.updatedAt)),
    getPeople(),
  ]);
  const status = await onboardingStatus(people.map((p) => p.id));
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Onboarding</h2>
        <p className="text-sm text-muted">Every member sees these steps on Home until they're done. New members get them automatically.</p>
      </div>
      <Card>
        <CardHeader title="Steps" action={<AddStepButton resources={res} />} />
        <ul className="divide-y divide-line border-t border-line">
          {steps.map((s, i) => (
            <li key={s.id} className="flex items-center gap-3 px-5 py-3">
              <span className="w-5 shrink-0 text-center text-sm font-semibold text-muted">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium">{s.title}{!s.active && <Badge tone="muted">Hidden</Badge>}</div>
                <div className="text-xs text-muted">{KIND_LABEL[s.kind]}{s.roles.length ? ` · ${s.roles.join(", ")}` : " · everyone"}</div>
              </div>
              <StepRowActions step={{ ...s, roles: s.roles }} resources={res} first={i === 0} last={i === steps.length - 1} />
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader title="Who's set up" description="Alphabetical." />
        <ul className="divide-y divide-line border-t border-line">
          {people.map((p) => {
            const st = status.get(p.id) ?? [];
            const done = st.filter((x) => x.done).length;
            const missing = st.filter((x) => !x.done).map((x) => x.title);
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <Avatar name={p.name} fileId={p.avatarFileId} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{p.name}</div>
                  {missing.length > 0 && <div className="truncate text-xs text-muted">Left: {missing.join(" · ")}</div>}
                </div>
                <Badge tone={done === st.length ? "green" : "neutral"}>{done}/{st.length}</Badge>
                {missing.length > 0 && <NudgeButton userId={p.id} />}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
