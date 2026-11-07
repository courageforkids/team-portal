import { PartyPopper } from "lucide-react";
import { requireUser } from "@/server/auth";
import { onboardingStatus } from "@/server/onboarding";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { OnboardingChecklist } from "@/components/onboarding/checklist";

export const metadata = { title: "Getting started" };

export default async function OnboardingPage() {
  const me = await requireUser();
  const steps = (await onboardingStatus([me.id])).get(me.id) ?? [];
  const done = steps.filter((s) => s.done).length;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Getting started" description="A few quick things so you're all set up. Some check themselves off when you do them." />
      {done === steps.length && steps.length > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-ok/25 bg-ok-soft p-4 text-sm"><PartyPopper className="h-5 w-5 text-ok" /><span><b>You're all set!</b> Thanks for getting everything ready.</span></div>
      )}
      <Card className="p-5"><OnboardingChecklist steps={steps} /></Card>
    </div>
  );
}
