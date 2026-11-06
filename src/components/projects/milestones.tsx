"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Flag, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionForm, Input, SubmitButton } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import type { ActionResult } from "@/lib/action";
import { addMilestone, deleteMilestone, moveMilestone, toggleMilestone, updateMilestone } from "@/app/(app)/projects/actions";
import { fmtDate, DEFAULT_TZ } from "@/lib/dates";
import { fmtDay } from "./meta";
import { useRunAction } from "./use-run";

export type MilestoneItem = { id: string; title: string; dueDate: string | null; completedAt: Date | null };

/** Milestones card body + header. Managers can tick items off; "Edit" mode reveals rename/reorder/delete. */
export function MilestoneList({ projectId, items, canManage, today }: { projectId: string; items: MilestoneItem[]; canManage: boolean; today: string }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [arrange, setArrange] = useState(false);
  const [adding, setAdding] = useState(false);
  const { pending, run } = useRunAction();
  const done = items.filter((m) => m.completedAt).length;

  return (
    <>
      <CardHeader title="Milestones" description={items.length ? `${done} of ${items.length} done` : undefined}
        action={canManage && items.length > 0 && (
          <Button variant={arrange ? "primary" : "ghost"} size="sm" className="h-9" aria-pressed={arrange}
            onClick={() => { setArrange((x) => !x); setEditing(null); }}>
            {arrange ? <><Check className="h-4 w-4" aria-hidden />Done</> : <><Settings2 className="h-4 w-4" aria-hidden />Edit</>}
          </Button>
        )} />
      {items.length === 0 && !adding && (
        <EmptyState compact icon={Flag} title="No milestones yet"
          action={canManage && <Button size="sm" variant="secondary" className="h-10" onClick={() => setAdding(true)}><Plus className="h-4 w-4" aria-hidden />Add milestone</Button>}>
          {canManage ? "Break the project into a few checkpoints so everyone can see what's next." : "The project director will add key checkpoints here."}
        </EmptyState>
      )}
      {items.length > 0 && (
        <ol className="divide-y divide-line border-t border-line" aria-busy={pending}>
          {items.map((m, i) => {
            const isDone = !!m.completedAt;
            const late = !isDone && !!m.dueDate && m.dueDate < today;
            if (editing === m.id)
              return (
                <li key={m.id} className="px-4 py-3 sm:px-5">
                  <MilestoneFields action={updateMilestone.bind(null, m.id)} defaults={m} submitLabel="Save" onDone={() => setEditing(null)} />
                </li>
              );
            return (
              <li key={m.id} className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3">
                {canManage ? (
                  <button type="button" disabled={pending} onClick={() => run(() => toggleMilestone(m.id))}
                    aria-pressed={isDone} aria-label={isDone ? `Mark "${m.title}" not done` : `Mark "${m.title}" done`}
                    className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-lg hover:bg-surface-2">
                    <CheckDot done={isDone} />
                  </button>
                ) : (
                  <span className="grid h-10 w-10 shrink-0 place-items-center"><CheckDot done={isDone} /></span>
                )}
                <div className="min-w-0 flex-1 py-1">
                  <p className={cn("text-sm font-medium leading-snug break-words", isDone ? "text-muted line-through decoration-faint" : "text-fg")}>
                    {m.title}<span className="sr-only">{isDone ? " (done)" : ""}</span>
                  </p>
                  {(m.dueDate || isDone) && (
                    <p className={cn("mt-0.5 text-xs", late ? "text-warn" : "text-muted")}>
                      {isDone ? `Done ${fmtDate(m.completedAt, DEFAULT_TZ, "MMM d")}` : `${late ? "Was due" : "Due"} ${fmtDay(m.dueDate)}`}
                    </p>
                  )}
                </div>
                {canManage && arrange && (
                  <div className="flex shrink-0 items-center">
                    <Button variant="ghost" size="icon" className="h-10 w-9" disabled={pending || i === 0} aria-label={`Move "${m.title}" up`}
                      onClick={() => run(() => moveMilestone(m.id, "up"))}><ArrowUp className="h-4 w-4" aria-hidden /></Button>
                    <Button variant="ghost" size="icon" className="h-10 w-9" disabled={pending || i === items.length - 1} aria-label={`Move "${m.title}" down`}
                      onClick={() => run(() => moveMilestone(m.id, "down"))}><ArrowDown className="h-4 w-4" aria-hidden /></Button>
                    <Button variant="ghost" size="icon" className="h-10 w-9" aria-label={`Rename "${m.title}"`} onClick={() => setEditing(m.id)}>
                      <Pencil className="h-4 w-4" aria-hidden />
                    </Button>
                    <ConfirmAction triggerVariant="ghost" triggerSize="md"
                      trigger={<><Trash2 className="h-4 w-4" aria-hidden /><span className="sr-only">Delete &quot;{m.title}&quot;</span></>}
                      title="Delete milestone?" description={<>&ldquo;{m.title}&rdquo; will be removed from this project.</>} confirmLabel="Delete"
                      action={() => deleteMilestone(m.id)} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {canManage && (adding ? (
        <div className="border-t border-line px-4 py-3 sm:px-5">
          <MilestoneFields action={addMilestone.bind(null, projectId)} submitLabel="Add milestone" onDone={() => setAdding(false)} reset />
        </div>
      ) : items.length > 0 && (
        <div className="border-t border-line px-2.5 py-1.5 sm:px-3">
          <Button variant="ghost" size="sm" className="h-10" onClick={() => setAdding(true)}><Plus className="h-4 w-4" aria-hidden />Add milestone</Button>
        </div>
      ))}
    </>
  );
}

function CheckDot({ done }: { done: boolean }) {
  return (
    <span className={cn("grid h-5 w-5 place-items-center rounded-full border-2 transition",
      done ? "border-ok bg-ok text-white" : "border-line-strong bg-surface")} aria-hidden>
      {done && <Check className="h-3 w-3" strokeWidth={3} />}
    </span>
  );
}

function MilestoneFields({ action, defaults, submitLabel, onDone, reset }: {
  action: (prev: unknown, fd: FormData) => Promise<ActionResult>; defaults?: MilestoneItem; submitLabel: string;
  onDone: () => void; reset?: boolean;
}) {
  const id = defaults?.id ?? "new";
  return (
    <ActionForm action={action} onSuccess={onDone} resetOnSuccess={reset} className="space-y-2">
      <div>
        <label htmlFor={`ms-title-${id}`} className="label">Milestone</label>
        <Input id={`ms-title-${id}`} name="title" required maxLength={160} defaultValue={defaults?.title} placeholder="e.g. Boxes delivered" autoFocus />
      </div>
      <div>
        <label htmlFor={`ms-due-${id}`} className="label">Due date <span className="font-normal text-muted">(optional)</span></label>
        <Input id={`ms-due-${id}`} name="dueDate" type="date" defaultValue={defaults?.dueDate ?? ""} />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" className="h-10" onClick={onDone}>Cancel</Button>
        <SubmitButton size="sm" className="h-10" pendingText="Saving…">{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}
