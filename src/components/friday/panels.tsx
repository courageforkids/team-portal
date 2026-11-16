"use client";
import { useActionState, useState, useTransition } from "react";
import { Check, ShieldAlert, Trash2, X, BadgeCheck, Power } from "lucide-react";
import { approveAction, cancelJobAction, deleteMemoryAction, queueObjectiveAction, rejectAction, saveSettingsAction, setPausedAction, verifyMemoryAction, type Result } from "@/app/friday/actions";

function Msg({ r }: { r: Result | null }) {
  if (!r) return null;
  return <p role={r.ok ? "status" : "alert"} className={`mt-2 text-sm ${r.ok ? "text-fr-ok" : "text-fr-bad"}`}>{r.message}</p>;
}

export type ActionRow = { id: string; tool: string; level: number; summary: string; reason: string; impact: string; risks: string; input: string; createdAt: string };

export function ApprovalCard({ a }: { a: ActionRow }) {
  const [pw, setPw] = useState("");
  const [r, setR] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  return (
    <li className="fr-panel p-4">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-fr-gold" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="fr-eyebrow !text-fr-gold">Level {a.level} · {a.tool}</div>
          <p className="mt-1 font-semibold">{a.summary}</p>
          {a.reason && <p className="mt-1 text-sm text-fr-muted"><b className="text-fr-fg">Why:</b> {a.reason}</p>}
          {a.impact && <p className="mt-1 text-sm text-fr-muted"><b className="text-fr-fg">Impact:</b> {a.impact}</p>}
          {a.risks && <p className="mt-1 text-sm text-fr-muted"><b className="text-fr-fg">Risks:</b> {a.risks}</p>}
          <details className="mt-2 text-sm"><summary className="cursor-pointer text-fr-arc">Exact change</summary><pre className="mt-2 overflow-x-auto rounded-lg bg-fr-deep p-3 font-mono text-xs text-fr-arc-2">{a.input}</pre></details>
          <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { setR(await approveAction(a.id, pw)); setPw(""); }); }}>
            <div className="min-w-[180px] flex-1">
              <label htmlFor={`pw-${a.id}`} className="mb-1 block text-xs text-fr-muted">Your password to approve</label>
              <input id={`pw-${a.id}`} type="password" autoComplete="current-password" className="fr-input" value={pw} onChange={(e) => setPw(e.target.value)} required />
            </div>
            <button className="fr-btn fr-btn-gold" disabled={pending || !pw}><Check className="h-4 w-4" aria-hidden />Approve</button>
            <button type="button" className="fr-btn fr-btn-ghost" disabled={pending} onClick={() => start(async () => setR(await rejectAction(a.id)))}><X className="h-4 w-4" aria-hidden />Reject</button>
          </form>
          <Msg r={r} />
        </div>
      </div>
    </li>
  );
}

export function EmergencyStop({ paused }: { paused: boolean }) {
  const [pending, start] = useTransition();
  const [r, setR] = useState<Result | null>(null);
  return (
    <div>
      <button type="button" className={`fr-btn w-full ${paused ? "fr-btn-primary" : "fr-btn-danger"}`} disabled={pending}
        onClick={() => start(async () => setR(await setPausedAction(!paused)))}>
        <Power className="h-4 w-4" aria-hidden />{paused ? "Resume Friday" : "Emergency stop"}
      </button>
      <Msg r={r} />
    </div>
  );
}

export function CancelJob({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return <button type="button" className="fr-btn fr-btn-ghost !min-h-8 !px-2 text-xs" disabled={pending} onClick={() => start(async () => { await cancelJobAction(id); })}>Cancel</button>;
}

export function ObjectiveForm() {
  const [r, action, pending] = useActionState<Result | null, FormData>(queueObjectiveAction, null);
  return (
    <form action={action} className="space-y-2">
      <label htmlFor="objective" className="block text-sm text-fr-muted">Give Friday an objective to work on in the background</label>
      <textarea id="objective" name="objective" rows={3} className="fr-input" placeholder="Research five sponsors that donate to pediatric cancer nonprofits and draft an outreach email for each." />
      <button className="fr-btn fr-btn-primary" disabled={pending}>Queue objective</button>
      <Msg r={r} />
    </form>
  );
}

export function MemoryActions({ id, verified }: { id: string; verified: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-1">
      {!verified && <button type="button" title="Mark as verified" className="fr-btn fr-btn-ghost !min-h-8 !px-2" disabled={pending} onClick={() => start(async () => { await verifyMemoryAction(id); })}><BadgeCheck className="h-4 w-4" aria-hidden /><span className="sr-only">Mark as verified</span></button>}
      <button type="button" title="Delete" className="fr-btn fr-btn-ghost !min-h-8 !px-2" disabled={pending} onClick={() => start(async () => { if (confirm("Delete this memory?")) await deleteMemoryAction(id); })}><Trash2 className="h-4 w-4" aria-hidden /><span className="sr-only">Delete</span></button>
    </div>
  );
}

export type SettingsView = { nightlyHour: number; briefingHour: number; quietStart: number; quietEnd: number; monthlyBudgetDollars: number; timezone: string; permissions: Record<string, boolean> };

export function SettingsForm({ s, permissionLabels }: { s: SettingsView; permissionLabels: Record<string, string> }) {
  const [r, action, pending] = useActionState<Result | null, FormData>(saveSettingsAction, null);
  const hour = (name: keyof SettingsView, label: string) => (
    <div>
      <label htmlFor={name} className="mb-1 block text-xs text-fr-muted">{label}</label>
      <select id={name} name={name} defaultValue={String(s[name])} className="fr-input">
        {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{new Date(2000, 0, 1, h).toLocaleTimeString("en-US", { hour: "numeric" })}</option>)}
      </select>
    </div>
  );
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {hour("nightlyHour", "Overnight work starts")}
        {hour("briefingHour", "Morning briefing ready by")}
        {hour("quietStart", "Quiet hours start")}
        {hour("quietEnd", "Quiet hours end")}
        <div>
          <label htmlFor="monthlyBudgetDollars" className="mb-1 block text-xs text-fr-muted">Monthly AI spending cap (USD)</label>
          <input id="monthlyBudgetDollars" name="monthlyBudgetDollars" type="number" min={1} max={500} step={1} defaultValue={s.monthlyBudgetDollars} className="fr-input" />
        </div>
        <div>
          <label htmlFor="timezone" className="mb-1 block text-xs text-fr-muted">Time zone</label>
          <input id="timezone" name="timezone" defaultValue={s.timezone} className="fr-input" />
        </div>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-semibold">Level 2 standing permissions</legend>
        {Object.entries(permissionLabels).map(([k, label]) => (
          <label key={k} className="flex items-start gap-2 text-sm"><input type="checkbox" name={`perm_${k}`} defaultChecked={!!s.permissions[k]} className="mt-1 accent-[var(--color-fr-arc)]" />{label}</label>
        ))}
        <div>
          <label htmlFor="perm-pw" className="mb-1 mt-2 block text-xs text-fr-muted">Password (required only when changing permissions)</label>
          <input id="perm-pw" name="password" type="password" autoComplete="current-password" className="fr-input" />
        </div>
      </fieldset>
      <button className="fr-btn fr-btn-primary" disabled={pending}>Save settings</button>
      <Msg r={r} />
    </form>
  );
}
