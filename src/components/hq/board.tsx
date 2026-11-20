"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { ActionForm, Field, Input, Textarea, Select, Checkbox, SubmitButton } from "@/components/ui/form";
import { ConfirmAction } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/cn";
import { CONTACT_TYPES, GIFT_KINDS, GRANT_OPEN, GRANT_STATUSES, HQ_FIELDS, HQ_TABS, TASK_AREAS, shortDate, type HqKind } from "@/lib/hq";
import { deleteHqItemAction, importHqAction, saveHqItemAction, setHqDoneAction } from "@/server/hq-actions";

export type HqRow = {
  id: string; kind: HqKind; title: string; subtitle: string; category: string; date: string | null; amount: number | null;
  nextStep: string; person: string; link: string; notes: string; extra: Record<string, string | boolean | null>; done: boolean;
};

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 ? 2 : 0 });
const OPTIONS: Partial<Record<HqKind, string[]>> = { task: TASK_AREAS, grant: GRANT_STATUSES, gift: GIFT_KINDS, contact: CONTACT_TYPES };
const NOUN: Record<HqKind, string> = { task: "task", grant: "grant", gift: "gift", contact: "person" };

/** "Add" button that opens the form for whichever tab is showing. */
export function HqAddButton({ kind }: { kind: HqKind }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="focus-ring inline-flex h-10 items-center gap-2 rounded-full bg-hq-ink px-4 text-sm font-semibold text-hq-paper transition hover:opacity-90">
        <Plus className="h-4 w-4" aria-hidden />Add {NOUN[kind]}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Add a ${NOUN[kind]}`}>
        <HqForm kind={kind} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

/** Brings in an export from the old Courage HQ page (a .json file). */
export function HqImport({ prominent }: { prominent: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className={prominent
          ? "focus-ring inline-flex h-10 items-center gap-2 rounded-full border border-hq-line bg-hq-card px-4 text-sm font-semibold text-hq-ink hover:bg-hq-paper"
          : "focus-ring inline-flex h-10 items-center gap-1.5 rounded-full px-2 text-[13px] font-semibold text-hq-muted hover:text-hq-ink"}>
        <Upload className="h-4 w-4" aria-hidden />Import from old HQ
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Import from old HQ" description="Paste the HQ data you copied, or pick the export file. Importing again just updates what's here, so nothing doubles up.">
        <ActionForm action={importHqAction} onSuccess={() => setOpen(false)} className="space-y-4">
          <Field label="Paste HQ data" htmlFor="hq-import-paste"><Textarea id="hq-import-paste" name="json" rows={4} placeholder="Tap and hold, then Paste" className="font-mono text-xs" /></Field>
          <Field label="Or pick the export file" htmlFor="hq-import-file"><Input id="hq-import-file" name="file" type="file" accept=".json,application/json" /></Field>
          <div className="flex justify-end"><SubmitButton pendingText="Importing…">Import</SubmitButton></div>
        </ActionForm>
      </Dialog>
    </>
  );
}

export function HqTabs({ active, counts }: { active: HqKind; counts: Record<HqKind, number> }) {
  return (
    <nav className="flex gap-1 overflow-x-auto rounded-full bg-hq-card p-1 shadow-soft" aria-label="HQ sections">
      {HQ_TABS.map((t) => (
        <Link key={t.key} href={`/admin/hq?tab=${t.key}`} scroll={false} aria-current={t.key === active ? "page" : undefined}
          className={cn("focus-ring flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition",
            t.key === active ? "bg-hq-banner text-hq-banner-fg" : "text-hq-muted hover:text-hq-ink")}>
          {t.label}<span className={cn("rounded-full px-1.5 text-[11px]", t.key === active ? "bg-white/15" : "bg-hq-paper")}>{counts[t.key]}</span>
        </Link>
      ))}
    </nav>
  );
}

export function HqList({ kind, rows, today }: { kind: HqKind; rows: HqRow[]; today: string }) {
  const open = rows.filter((r) => !isClosed(r)), closed = rows.filter(isClosed);
  const [showClosed, setShowClosed] = useState(false);
  const closedLabel = kind === "gift" ? "Thanked" : kind === "grant" ? "Won or declined" : "Done";
  if (!rows.length) return <p className="rounded-2xl border border-dashed border-hq-line p-8 text-center text-sm text-hq-muted">Nothing here yet. Use “Add {NOUN[kind]}” above.</p>;
  return (
    <div className="space-y-2">
      {open.length === 0 && <p className="rounded-2xl border border-dashed border-hq-line p-6 text-center text-sm text-hq-muted">All caught up here.</p>}
      <ul className="space-y-2">{open.map((r) => <HqRowItem key={r.id} r={r} today={today} />)}</ul>
      {closed.length > 0 && (
        <div className="pt-2">
          <button type="button" onClick={() => setShowClosed((v) => !v)} className="focus-ring h-10 rounded-full px-3 text-[13px] font-semibold text-hq-muted hover:text-hq-ink">
            {showClosed ? "Hide" : "Show"} {closedLabel.toLowerCase()} ({closed.length})
          </button>
          {showClosed && <ul className="mt-2 space-y-2">{closed.map((r) => <HqRowItem key={r.id} r={r} today={today} />)}</ul>}
        </div>
      )}
    </div>
  );
}

function isClosed(r: HqRow) {
  if (r.kind === "grant") return !GRANT_OPEN.includes(r.category) && r.category !== "";
  if (r.kind === "contact") return false;
  return r.done;
}

function HqRowItem({ r, today }: { r: HqRow; today: string }) {
  const [busy, start] = useTransition();
  const [edit, setEdit] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const canCheck = r.kind === "task" || r.kind === "gift";
  const toggle = () => start(async () => {
    const res = await setHqDoneAction(r.id, !r.done);
    toast.push(res.ok ? "success" : "error", res.ok ? res.message ?? "" : res.error);
    router.refresh();
  });
  const late = !!r.date && r.date < today && !isClosed(r) && r.kind !== "gift";
  const soon = !!r.date && !late && r.date <= addDaysIso(today, 3) && !isClosed(r) && r.kind !== "gift";
  const meta = [r.category, r.kind === "task" ? r.person : r.subtitle, r.kind === "task" ? r.subtitle : ""].filter(Boolean);
  const checkLabel = r.kind === "gift" ? (r.done ? "Mark as not thanked" : "Mark as thanked") : r.done ? "Reopen" : "Mark done";
  return (
    <li className="flex items-start gap-3 rounded-2xl bg-hq-card p-3 shadow-soft sm:items-center sm:px-4">
      {canCheck ? (
        <button type="button" onClick={toggle} disabled={busy} aria-label={`${checkLabel}: ${r.title}`} title={checkLabel}
          className={cn("focus-ring mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 transition sm:mt-0",
            r.done ? "border-hq-banner bg-hq-banner text-hq-banner-fg" : "border-hq-line text-transparent hover:border-hq-banner hover:text-hq-muted")}>
          <Check className="h-4 w-4" aria-hidden />
        </button>
      ) : <span aria-hidden className={cn("mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full font-display text-base font-bold sm:mt-0", r.kind === "grant" ? "bg-hq-sage" : "bg-hq-pink")}>{r.title.slice(0, 1)}</span>}
      <div className="min-w-0 flex-1">
        <p className={cn("font-semibold text-hq-ink", r.done && r.kind === "task" && "text-hq-muted line-through")}>{r.title}</p>
        {meta.length > 0 && <p className="mt-0.5 truncate text-[13px] text-hq-muted">{meta.join(" · ")}</p>}
        {(r.nextStep || r.kind === "gift" && r.subtitle) && <p className="mt-1 text-[13px] text-hq-ink/80">{r.kind === "gift" ? r.subtitle : `Next: ${r.nextStep}`}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-2">
        {r.amount !== null && <span className="font-display text-base font-bold tabular-nums text-hq-ink">{money(r.amount)}</span>}
        {r.date && (
          <span className={cn("rounded-full px-2.5 py-1 text-[12px] font-semibold tabular-nums",
            late ? "bg-hq-pink text-hq-ink" : soon ? "bg-hq-butter text-hq-ink" : "bg-hq-paper text-hq-muted")}>
            {late ? `Was ${shortDate(r.date)}` : shortDate(r.date)}
          </span>
        )}
        {r.kind === "grant" && r.extra.rolling === true && !r.date && <span className="rounded-full bg-hq-paper px-2.5 py-1 text-[12px] font-semibold text-hq-muted">Rolling</span>}
        <button type="button" onClick={() => setEdit(true)} aria-label={`Edit ${r.title}`}
          className="focus-ring grid h-10 w-10 place-items-center rounded-full text-hq-muted hover:bg-hq-paper hover:text-hq-ink">
          <Pencil className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <Dialog open={edit} onClose={() => setEdit(false)} title={`Edit ${NOUN[r.kind]}`}>
        <HqForm kind={r.kind} row={r} onDone={() => setEdit(false)} />
      </Dialog>
    </li>
  );
}

function addDaysIso(d: string, n: number) {
  const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10);
}

function HqForm({ kind, row, onDone }: { kind: HqKind; row?: HqRow; onDone: () => void }) {
  const f = HQ_FIELDS[kind];
  const opts = OPTIONS[kind] ?? [];
  const cat = row?.category ?? (kind === "grant" ? "Researching" : kind === "gift" ? "In-kind" : kind === "contact" ? "Sponsor" : "");
  const x = (k: string) => (typeof row?.extra[k] === "string" ? (row.extra[k] as string) : "");
  const p = `hq-${row?.id ?? "new"}`;
  return (
    <div className="space-y-4">
      <ActionForm action={saveHqItemAction} onSuccess={onDone} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="kind" value={kind} />
        {row && <input type="hidden" name="id" value={row.id} />}
        <Field label={f.title} htmlFor={`${p}-title`} required className="sm:col-span-2"><Input id={`${p}-title`} name="title" defaultValue={row?.title} maxLength={200} required /></Field>
        <Field label={f.subtitle} htmlFor={`${p}-sub`} className="sm:col-span-2"><Input id={`${p}-sub`} name="subtitle" defaultValue={row?.subtitle} maxLength={300} /></Field>
        <Field label={f.category} htmlFor={`${p}-cat`}>
          <Select id={`${p}-cat`} name="category" defaultValue={cat}>
            {kind === "task" && <option value="">No area</option>}
            {[...new Set([...opts, ...(cat ? [cat] : [])])].map((o) => <option key={o} value={o}>{o}</option>)}
          </Select>
        </Field>
        <Field label={f.date} htmlFor={`${p}-date`}><Input id={`${p}-date`} name="date" type="date" defaultValue={row?.date ?? ""} /></Field>
        {f.person && <Field label={f.person} htmlFor={`${p}-person`}><Input id={`${p}-person`} name="person" defaultValue={row?.person} maxLength={120} placeholder="Jacob" /></Field>}
        {f.amount && <Field label={f.amount} htmlFor={`${p}-amt`} hint={kind === "gift" ? "Only for money. Donated items are logged without a dollar value." : undefined}>
          <Input id={`${p}-amt`} name="amount" inputMode="decimal" defaultValue={row?.amount ?? ""} placeholder="0" /></Field>}
        {kind === "task" && <Field label="Priority" htmlFor={`${p}-pri`}><Select id={`${p}-pri`} name="x_priority" defaultValue={x("priority") || "Medium"}>{["High", "Medium", "Low"].map((o) => <option key={o}>{o}</option>)}</Select></Field>}
        {f.nextStep && <Field label={f.nextStep} htmlFor={`${p}-next`} className="sm:col-span-2"><Input id={`${p}-next`} name="nextStep" defaultValue={row?.nextStep} maxLength={500} /></Field>}
        {kind === "task" && <>
          <Field label="Deliverable" htmlFor={`${p}-del`} className="sm:col-span-2"><Input id={`${p}-del`} name="x_deliverable" defaultValue={x("deliverable")} /></Field>
          <Field label="Done when" htmlFor={`${p}-dw`} className="sm:col-span-2"><Input id={`${p}-dw`} name="x_doneWhen" defaultValue={x("doneWhen")} /></Field>
        </>}
        {kind === "grant" && <>
          <Field label="Report due" htmlFor={`${p}-rep`}><Input id={`${p}-rep`} name="x_reportDue" type="date" defaultValue={x("reportDue")} /></Field>
          <div className="flex items-end"><Checkbox name="x_rolling" label="Rolling deadline" defaultChecked={row?.extra.rolling === true} /></div>
        </>}
        {kind === "contact" && <>
          <Field label="Email" htmlFor={`${p}-em`}><Input id={`${p}-em`} name="x_email" type="email" defaultValue={x("email")} /></Field>
          <Field label="Phone" htmlFor={`${p}-ph`}><Input id={`${p}-ph`} name="x_phone" defaultValue={x("phone")} /></Field>
          <Field label="Instagram" htmlFor={`${p}-ig`}><Input id={`${p}-ig`} name="x_instagram" defaultValue={x("instagram")} placeholder="@handle" /></Field>
          <Field label="Last contact" htmlFor={`${p}-lc`}><Input id={`${p}-lc`} name="x_lastContact" type="date" defaultValue={x("lastContact")} /></Field>
        </>}
        <Field label="Link" htmlFor={`${p}-link`} className="sm:col-span-2"><Input id={`${p}-link`} name="link" type="url" defaultValue={row?.link} placeholder="https://" /></Field>
        <Field label="Notes" htmlFor={`${p}-notes`} className="sm:col-span-2"><Textarea id={`${p}-notes`} name="notes" rows={3} defaultValue={row?.notes} maxLength={4000} /></Field>
        <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
          {row?.link ? <a href={row.link} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-1.5 text-sm font-semibold text-brand-ink hover:underline"><ExternalLink className="h-4 w-4" aria-hidden />Open link</a> : <span />}
          <SubmitButton>{row ? "Save" : "Add"}</SubmitButton>
        </div>
      </ActionForm>
      {row && (
        <div className="border-t border-line pt-3">
          <ConfirmAction trigger={<><Trash2 className="h-4 w-4" aria-hidden />Delete</>} triggerVariant="ghost"
            title={`Delete “${row.title}”?`} confirmLabel="Delete" description="This can't be undone."
            action={deleteHqItemAction.bind(null, row.id)} />
        </div>
      )}
    </div>
  );
}
