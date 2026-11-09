"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionForm, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { CAPES, activeCapes, type Cape } from "@/lib/academy";
import {
  clearPlaneReportAction, createChallengeAction, createSeasonAction, decideChallengeAction, deleteChallengeAction, deleteSeasonAction, giveBonusAction,
  reportPlaneAction, resortMembersAction, reviewClaimAction, saveAcademySettingsAction, setCaptainAction,
} from "@/server/academy-actions";
import { addQuestionAction, createNightAction, toggleQuestionAction } from "@/server/trivia-actions";
import { TRIVIA_CATEGORIES } from "@/lib/trivia-bank";

function useRun() {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => start(async () => { const r = await fn(); toast.push(r.ok ? "success" : "error", r.ok ? r.message ?? "Done." : r.error ?? ""); router.refresh(); });
  return { pending, run };
}

export function AcademySettingsForm({ audience, capeCount, borders, previewIds, people }: {
  audience: "off" | "preview" | "everyone"; capeCount: 2 | 4; borders: string; previewIds: string[]; people: { id: string; name: string; role: string }[];
}) {
  const [aud, setAud] = useState(audience);
  return (
    <ActionForm action={saveAcademySettingsAction} className="space-y-4">
      <Field label="Who can see Courage Academy" htmlFor="ac-aud" hint="Preview = only admins and the people you tick below. Nobody else sees anything (no menu item, no alerts).">
        <Select id="ac-aud" name="audience" value={aud} onChange={(e) => setAud(e.target.value as typeof aud)}>
          <option value="preview">Preview (just me and people I pick)</option>
          <option value="everyone">Everyone on the team</option>
          <option value="off">Off (hide it from everyone)</option>
        </Select>
      </Field>
      {aud === "preview" && (
        <fieldset>
          <legend className="label">Also show the preview to</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {people.filter((p) => p.role !== "admin").map((p) => (
              <label key={p.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm"><input type="checkbox" name="previewIds" value={p.id} defaultChecked={previewIds.includes(p.id)} />{p.name}</label>
            ))}
          </div>
        </fieldset>
      )}
      {aud !== "preview" && previewIds.map((id) => <input key={id} type="hidden" name="previewIds" value={id} />)}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Number of Capes" htmlFor="ac-capes" hint="2 works best while the team is small."><Select id="ac-capes" name="capeCount" defaultValue={String(capeCount)}><option value="2">2 (Navy, Gold)</option><option value="4">4 (Navy, Gold, Ember, Evergreen)</option></Select></Field>
        <Field label="Cape borders on pictures" htmlFor="ac-borders"><Select id="ac-borders" name="borders" defaultValue={borders === "off" ? "off" : "academy"}><option value="academy">On (in the Academy)</option><option value="off">Off</option></Select></Field>
      </div>
      <SubmitButton>Save</SubmitButton>
    </ActionForm>
  );
}

export function SeasonForm() {
  const year = new Date().getFullYear();
  return (
    <ActionForm action={createSeasonAction} resetOnSuccess className="grid gap-2 sm:grid-cols-[1.2fr_1fr_1fr_1fr_auto] sm:items-end">
      <Field label="Season name" htmlFor="se-name"><Input id="se-name" name="name" defaultValue="Winter Season" maxLength={60} /></Field>
      <Field label="Starts" htmlFor="se-start"><Input id="se-start" name="startsOn" type="date" defaultValue={`${year}-12-01`} /></Field>
      <Field label="Ends" htmlFor="se-end"><Input id="se-end" name="endsOn" type="date" defaultValue={`${year + 1}-01-01`} /></Field>
      <Field label="Look" htmlFor="se-theme"><Select id="se-theme" name="theme" defaultValue="winter"><option value="winter">❄️ Winter</option><option value="">Normal</option></Select></Field>
      <SubmitButton>Create</SubmitButton>
    </ActionForm>
  );
}

export function DeleteSeasonButton({ id, name }: { id: string; name: string }) {
  const { pending, run } = useRun();
  return <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (window.confirm(`Delete the season “${name}”? Points aren't lost; they just won't count toward a season.`)) run(() => deleteSeasonAction(id)); }}>Delete</Button>;
}

