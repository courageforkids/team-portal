"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileUp, Loader2, Play, Send, ShieldAlert, X, CalendarPlus, RotateCcw, MoreHorizontal, Ban, Award, Undo2, Trash2, Pencil } from "lucide-react";
import Link from "next/link";
import { ActionForm, Field, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { Button, buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmAction } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/cn";
import {
  commentAction, deleteTaskAction, requestExtensionAction, reviewAction, setStatusAction, submitAction, withdrawExtensionAction, decideExtensionAction,
} from "@/server/task-actions";
import type { SubmissionType, ChecklistItem } from "@/db/schema";
import type { TaskStatus } from "@/lib/task-meta";

/* ───────── Submission form (assignee) ───────── */

function fmtSize(n: number) { return n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`; }

export function SubmitPanel({ taskId, types, checklist, requiresReview, isRevision, accept }: {
  taskId: string; types: SubmissionType[]; checklist: ChecklistItem[]; requiresReview: boolean; isRevision: boolean; accept: string;
}) {
  const [picked, setPicked] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const syncInput = (list: File[]) => {
    const dt = new DataTransfer();
    list.forEach((f) => dt.items.add(f));
    if (inputRef.current) inputRef.current.files = dt.files;
    setPicked(list);
  };
  const needs = (t: SubmissionType) => types.includes(t);
  return (
    <ActionForm action={submitAction} onSuccess={() => setPicked([])} resetOnSuccess className="space-y-5">
      <input type="hidden" name="taskId" value={taskId} />
      {needs("checklist") && checklist.length > 0 && (
        <fieldset>
          <legend className="label">Checklist <span className="text-bad">*</span></legend>
          <div className="space-y-1 rounded-xl border border-line p-2">
            {checklist.map((c) => (
              <label key={c.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-surface-2">
                <input type="checkbox" name="checklist" value={c.id} className="h-5 w-5 accent-[var(--brand)]" />
                <span className="text-sm">{c.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {needs("text") && (
        <Field label={<>Your response <span className="text-bad">*</span></>} htmlFor="text"><Textarea id="text" name="text" rows={5} placeholder="Write your response here…" /></Field>
      )}
      {(needs("file") || !types.length) && (
        <div>
          <span className="label">Files {needs("file") && <span className="text-bad">*</span>}</span>
          <label htmlFor="files" className="flex min-h-[96px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line-strong bg-surface-2/50 px-4 py-5 text-center transition hover:border-brand/50 hover:bg-brand-soft/50">
            <FileUp className="h-6 w-6 text-brand-ink" aria-hidden />
            <span className="text-sm font-semibold">Choose files or take a photo</span>
            <span className="text-xs text-muted">Images, PDF, Office files, video · up to 25 MB each</span>
          </label>
          <input ref={inputRef} id="files" name="files" type="file" multiple accept={accept} className="sr-only"
            onChange={(e) => setPicked(Array.from(e.target.files ?? []))} />
          {picked.length > 0 && (
            <ul className="mt-2 space-y-1">
              {picked.map((f, i) => (
                <li key={i} className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                  <FileUp className="h-4 w-4 shrink-0 text-muted" /><span className="min-w-0 flex-1 truncate">{f.name}</span><span className="text-xs text-muted">{fmtSize(f.size)}</span>
                  <button type="button" aria-label={`Remove ${f.name}`} className="rounded p-1 text-muted hover:text-fg" onClick={() => syncInput(picked.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          )}
          {isRevision && needs("file") && <p className="hint">Your earlier files are kept in the history. Upload updated versions here.</p>}
        </div>
      )}
      {needs("link") && (
        <Field label={<>Links <span className="text-bad">*</span></>} htmlFor="links" hint="One per line. Make sure sharing is turned on.">
          <Textarea id="links" name="links" rows={2} placeholder="https://docs.google.com/…" inputMode="url" />
        </Field>
      )}
      <Field label="Note for your reviewer" htmlFor="note" hint="Optional"><Input id="note" name="note" placeholder="Anything they should know?" /></Field>
      <SubmitButton size="lg" className="w-full sm:w-auto" pendingText="Submitting…">
        <Send className="h-4 w-4" />{requiresReview ? (isRevision ? "Submit revision for review" : "Submit for review") : "Submit & complete"}
      </SubmitButton>
    </ActionForm>
  );
}

/* ───────── Review form (admin / reviewer) ───────── */

export function ReviewPanel({ taskId, compact, onDone }: { taskId: string; compact?: boolean; onDone?: () => void }) {
  return (
    <ActionForm action={reviewAction} resetOnSuccess onSuccess={onDone} className="space-y-3">
      <input type="hidden" name="taskId" value={taskId} />
      <Field label="Feedback" htmlFor={`fb-${taskId}`} hint="Optional when approving. Required when asking for a revision — say exactly what to change.">
        <Textarea id={`fb-${taskId}`} name="feedback" rows={compact ? 2 : 3} placeholder="Great work! / Please update…" />
      </Field>
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="decision" value="approved" pendingText="Saving…" className="flex-1 sm:flex-none"><CheckCircle2 className="h-4 w-4" />Approve</SubmitButton>
        <SubmitButton name="decision" value="revision_requested" variant="secondary" pendingText="Saving…" className="flex-1 sm:flex-none"><RotateCcw className="h-4 w-4" />Request revision</SubmitButton>
      </div>
    </ActionForm>
  );
}

/* ───────── Assignee status controls ───────── */

export function StatusControls({ taskId, status }: { taskId: string; status: TaskStatus }) {
  const [blockOpen, setBlockOpen] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      {(status === "not_started" || status === "revision_requested") && (
        <ActionForm action={setStatusAction} showErrorInline={false}>
          <input type="hidden" name="taskId" value={taskId} /><input type="hidden" name="status" value="in_progress" />
          <SubmitButton variant="secondary" size="sm"><Play className="h-3.5 w-3.5" />Start working</SubmitButton>
        </ActionForm>
      )}
      {status === "blocked" ? (
        <ActionForm action={setStatusAction} showErrorInline={false}>
          <input type="hidden" name="taskId" value={taskId} /><input type="hidden" name="status" value="in_progress" />
          <SubmitButton variant="secondary" size="sm"><Play className="h-3.5 w-3.5" />I'm unblocked</SubmitButton>
        </ActionForm>
      ) : ["not_started", "in_progress", "revision_requested"].includes(status) && (
        <Button variant="ghost" size="sm" onClick={() => setBlockOpen(true)}><ShieldAlert className="h-3.5 w-3.5" />I'm blocked</Button>
      )}
      <Dialog open={blockOpen} onClose={() => setBlockOpen(false)} title="Flag this task as blocked" description="An administrator will be notified so they can help." size="sm">
        <ActionForm action={setStatusAction} onSuccess={() => setBlockOpen(false)} className="space-y-4">
          <input type="hidden" name="taskId" value={taskId} /><input type="hidden" name="status" value="blocked" />
          <Field label="What's in the way?" htmlFor="reason"><Textarea id="reason" name="reason" rows={3} required placeholder="e.g. Waiting on the hospital to reply" /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setBlockOpen(false)}>Cancel</Button><SubmitButton>Flag as blocked</SubmitButton></div>
        </ActionForm>
      </Dialog>
    </div>
  );
}

/* ───────── Extension request ───────── */

export function ExtensionRequest({ taskId, minValue, pending }: { taskId: string; minValue: string; pending?: { id: string; label: string } | null }) {
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  if (pending) return (
    <div className="rounded-lg bg-surface-2 p-3 text-sm">
      <div className="font-medium">Extension requested</div>
      <div className="text-muted">{pending.label} · waiting for a decision</div>
      <button className="mt-2 text-xs font-semibold text-brand-ink hover:underline" disabled={busy}
        onClick={() => start(async () => { const r = await withdrawExtensionAction(pending.id); toast.push(r.ok ? "success" : "error", r.ok ? r.message ?? "Withdrawn" : r.error); router.refresh(); })}>
        {busy ? "Withdrawing…" : "Withdraw request"}
      </button>
    </div>
  );
  return (
    <>
      <Button variant="secondary" size="sm" className="w-full" onClick={() => setOpen(true)}><CalendarPlus className="h-4 w-4" />Request more time</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Request an extension" description="No personal or medical details needed — a short reason is plenty." size="sm">
        <ActionForm action={requestExtensionAction} onSuccess={() => setOpen(false)} className="space-y-4">
          <input type="hidden" name="taskId" value={taskId} />
          <Field label="New deadline you're asking for" htmlFor="requestedDueAt"><Input id="requestedDueAt" name="requestedDueAt" type="datetime-local" min={minValue} required /></Field>
          <Field label="Brief explanation" htmlFor="ext-reason"><Input id="ext-reason" name="reason" required maxLength={500} placeholder="e.g. Big test this week" /></Field>
          <Field label="Anything else?" htmlFor="ext-note" hint="Optional"><Textarea id="ext-note" name="note" rows={2} /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><SubmitButton>Send request</SubmitButton></div>
        </ActionForm>
      </Dialog>
    </>
  );
}

export function ExtensionDecision({ requestId, timezone, requestedValue }: { requestId: string; timezone: string; requestedValue: string }) {
  return (
    <ActionForm action={decideExtensionAction} className="mt-3 space-y-3">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="timezone" value={timezone} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="New deadline" htmlFor={`nd-${requestId}`} hint="Defaults to what they asked for"><Input id={`nd-${requestId}`} name="newDueAt" type="datetime-local" defaultValue={requestedValue} /></Field>
        <Field label="Note (optional)" htmlFor={`dn-${requestId}`}><Input id={`dn-${requestId}`} name="decisionNote" /></Field>
      </div>
      <div className="flex gap-2">
        <SubmitButton size="sm" name="decision" value="approve">Approve</SubmitButton>
        <SubmitButton size="sm" variant="secondary" name="decision" value="decline">Decline</SubmitButton>
      </div>
    </ActionForm>
  );
}

/* ───────── Admin overflow menu ───────── */

export function AdminTaskMenu({ taskId, status }: { taskId: string; status: TaskStatus }) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<null | "canceled" | "excused" | "approved" | "not_started">(null);
  const labels = { canceled: "Cancel task", excused: "Excuse this task", approved: "Mark as completed", not_started: "Reopen task" } as const;
  const help = {
    canceled: "Canceled tasks are hidden from active lists and don't count toward anyone's metrics.",
    excused: "Excused tasks are closed without counting against the member (for example, an approved absence).",
    approved: "Records the task as approved/completed without a submission review.",
    not_started: "Moves the task back to Not started so it can be worked on again.",
  } as const;
  const closed = ["approved", "canceled", "excused"].includes(status);
  return (
    <div className="relative">
      <div className="flex gap-2">
        <Link href={`/tasks/${taskId}/edit`} className={buttonClass("secondary", "md")}><Pencil className="h-4 w-4" />Edit</Link>
        <Button variant="secondary" size="icon" aria-label="More actions" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="h-10 w-10"><MoreHorizontal className="h-4 w-4" /></Button>
      </div>
      {open && (
        <div role="menu" className="animate-pop absolute right-0 z-30 mt-2 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-pop" onMouseLeave={() => setOpen(false)}>
          {!closed && <MenuItem icon={Award} onClick={() => { setDialog("approved"); setOpen(false); }}>Mark as completed</MenuItem>}
          {!closed && <MenuItem icon={Ban} onClick={() => { setDialog("excused"); setOpen(false); }}>Excuse</MenuItem>}
          {!closed && <MenuItem icon={X} onClick={() => { setDialog("canceled"); setOpen(false); }}>Cancel task</MenuItem>}
          {closed && <MenuItem icon={Undo2} onClick={() => { setDialog("not_started"); setOpen(false); }}>Reopen</MenuItem>}
        </div>
      )}
      {dialog && (
        <Dialog open onClose={() => setDialog(null)} title={labels[dialog]} description={help[dialog]} size="sm">
          <ActionForm action={setStatusAction} onSuccess={() => setDialog(null)} className="space-y-4">
            <input type="hidden" name="taskId" value={taskId} /><input type="hidden" name="status" value={dialog} />
            {dialog !== "not_started" && <Field label="Reason (optional, shared with the assignee)" htmlFor="sreason"><Input id="sreason" name="reason" /></Field>}
            <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setDialog(null)}>Back</Button><SubmitButton>{labels[dialog]}</SubmitButton></div>
          </ActionForm>
        </Dialog>
      )}
      <div className="mt-2 hidden" />
    </div>
  );
}
function MenuItem({ icon: Icon, children, onClick, danger }: { icon: typeof X; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button role="menuitem" onClick={onClick} className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-surface-2", danger ? "text-bad" : "text-fg-2")}>
      <Icon className="h-4 w-4" />{children}
    </button>
  );
}

export function DeleteTaskButton({ taskId }: { taskId: string }) {
  return (
    <ConfirmAction trigger={<><Trash2 className="h-4 w-4" />Delete task</>} triggerVariant="ghost" title="Delete this task?" requireText="DELETE"
      description="This permanently removes the task, its submissions, files and history. To keep the record, cancel it instead." confirmLabel="Delete permanently"
      action={() => deleteTaskAction(taskId)} />
  );
}

/* ───────── Comments ───────── */

export function CommentForm({ taskId }: { taskId: string }) {
  return (
    <ActionForm action={commentAction} resetOnSuccess className="flex items-end gap-2" showErrorInline={false}>
      <input type="hidden" name="taskId" value={taskId} />
      <label htmlFor="comment" className="sr-only">Add a comment</label>
      <Textarea id="comment" name="body" rows={1} placeholder="Ask a question or leave a note…" className="min-h-10 flex-1" required />
      <SubmitButton aria-label="Post comment" className="h-10 shrink-0"><Send className="h-4 w-4" /></SubmitButton>
    </ActionForm>
  );
}

export function Spinner() { return <Loader2 className="h-4 w-4 animate-spin" />; }
