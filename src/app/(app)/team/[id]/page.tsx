import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, CalendarDays, Mail, ShieldCheck } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getProfile } from "@/server/team";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { fmtDate } from "@/lib/dates";
import { ROLE_LABEL } from "@/lib/task-meta";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const p = await getProfile((await params).id);
  return { title: p?.name ?? "Team member" };
}

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const p = await getProfile((await params).id);
  if (!p) notFound();
  const canSeeDept = me.role !== "volunteer";

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/team" className="focus-ring mb-3 inline-flex h-10 items-center gap-1.5 rounded-lg text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden />Team directory
      </Link>
      <Card className="overflow-hidden animate-in">
        <div className="h-20 bg-brand-soft sm:h-24" aria-hidden />
        <div className="px-5 pb-6 sm:px-8">
          <Avatar name={p.name} fileId={p.avatarFileId} size={88} className="-mt-11 ring-4 sm:-mt-12" />
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-[26px] font-bold leading-tight tracking-tight text-fg">{p.name}</h1>
              <p className="mt-1 text-[15px] text-fg-2">{p.title || ROLE_LABEL[p.role]}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge tone={p.role === "admin" ? "brand" : p.role === "leader" ? "violet" : "neutral"}>{ROLE_LABEL[p.role]}</Badge>
                {me.id === p.id && <Badge tone="accent">You</Badge>}
              </div>
            </div>
            {(p.email || me.role === "admin") && (
              <div className="flex shrink-0 flex-wrap gap-2">
                {p.email && <ButtonLink href={`mailto:${p.email}`} variant="secondary"><Mail className="h-4 w-4" aria-hidden />Email {p.name.split(" ")[0]}</ButtonLink>}
                {me.role === "admin" && <ButtonLink href={`/admin/members/${p.id}`} variant="subtle"><ShieldCheck className="h-4 w-4" aria-hidden />View admin profile</ButtonLink>}
              </div>
            )}
          </div>

          <dl className="mt-6 grid gap-5 border-t border-line pt-5 sm:grid-cols-2">
            <div>
              <dt className="flex items-center gap-1.5 text-xs font-medium text-muted"><Building2 className="h-3.5 w-3.5" aria-hidden />Department</dt>
              <dd className="mt-1 text-sm font-medium text-fg">
                {p.departmentName ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: p.departmentColor ?? "var(--faint)" }} aria-hidden />
                    {canSeeDept && p.departmentSlug
                      ? <Link href={`/departments/${p.departmentSlug}`} className="focus-ring rounded hover:text-brand-ink">{p.departmentName}</Link>
                      : p.departmentName}
                  </span>
                ) : <span className="font-normal text-muted">Not assigned</span>}
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-xs font-medium text-muted"><CalendarDays className="h-3.5 w-3.5" aria-hidden />Member since</dt>
              <dd className="mt-1 text-sm font-medium text-fg">{fmtDate(p.createdAt, me.timezone, "MMMM yyyy")}</dd>
            </div>
            {p.email && (
              <div className="sm:col-span-2">
                <dt className="flex items-center gap-1.5 text-xs font-medium text-muted"><Mail className="h-3.5 w-3.5" aria-hidden />Email</dt>
                <dd className="mt-1 text-sm"><a href={`mailto:${p.email}`} className="focus-ring break-all rounded font-medium text-brand-ink hover:underline">{p.email}</a></dd>
              </div>
            )}
          </dl>

          <section className="mt-6 border-t border-line pt-5" aria-labelledby="resp-h">
            <h2 id="resp-h" className="text-xs font-medium text-muted">Responsibilities</h2>
            {p.responsibilities
              ? <p className="prose-body mt-1.5 text-[15px] text-fg-2">{p.responsibilities}</p>
              : <p className="mt-1.5 text-sm text-muted">{me.id === p.id ? "You haven't added responsibilities yet." : "Not added yet."}</p>}
          </section>
        </div>
      </Card>
    </div>
  );
}