export function BonusForm({ capeCount, people, capeNames }: { capeCount: 2 | 4; people: { id: string; name: string }[]; capeNames: Record<string, string> }) {
  return (
    <ActionForm action={giveBonusAction} resetOnSuccess className="grid gap-2 sm:grid-cols-[1.2fr_.6fr_1.6fr_auto] sm:items-end">
      <Field label="Give to" htmlFor="bo-to">
        <Select id="bo-to" name="target" defaultValue="">
          <option value="" disabled>Choose</option>
          <optgroup label="Whole Cape">{activeCapes(capeCount).map((c) => <option key={c} value={`cape:${c}`}>{capeNames[c]}</option>)}</optgroup>
          <optgroup label="A person">{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
        </Select>
      </Field>
      <Field label="Points" htmlFor="bo-pts"><Input id="bo-pts" name="points" type="number" min={1} max={100} defaultValue={10} /></Field>
      <Field label="For" htmlFor="bo-why"><Input id="bo-why" name="reason" maxLength={140} placeholder="Drove supplies to the hospital" /></Field>
      <SubmitButton>Give bonus</SubmitButton>
    </ActionForm>
  );
}

export function ResortForm({ capeCount, people, capeNames }: { capeCount: 2 | 4; people: { id: string; name: string; cape: string | null }[]; capeNames: Record<string, string> }) {
  return (
    <ActionForm action={resortMembersAction} className="space-y-3">
      <ul className="divide-y divide-line rounded-xl border border-line">
        {people.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <input type="hidden" name="userId" value={p.id} />
            <span className="text-sm font-medium">{p.name}</span>
            <Select name={`cape_${p.id}`} aria-label={`${p.name}'s Cape`} defaultValue={p.cape ?? ""} className="max-w-[180px]">
              <option value="">Not sorted (re-take quiz)</option>
              {activeCapes(capeCount).map((c: Cape) => <option key={c} value={c}>{capeNames[c]}</option>)}
            </Select>
          </li>
        ))}
      </ul>
      <SubmitButton variant="secondary">Save Capes</SubmitButton>
    </ActionForm>
  );
}

export function CaptainForm({ cape, capeName, members, current }: { cape: Cape; capeName: string; members: { id: string; name: string }[]; current: string | null }) {
  return (
    <ActionForm action={setCaptainAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="cape" value={cape} />
      <Field label={`${CAPES[cape].emoji} ${capeName} captain`} htmlFor={`cap-${cape}`} className="min-w-[200px] flex-1">
        <Select id={`cap-${cape}`} name="userId" defaultValue={current ?? ""}>
          <option value="" disabled>Choose</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
      </Field>
      <SubmitButton variant="secondary">Set</SubmitButton>
    </ActionForm>
  );
}

export function ChallengeForm() {
  // Dates in Eastern time, same as the server uses for "this week".
  const ny = (t: number) => new Date(t).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const today = ny(Date.now()), week = ny(Date.now() + 6 * 86400000);
  return (
    <ActionForm action={createChallengeAction} resetOnSuccess className="grid gap-2 sm:grid-cols-2">
      <Field label="Challenge" htmlFor="ch-title"><Input id="ch-title" name="title" maxLength={80} placeholder="Most Instagram story shares" /></Field>
      <Field label="Points for the winning Cape" htmlFor="ch-pts"><Input id="ch-pts" name="points" type="number" min={1} max={100} defaultValue={10} /></Field>
      <Field label="Details" htmlFor="ch-det" className="sm:col-span-2"><Textarea id="ch-det" name="details" rows={2} maxLength={400} placeholder="How it's judged" /></Field>
      <Field label="Starts" htmlFor="ch-s"><Input id="ch-s" name="startsOn" type="date" defaultValue={today} /></Field>
      <Field label="Ends" htmlFor="ch-e"><Input id="ch-e" name="endsOn" type="date" defaultValue={week} /></Field>
      <div className="sm:col-span-2"><SubmitButton>Post challenge</SubmitButton></div>
    </ActionForm>
  );
}

export function DecideChallenge({ id, capes }: { id: string; capes: { cape: Cape; name: string }[] }) {
  const { pending, run } = useRun();
  return (
    <div className="flex flex-wrap gap-1.5">
      {capes.map((c) => <Button key={c.cape} size="sm" variant="secondary" disabled={pending} onClick={() => { if (window.confirm(`${c.name} wins this challenge?`)) run(() => decideChallengeAction(id, c.cape)); }}>{CAPES[c.cape].emoji} {c.name} won</Button>)}
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (window.confirm("Remove this challenge?")) run(() => deleteChallengeAction(id)); }}>Remove</Button>
    </div>
  );
}

