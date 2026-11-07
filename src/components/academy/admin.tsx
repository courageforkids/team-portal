"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Volume2, VolumeX } from "lucide-react";
import { ActionForm, Field, Input, Select, SubmitButton } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { CAPES, activeCapes, type Cape } from "@/lib/academy";
import { clearPlaneReportAction, createSeasonAction, deleteSeasonAction, giveBonusAction, reportPlaneAction, resortMembersAction, saveAcademySettingsAction } from "@/server/academy-actions";
import { setSound, soundOn, sfx } from "@/lib/sfx";

export function SoundToggle() {
  const [on, setOn] = useState(true);
  useEffect(() => setOn(soundOn()), []);
  return (
    <button type="button" aria-pressed={on} onClick={() => { setSound(!on); setOn(!on); if (!on) setTimeout(() => sfx.points(), 50); }}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium text-fg-2 hover:bg-surface-2">
      {on ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}{on ? "Sound on" : "Sound off"}
    </button>
  );
}

type Goal = { label: string; metric: string; target: number; current?: number; year: number };
export function AcademySettingsForm({ enabled, capeCount, goals }: { enabled: boolean; capeCount: 2 | 4; goals: Goal[] }) {
  const year = new Date().getFullYear();
  return (
    <ActionForm action={saveAcademySettingsAction} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Courage Academy" htmlFor="ac-on"><Select id="ac-on" name="enabled" defaultValue={enabled ? "on" : "off"}><option value="on">On</option><option value="off">Off (hide everything)</option></Select></Field>
        <Field label="Number of Capes" htmlFor="ac-capes" hint="Start with 2 while the team is small."><Select id="ac-capes" name="capeCount" defaultValue={String(capeCount)}><option value="2">2 (Navy, Gold)</option><option value="4">4 (Navy, Gold, Ember, Evergreen)</option></Select></Field>
      </div>
      <fieldset>
        <legend className="label">Quest map goals (up to 3)</legend>
        <div className="space-y-2">
          {[0, 1, 2].map((i) => {
            const g = goals[i];
            return (
              <div key={i} className="grid gap-2 rounded-xl border border-line p-2 sm:grid-cols-[1.4fr_1fr_.8fr_.8fr_.7fr]">
                <Input name={`goal${i}Label`} aria-label={`Goal ${i + 1} name`} placeholder="e.g. Boxes delivered" defaultValue={g?.label} maxLength={60} />
                <Select name={`goal${i}Metric`} aria-label={`Goal ${i + 1} counts`} defaultValue={g?.metric ?? "boxes"}><option value="boxes">Boxes (monthly reports)</option><option value="money">Money (Donations)</option><option value="manual">I&apos;ll update it</option></Select>
                <Input name={`goal${i}Target`} aria-label={`Goal ${i + 1} target`} placeholder="Target" inputMode="decimal" defaultValue={g?.target} />
                <Input name={`goal${i}Current`} aria-label={`Goal ${i + 1} current (manual only)`} placeholder="Now (manual)" inputMode="decimal" defaultValue={g?.current} />
                <Input name={`goal${i}Year`} aria-label={`Goal ${i + 1} year`} inputMode="numeric" defaultValue={g?.year ?? year} />
              </div>
            );
          })}
        </div>
      </fieldset>
      <SubmitButton>Save Academy settings</SubmitButton>
    </ActionForm>
  );
}

export function SeasonForm() {
  return (
    <ActionForm action={createSeasonAction} resetOnSuccess className="grid gap-2 sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-end">
      <Field label="Season name" htmlFor="se-name"><Input id="se-name" name="name" placeholder="Spring 2027" maxLength={60} /></Field>
      <Field label="Starts" htmlFor="se-start"><Input id="se-start" name="startsOn" type="date" /></Field>
      <Field label="Ends" htmlFor="se-end"><Input id="se-end" name="endsOn" type="date" /></Field>
      <SubmitButton>Create</SubmitButton>
    </ActionForm>
  );
}

function useRun() {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => start(async () => { const r = await fn(); toast.push(r.ok ? "success" : "error", r.ok ? r.message ?? "Done." : r.error ?? ""); router.refresh(); });
  return { pending, run };
}

export function DeleteSeasonButton({ id, name }: { id: string; name: string }) {
  const { pending, run } = useRun();
  return <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (window.confirm(`Delete the season “${name}”? Points aren't lost; they just won't count toward a season.`)) run(() => deleteSeasonAction(id)); }}>Delete</Button>;
}

export function BonusForm({ capeCount, people }: { capeCount: 2 | 4; people: { id: string; name: string }[] }) {
  return (
    <ActionForm action={giveBonusAction} resetOnSuccess className="grid gap-2 sm:grid-cols-[1.2fr_.6fr_1.6fr_auto] sm:items-end">
      <Field label="Give to" htmlFor="bo-to">
        <Select id="bo-to" name="target" defaultValue="">
          <option value="" disabled>Choose</option>
          <optgroup label="Whole Cape">{activeCapes(capeCount).map((c) => <option key={c} value={`cape:${c}`}>{CAPES[c].name}</option>)}</optgroup>
          <optgroup label="A person">{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
        </Select>
      </Field>
      <Field label="Points" htmlFor="bo-pts"><Input id="bo-pts" name="points" type="number" min={1} max={100} defaultValue={10} /></Field>
      <Field label="For" htmlFor="bo-why"><Input id="bo-why" name="reason" maxLength={140} placeholder="Drove supplies to the hospital" /></Field>
      <SubmitButton>Give bonus</SubmitButton>
    </ActionForm>
  );
}

export function ResortForm({ capeCount, people }: { capeCount: 2 | 4; people: { id: string; name: string; cape: string | null }[] }) {
  return (
    <ActionForm action={resortMembersAction} className="space-y-3">
      <ul className="divide-y divide-line rounded-xl border border-line">
        {people.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <input type="hidden" name="userId" value={p.id} />
            <span className="text-sm font-medium">{p.name}</span>
            <Select name={`cape_${p.id}`} aria-label={`${p.name}'s Cape`} defaultValue={p.cape ?? ""} className="max-w-[180px]">
              <option value="">Not sorted (re-take quiz)</option>
              {activeCapes(capeCount).map((c: Cape) => <option key={c} value={c}>{CAPES[c].name}</option>)}
            </Select>
          </li>
        ))}
      </ul>
      <SubmitButton variant="secondary">Save Capes</SubmitButton>
    </ActionForm>
  );
}

export function ReportedPlaneActions({ id }: { id: string }) {
  const { pending, run } = useRun();
  return (
    <div className="flex gap-1">
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => clearPlaneReportAction(id, false))}>Restore</Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => clearPlaneReportAction(id, true))}>Delete</Button>
    </div>
  );
}

export function ReportPlaneButton({ id }: { id: string }) {
  const { pending, run } = useRun();
  return <button type="button" disabled={pending} onClick={() => { if (window.confirm("Report this plane to an admin? It will be hidden.")) run(() => reportPlaneAction(id)); }} className="text-xs font-semibold underline opacity-70 hover:opacity-100">Report</button>;
}
