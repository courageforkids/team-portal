import Link from "next/link";
import { asc, desc, eq, sql } from "drizzle-orm";
import { KeyRound, UserMinus, UserCheck, MailPlus, Users } from "lucide-react";
import { db } from "@/db";
import { departments, users } from "@/db/schema";
import { requireAdmin } from "@/server/auth";
import { getDepartments } from "@/server/queries";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmAction } from "@/components/ui/confirm";
import { EditMemberDialog } from "@/components/settings/member-dialog";
import { LinkActionButton } from "@/components/settings/link-action";
import { createResetLinkAction, setMemberStatusAction } from "../actions";
import { ago } from "@/lib/dates";
import { ROLE_LABEL } from "@/lib/task-meta";

export const metadata = { title: "Members · Settings" };

export default async function MembersSettingsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const me = await requireAdmin();
  const { show: showRaw } = await searchParams;
  const show = showRaw === "deactivated" || showRaw === "all" ? showRaw : "active";
  const [rows, depts] = await Promise.all([
    db.select({
      id: users.id, name: users.name, email: users.email, title: users.title, role: users.role, status: users.status, avatarFileId: users.avatarFileId,
      departmentId: users.departmentId, departmentName: departments.name, responsibilities: users.responsibilities, lastSeenAt: users.lastSeenAt,
      hasPassword: sql<boolean>`${users.passwordHash} is not null`,
    }).from(users).leftJoin(departments, eq(departments.id, users.departmentId)).orderBy(desc(sql`${users.status} = 'active'`), asc(sql`lower(${users.name})`)),
    getDepartments(),
  ]);
  const activeCount = rows.filter((r) => r.status === "active").length;
  const list = show === "all" ? rows : rows.filter((r) => r.status === show);
  const deptOptions = depts.map((d) => ({ id: d.id, name: d.name }));

  return (
    <Card>
      <CardHeader title="Members" description="Roles, departments and access for everyone with an account."
        action={<ButtonLink href="/settings/invitations" size="sm" className="max-md:h-10"><MailPlus className="h-4 w-4" aria-hidden />Invite</ButtonLink>} />
      <div className="px-4 pb-3 sm:px-5">
        <Tabs active={show} items={[
          { key: "active", label: "Active", href: "?show=active", count: activeCount },
          { key: "deactivated", label: "Deactivated", href: "?show=deactivated", count: rows.length - activeCount },
          { key: "all", label: "All", href: "?show=all", count: rows.length },
        ]} />
      </div>
      {list.length === 0 ? (
        <EmptyState compact icon={Users} title={show === "deactivated" ? "No deactivated members" : "No members"} />
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {list.map((u) => {
            const self = u.id === me.id;
            return (
              <li key={u.id} id={`member-${u.id}`} className="scroll-mt-24 px-4 py-4 target:bg-brand-soft/50 sm:px-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Avatar name={u.name} fileId={u.avatarFileId} size={40} className={u.status === "deactivated" ? "opacity-50 grayscale" : undefined} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Link href={`/admin/members/${u.id}`} className="focus-ring rounded font-semibold text-fg hover:text-brand-ink">{u.name}</Link>
                        {self && <Badge tone="brand">You</Badge>}
                        {u.status === "deactivated" && <Badge tone="muted">Deactivated</Badge>}
                        {u.status === "active" && !u.hasPassword && <Badge tone="amber">No password yet</Badge>}
                      </div>
                      <p className="truncate text-sm text-muted">{u.email}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                        <Badge tone={u.role === "admin" ? "brand" : u.role === "leader" ? "violet" : "neutral"}>{ROLE_LABEL[u.role]}</Badge>
                        {u.title && <span className="text-fg-2">{u.title}</span>}
                        {u.departmentName && <span>· {u.departmentName}</span>}
                        <span>· {u.lastSeenAt ? `Seen ${ago(u.lastSeenAt)}` : "Never signed in"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pl-[52px] lg:pl-0 max-md:[&>button]:h-10">
                    <EditMemberDialog isSelf={self} departments={deptOptions}
                      member={{ id: u.id, name: u.name, email: u.email, role: u.role, title: u.title, departmentId: u.departmentId, responsibilities: u.responsibilities }} />
                    {u.status === "active" && (
                      <LinkActionButton action={createResetLinkAction.bind(null, u.id)} trigger={<><KeyRound className="h-3.5 w-3.5" aria-hidden />Reset link</>}
                        title={`Password reset link for ${u.name}`}
                        description={<>This link lets <b>{u.name}</b> choose a new password. It works once and expires in 24 hours. We also queued it as an email to {u.email}.</>} />
                    )}
                    {u.status === "active" && !self && (
                      <ConfirmAction trigger={<><UserMinus className="h-3.5 w-3.5" aria-hidden />Deactivate</>} triggerVariant="ghost"
                        title={`Deactivate ${u.name}?`} confirmLabel="Deactivate"
                        description={<>They&apos;ll be signed out everywhere and won&apos;t be able to sign in. Their tasks, submissions and history stay as they are. You can reactivate them at any time.</>}
                        action={setMemberStatusAction.bind(null, u.id, "deactivated")} />
                    )}
                    {u.status === "deactivated" && (
                      <ConfirmAction trigger={<><UserCheck className="h-3.5 w-3.5" aria-hidden />Reactivate</>} variant="primary"
                        title={`Reactivate ${u.name}?`} confirmLabel="Reactivate"
                        description="They'll be able to sign in again with their existing password, and can be assigned new work."
                        action={setMemberStatusAction.bind(null, u.id, "active")} />
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
