import { desc, eq } from "drizzle-orm";
import { MailPlus, RefreshCw, Ban, Inbox } from "lucide-react";
import { db } from "@/db";
import { departments, invitations, users } from "@/db/schema";
import { requireAdmin } from "@/server/auth";
import { getDepartments } from "@/server/queries";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmAction } from "@/components/ui/confirm";
import { InviteForm } from "@/components/settings/invite-form";
import { LinkActionButton } from "@/components/settings/link-action";
import { resendInviteAction, revokeInviteAction } from "../actions";
import { ago, fmtDate } from "@/lib/dates";
import { ROLE_LABEL } from "@/lib/task-meta";

export const metadata = { title: "Invitations · Settings" };

type State = "pending" | "accepted" | "expired" | "revoked";
const STATE: Record<State, { label: string; tone: Tone }> = {
  pending: { label: "Pending", tone: "blue" }, accepted: { label: "Accepted", tone: "green" }, expired: { label: "Expired", tone: "amber" }, revoked: { label: "Revoked", tone: "muted" },
};

export default async function InvitationsPage() {
  const me = await requireAdmin();
  const [rows, depts] = await Promise.all([
    db.select({
      id: invitations.id, email: invitations.email, name: invitations.name, title: invitations.title, role: invitations.role,
      expiresAt: invitations.expiresAt, acceptedAt: invitations.acceptedAt, revokedAt: invitations.revokedAt, createdAt: invitations.createdAt,
      departmentName: departments.name, invitedBy: users.name,
    }).from(invitations).leftJoin(departments, eq(departments.id, invitations.departmentId)).leftJoin(users, eq(users.id, invitations.invitedById))
      .orderBy(desc(invitations.createdAt)).limit(200),
    getDepartments(),
  ]);
  const now = new Date();
  const stateOf = (r: (typeof rows)[number]): State => r.acceptedAt ? "accepted" : r.revokedAt ? "revoked" : r.expiresAt < now ? "expired" : "pending";
  const order: State[] = ["pending", "expired", "accepted", "revoked"];
  const sorted = [...rows].sort((a, b) => order.indexOf(stateOf(a)) - order.indexOf(stateOf(b)));

  return (
    <>
      <Card>
        <CardHeader title="Invite someone" description="The portal is invitation-only. Each invite creates a private link that sets up their account." />
        <div className="border-t border-line px-4 py-4 sm:px-5"><InviteForm departments={depts.map((d) => ({ id: d.id, name: d.name }))} /></div>
      </Card>

      <Card>
        <CardHeader title="Invitations" description="Resending creates a fresh link and turns off the old one." />
        {sorted.length === 0 ? (
          <EmptyState compact icon={Inbox} title="No invitations yet">Invitations you create will be listed here.</EmptyState>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {sorted.map((r) => {
              const st = stateOf(r);
              return (
                <li key={r.id} className="flex flex-col gap-3 px-4 py-3.5 sm:px-5 md:flex-row md:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-fg">{r.name}</span>
                      <Badge tone={STATE[st].tone} dot>{STATE[st].label}</Badge>
                    </div>
                    <p className="truncate text-sm text-muted">{r.email}</p>
                    <p className="mt-1 text-xs text-muted">
                      {r.title || ROLE_LABEL[r.role]}{r.departmentName ? ` · ${r.departmentName}` : ""} · invited {ago(r.createdAt)}{r.invitedBy ? ` by ${r.invitedBy === me.name ? "you" : r.invitedBy}` : ""}
                      {st === "pending" && ` · expires ${fmtDate(r.expiresAt, me.timezone)}`}
                      {st === "accepted" && r.acceptedAt && ` · joined ${fmtDate(r.acceptedAt, me.timezone)}`}
                    </p>
                  </div>
                  {(st === "pending" || st === "expired" || st === "revoked") && (
                    <div className="flex flex-wrap gap-2 max-md:[&>button]:h-10">
                      <LinkActionButton action={resendInviteAction.bind(null, r.id)} trigger={<><RefreshCw className="h-3.5 w-3.5" aria-hidden />{st === "pending" ? "Resend" : "Send new link"}</>}
                        title="New invitation link" description={<>Send this link to <b>{r.email}</b>. Any earlier link for this invitation no longer works.</>} />
                      {st === "pending" && (
                        <ConfirmAction trigger={<><Ban className="h-3.5 w-3.5" aria-hidden />Revoke</>} triggerVariant="ghost" title="Revoke this invitation?" confirmLabel="Revoke"
                          description={<>The link sent to <b>{r.email}</b> will stop working. You can send a new one later.</>} action={revokeInviteAction.bind(null, r.id)} />
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <p className="flex items-center gap-2 text-xs text-muted"><MailPlus className="h-3.5 w-3.5" aria-hidden />Members who were deactivated can be invited again with the same email — accepting reactivates their account.</p>
    </>
  );
}
