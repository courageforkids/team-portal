import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, CircleCheck, Pencil, Pin, Trash2, Users } from "lucide-react";
import { requireUser } from "@/server/auth";
import { announcementProgress, getAnnouncementForViewer, markAnnouncementRead } from "@/server/announcements";
import { getDepartments } from "@/server/queries";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm";
import { RichText } from "@/components/announcements/rich-text";
import { AttachmentList } from "@/components/announcements/attachment-list";
import { AcknowledgeForm } from "@/components/announcements/ack-form";
import { ProgressPanel } from "@/components/announcements/progress-panel";
import { CategoryBadge } from "@/components/announcements/announcement-card";
import { audienceLabel } from "@/components/announcements/meta";
import { ago, fmtDateTime, fmtFull } from "@/lib/dates";
import { deleteAnnouncementAction } from "../actions";

export const metadata = { title: "Announcement" };

export default async function AnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const a = await getAnnouncementForViewer(me, id);
  if (!a) notFound();
  const isAdmin = me.role === "admin";
  if (a.published && !a.mine) await markAnnouncementRead(me.id, a.id);
  const [progress, depts] = isAdmin ? await Promise.all([announcementProgress(a), getDepartments(true)]) : [null, []];
  const deptNames = new Map(depts.map((d) => [d.id, d.name]));
  const acknowledgedAt = a.mine?.acknowledgedAt ?? null;

  return (
    <div className="animate-in">
      <Link href="/announcements" className="focus-ring -ml-2 mb-4 inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden />Announcements
      </Link>

      <div className={isAdmin ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" : "mx-auto max-w-3xl"}>
        <article className="min-w-0">
          {!a.published && (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-violet/20 bg-violet-soft px-4 py-3 text-sm text-violet">
              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>Scheduled — publishes <b>{fmtFull(a.publishAt, me.timezone)}</b>. Members can&apos;t see it until then; they&apos;ll be notified when it goes live.</span>
            </div>
          )}
          <Card className="p-5 sm:p-8">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {a.pinned && <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-ink"><Pin className="h-3.5 w-3.5" aria-hidden />Pinned</span>}
              <CategoryBadge category={a.category} />
              {isAdmin && <span className="inline-flex items-center gap-1 text-xs text-muted"><Users className="h-3.5 w-3.5" aria-hidden />{audienceLabel(a.audience, deptNames)}</span>}
            </div>
            <h1 className="text-[24px] leading-tight font-bold tracking-tight text-fg sm:text-[28px]">{a.title}</h1>
            <div className="mt-4 flex items-center gap-3 border-b border-line pb-5">
              <Avatar name={a.authorName ?? "Courage for Kids"} fileId={a.authorAvatarFileId} size={36} className="ring-0" />
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-fg">{a.authorName ?? "Courage for Kids"}{a.authorTitle && <span className="font-normal text-muted"> · {a.authorTitle}</span>}</p>
                <p className="text-muted">
                  <time dateTime={a.publishAt.toISOString()} title={fmtFull(a.publishAt, me.timezone)}>
                    {a.published ? `${fmtDateTime(a.publishAt, me.timezone)} · ${ago(a.publishAt)}` : `Scheduled for ${fmtDateTime(a.publishAt, me.timezone)}`}
                  </time>
                </p>
              </div>
            </div>
            <RichText text={a.body} className="mt-6" />
            <AttachmentList files={a.attachments} />

            {a.requireAck && a.published && a.authorId !== me.id && (
              <div className="mt-8 rounded-xl border border-line bg-surface-2 p-4 sm:p-5">
                {acknowledgedAt ? (
                  <p className="flex items-center gap-2 text-sm font-medium text-ok">
                    <CircleCheck className="h-5 w-5 shrink-0" aria-hidden />You acknowledged this {ago(acknowledgedAt)}.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-fg">Please confirm you&apos;ve read this</p>
                      <p className="text-sm text-muted">It lets the team know the message reached you.</p>
                    </div>
                    <AcknowledgeForm id={a.id} />
                  </div>
                )}
              </div>
            )}
          </Card>
        </article>

        {isAdmin && (
          <aside className="space-y-4">
            <div className="flex gap-2">
              <ButtonLink href={`/announcements/${a.id}/edit`} variant="secondary" className="flex-1"><Pencil className="h-4 w-4" aria-hidden />Edit</ButtonLink>
              <ConfirmAction
                trigger={<><Trash2 className="h-4 w-4" aria-hidden />Delete</>}
                triggerSize="md"
                title="Delete this announcement?"
                description={<>“{a.title}” and its attachments will be removed for everyone. This can&apos;t be undone.</>}
                confirmLabel="Delete announcement"
                action={deleteAnnouncementAction.bind(null, a.id)}
              />
            </div>
            {progress && a.published && <ProgressPanel requireAck={a.requireAck} {...progress} />}
            {progress && !a.published && (
              <Card className="p-5">
                <h2 className="text-[15px] font-semibold text-fg">Audience</h2>
                <p className="mt-1 text-sm text-muted">{progress.total} active member{progress.total === 1 ? "" : "s"} will be notified when this publishes.</p>
              </Card>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
