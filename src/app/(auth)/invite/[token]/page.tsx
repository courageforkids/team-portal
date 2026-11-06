import { and, eq, gt, isNull } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { invitations } from "@/db/schema";
import { hashToken } from "@/server/crypto";
import { ROLE_LABEL } from "@/lib/task-meta";
import { InviteForm } from "./form";

export const metadata = { title: "Join the team" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = (await db.select().from(invitations).where(and(eq(invitations.tokenHash, hashToken(token)), isNull(invitations.acceptedAt), isNull(invitations.revokedAt), gt(invitations.expiresAt, new Date()))).limit(1))[0];
  if (!inv) return (
    <div className="text-center">
      <h1 className="text-lg font-bold">This invitation isn't valid</h1>
      <p className="mt-1 text-sm text-muted">It may have expired or already been used. Ask an administrator to send a new one.</p>
      <Link href="/login" className="mt-5 inline-block text-sm font-semibold text-brand-ink hover:underline">Go to sign in</Link>
    </div>
  );
  return (
    <>
      <h1 className="text-lg font-bold">Welcome to the team!</h1>
      <p className="mb-5 text-sm text-muted">You've been invited as <b className="text-fg">{inv.title || ROLE_LABEL[inv.role]}</b>. Set a password to finish creating your account for <b className="text-fg">{inv.email}</b>.</p>
      <InviteForm token={token} name={inv.name} />
    </>
  );
}