export function ClaimReview({ id, points }: { id: string; points: number }) {
  const [pts, setPts] = useState(points);
  const { pending, run } = useRun();
  return (
    <div className="flex items-center gap-1.5">
      <Input type="number" min={1} max={100} value={pts} onChange={(e) => setPts(Number(e.target.value))} aria-label="Points" className="w-20" />
      <Button size="sm" disabled={pending} onClick={() => run(() => reviewClaimAction(id, true, pts))}>Approve</Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => reviewClaimAction(id, false))}>Decline</Button>
    </div>
  );
}

export function NightForm() {
  return (
    <ActionForm action={createNightAction} className="grid gap-2 sm:grid-cols-[1.4fr_1fr_.6fr_auto] sm:items-end">
      <Field label="Name" htmlFor="tn-title"><Input id="tn-title" name="title" defaultValue="Cape vs Cape Trivia Night" maxLength={60} /></Field>
      <Field label="Category" htmlFor="tn-cat"><Select id="tn-cat" name="category" defaultValue=""><option value="">Mix of everything</option>{TRIVIA_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}</Select></Field>
      <Field label="Questions" htmlFor="tn-n"><Input id="tn-n" name="count" type="number" min={5} max={20} defaultValue={10} /></Field>
      <SubmitButton>Set up</SubmitButton>
    </ActionForm>
  );
}

export function QuestionForm() {
  return (
    <ActionForm action={addQuestionAction} resetOnSuccess className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
        <Field label="Category" htmlFor="q-cat"><Select id="q-cat" name="category" defaultValue="cfk">{TRIVIA_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}</Select></Field>
        <Field label="Question" htmlFor="q-q"><Input id="q-q" name="question" maxLength={140} placeholder="How many boxes did we deliver in our first round?" /></Field>
      </div>
      <fieldset>
        <legend className="label">Answers (tick the right one)</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <label key={i} className="flex items-center gap-2"><input type="radio" name="answer" value={i} defaultChecked={i === 0} aria-label={`Answer ${i + 1} is right`} /><Input name={`choice${i}`} maxLength={40} placeholder={`Answer ${i + 1}`} aria-label={`Answer ${i + 1}`} /></label>
          ))}
        </div>
      </fieldset>
      <SubmitButton>Add question</SubmitButton>
    </ActionForm>
  );
}

export function QuestionToggle({ id, active }: { id: string; active: boolean }) {
  const { pending, run } = useRun();
  return <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => toggleQuestionAction(id, !active))}>{active ? "Turn off" : "Turn on"}</Button>;
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

export function ReportPlaneButton({ id, className }: { id: string; className?: string }) {
  const { pending, run } = useRun();
  return <button type="button" disabled={pending} onClick={() => { if (window.confirm("Report this plane to an admin? It will be hidden.")) run(() => reportPlaneAction(id)); }} className={className ?? "text-xs font-semibold underline opacity-70 hover:opacity-100"}>Report</button>;
}
