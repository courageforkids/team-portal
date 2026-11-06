import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { CheckCircle2, Circle, MailCheck, MailX, Inbox, Power, PowerOff, ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/db";
import { emailOutbox } from "@/db/schema";
import { requireAdmin } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmAction } from "@/components/ui/confirm";
import { ActionForm, Field, Input, SubmitButton } from "@/components/ui/form";
import { Button, buttonClass } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { OutboxDialog, OutboxStatus } from "@/components/settings/outbox-dialog";
import { saveEmailFromAction, setEmailEnabledAction } from "../actions";
import { cn } from "@/lib/cn";
import { fmtDateTime } from "@/lib/dates";

export const metadata = { title: "Email · Settings" };
const PER_PAGE = 25;
const STATUSES = ["held", "sent", "failed"] as const;

export default async function EmailSettingsPage({ searchParams }: { searchParams: Promise<{ page?: string; status?: string }> }) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const s = await getSettings();
  const hasKey = !!process.env.RESEND_API_KEY;
  const hasFrom = !!s.emailFrom;
  const live = s.emailEnabled && hasKey && hasFrom;
  const status = STATUSES.includes(sp.status as (typeof STATUSES)[number]) ? sp.status! : undefined;
  const where = status ? eq(emailOutbox.status, status) : undefined;
  const [{ n: total }] = await db.select({ n: count() }).from(emailOutbox).where(where);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = Math.min(pages, Math.max(1, Math.trunc(Number(sp.page) || 1)));
  const rows = await db.select().from(emailOutbox).where(where).orderBy(desc(emailOutbox.createdAt)).limit(PER_PAGE).offset((page - 1) * PER_PAGE);
  const href = (p: { page?: number; status?: string }) => `?${new URLSearchParams(Object.entries({ status: status ?? "", page: "1", ...p }).filter(([, v]) => v !== "" && v !== undefined).map(([k, v]) => [k, String(v)]))}`;

  const checks = [
    { ok: s.emailEnabled, label: "Turned on by an administrator", hint: "The switch below." },
    { ok: hasKey, label: "Email provider key on the server", hint: hasKey ? "RESEND_API_KEY is configured." : "Ask whoever hosts the portal to set RESEND_API_KEY." },
    { ok: hasFrom, label: "Sender address", hint: hasFrom ? s.emailFrom : "Add one below." },
  ];

  return (
    <>
      <Card>
        <CardHeader title="Email delivery" description="The portal never sends email unless all three of these are in place. Until then, messages are held in the outbox below." />
        <div className="border-t border-line px-4 py-4 sm:px-5">
          <div className={cn("flex items-center gap-3 rounded-xl px-4 py-3", live ? "bg-ok-soft" : "bg-surface-2")}>
            {live ? <MailCheck className="h-5 w-5 shrink-0 text-ok" aria-hidden /> : <MailX className="h-5 w-5 shrink-0 text-muted" aria-hidden />}
            <div>
              <p className="font-semibold text-fg">Email delivery is {live ? "ON" : "OFF"}</p>
              <p className="text-sm text-fg-2">{live ? "New notifications, invitations and reset links are sent by email." : "Nothing is emailed. Share invitation and reset links yourself — they're always shown once when created, and kept in the outbox."}</p>
            </div>
          </div>
          <ul className="mt-4 space-y-2.5">
            {checks.map((c) => (
              <li key={c.label} className="flex items-start gap-2.5 text-sm">
                {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-faint" aria-hidden />}
                <span><span className="font-medium text-fg">{c.label}</span><span className="sr-only">{c.ok ? " (done)" : " (not yet)"}</span><span className="block text-xs text-muted break-all">{c.hint}</span></span>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-fg-2">Switch: <b className="text-fg">{s.emailEnabled ? "On" : "Off"}</b></p>
            {s.emailEnabled ? (
              <ConfirmAction trigger={<><PowerOff className="h-4 w-4" aria-hidden />Turn off email</>} triggerSize="md" variant="primary" title="Turn off email delivery?" confirmLabel="Turn off"
                description="New messages will be held in the outbox instead of being sent." action={setEmailEnabledAction.bind(null, false)} />
            ) : !hasKey || !hasFrom ? (
              <div className="sm:text-right">
                <Button type="button" disabled variant="secondary" aria-describedby="email-disabled-why"><Power className="h-4 w-4" aria-hidden />Turn on email</Button>
                <p id="email-disabled-why" className="mt-1.5 text-xs text-muted">{!hasKey ? "Unavailable until RESEND_API_KEY is configured on the server." : "Add a sender address first."}</p>
              </div>
            ) : (
              <ConfirmAction trigger={<><Power className="h-4 w-4" aria-hidden />Turn on email</>} triggerSize="md" variant="primary" title="Turn on email delivery?" confirmLabel="Turn on" requireText="ENABLE"
                description={<>Messages will be sent from <b>{s.emailFrom}</b> to members&apos; real inboxes, including some who are minors. Members can still turn off nonessential emails in their own settings.</>}
                action={setEmailEnabledAction.bind(null, true)} />
            )}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Sender address" description="The “From” address on every email. It must be verified with the email provider." />
        <ActionForm action={saveEmailFromAction} className="flex flex-col gap-3 border-t border-line px-4 py-4 sm:flex-row sm:items-end sm:px-5">
          <Field label="From" htmlFor="email-from" className="flex-1" hint="e.g. Courage for Kids <portal@courageforkids.org>">
            <Input id="email-from" name="emailFrom" defaultValue={s.emailFrom} maxLength={200} autoComplete="off" />
          </Field>
          <SubmitButton variant="secondary" pendingText="Saving…" className="sm:mb-[22px]">Save</SubmitButton>
        </ActionForm>
      </Card>

      <Card>
        <CardHeader title="Outbox" description="Every email the portal has queued, newest first. Admins can copy invitation and reset links from here." />
        <div className="px-4 pb-3 sm:px-5">
          <Tabs active={status ?? "all"} items={[{ key: "all", label: "All", href: href({ status: "" }) }, ...STATUSES.map((x) => ({ key: x, label: x[0].toUpperCase() + x.slice(1), href: href({ status: x }) }))]} />
        </div>
        {rows.length === 0 ? (
          <EmptyState compact icon={Inbox} title={status ? `No ${status} messages` : "The outbox is empty"}>Invitations, reset links and notifications will appear here.</EmptyState>
        ) : (
          <>
            <div className="hidden border-t border-line md:block">
              <table className="w-full table-fixed text-sm">
                <caption className="sr-only">Outbox messages</caption>
                <thead className="bg-surface-2/60">
                  <tr className="text-left text-[11px] font-semibold tracking-wide text-muted uppercase">
                    <th scope="col" className="w-[26%] px-5 py-2.5 font-semibold">To</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Subject</th>
                    <th scope="col" className="w-24 px-3 py-2.5 font-semibold">Status</th>
                    <th scope="col" className="w-32 px-3 py-2.5 font-semibold">Created</th>
                    <th scope="col" className="w-28 px-4 py-2.5"><span className="sr-only">Details</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((m) => (
                    <tr key={m.id}>
                      <td className="truncate px-5 py-2.5 text-fg-2" title={m.toEmail}>{m.toEmail}</td>
                      <td className="truncate px-3 py-2.5 text-fg" title={m.subject}>{m.subject}</td>
                      <td className="px-3 py-2.5"><OutboxStatus status={m.status} /></td>
                      <td className="px-3 py-2.5 text-muted">{fmtDateTime(m.createdAt, me.timezone)}</td>
                      <td className="px-4 py-2.5 text-right"><OutboxDialog msg={toMsg(m, me.timezone)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line border-t border-line md:hidden">
              {rows.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-fg">{m.subject}</p>
                    <p className="truncate text-xs text-muted">{m.toEmail}</p>
                    <p className="mt-1 flex items-center gap-2 text-xs text-muted"><OutboxStatus status={m.status} />{fmtDateTime(m.createdAt, me.timezone)}</p>
                  </div>
                  <OutboxDialog msg={toMsg(m, me.timezone)} />
                </li>
              ))}
            </ul>
            <nav aria-label="Outbox pages" className="flex items-center justify-between border-t border-line px-4 py-3 text-sm sm:px-5">
              <span className="text-muted">Page {page} of {pages} · {total} message{total === 1 ? "" : "s"}</span>
              <span className="flex gap-2">
                {page > 1 ? <Link href={href({ page: page - 1 })} className={buttonClass("secondary", "sm", "max-md:h-10")}><ChevronLeft className="h-4 w-4" aria-hidden />Newer</Link> : null}
                {page < pages ? <Link href={href({ page: page + 1 })} className={buttonClass("secondary", "sm", "max-md:h-10")}>Older<ChevronRight className="h-4 w-4" aria-hidden /></Link> : null}
              </span>
            </nav>
          </>
        )}
      </Card>
      {!live && <p className="text-xs text-muted"><Badge tone="neutral">Held</Badge> means the message was saved but not sent because email delivery is off.</p>}
    </>
  );
}

function toMsg(m: typeof emailOutbox.$inferSelect, tz: string) {
  return { id: m.id, toEmail: m.toEmail, subject: m.subject, body: m.body, status: m.status, error: m.error, created: fmtDateTime(m.createdAt, tz), sent: m.sentAt ? fmtDateTime(m.sentAt, tz) : null };
}
