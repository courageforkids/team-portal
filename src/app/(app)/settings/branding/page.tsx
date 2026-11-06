import { requireAdmin } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { Card, CardHeader } from "@/components/ui/card";
import { ActionForm, Field, Input, SubmitButton } from "@/components/ui/form";
import { saveBrandingAction } from "../actions";

export const metadata = { title: "Branding · Settings" };

const SWATCHES = [
  { name: "Courage navy", hex: "#004F81", cls: "bg-brand", use: "Buttons, links and highlights" },
  { name: "Courage yellow", hex: "#FED438", cls: "bg-accent", use: "Badges and moments of celebration" },
];

export default async function BrandingSettingsPage() {
  await requireAdmin();
  const s = await getSettings();
  return (
    <>
      <Card>
        <CardHeader title="Name and tagline" description="Shown in the sidebar, the top bar and sign-in emails." />
        <ActionForm action={saveBrandingAction} className="space-y-4 border-t border-line px-4 py-5 sm:px-5">
          <Field label="Organization name" htmlFor="org-name" required>
            <Input id="org-name" name="orgName" required maxLength={60} defaultValue={s.orgName} />
          </Field>
          <Field label="Tagline" htmlFor="org-tagline" hint="Optional. Keep it short.">
            <Input id="org-tagline" name="tagline" maxLength={100} defaultValue={s.tagline} />
          </Field>
          <div className="flex justify-end"><SubmitButton pendingText="Saving…">Save branding</SubmitButton></div>
        </ActionForm>
      </Card>
      <Card>
        <CardHeader title="Brand colors" description="Colors are part of the portal's design system, tuned for readability in light and dark mode, so they aren't editable here." />
        <ul className="grid gap-3 border-t border-line px-4 py-4 sm:grid-cols-2 sm:px-5">
          {SWATCHES.map((c) => (
            <li key={c.name} className="flex items-center gap-3 rounded-xl border border-line p-3">
              <span className={`h-12 w-12 shrink-0 rounded-xl ring-1 ring-line ${c.cls}`} aria-hidden />
              <div className="min-w-0">
                <p className="font-semibold text-fg">{c.name}</p>
                <p className="font-mono text-xs text-muted">{c.hex}</p>
                <p className="text-xs text-muted">{c.use}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
