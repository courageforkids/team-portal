import { desc, eq } from "drizzle-orm";
import { KeyRound, ShieldCheck } from "lucide-react";
import { db } from "@/db";
import { apiKeys, users } from "@/db/schema";
import { requireAdmin } from "@/server/auth";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmAction } from "@/components/ui/confirm";
import { ApiKeyForm } from "@/components/settings/api-key-form";
import { revokeApiKeyAction } from "@/server/api-key-actions";
import { ago, fmtDate } from "@/lib/dates";

export const metadata = { title: "API keys" };

export default async function ApiKeysPage() {
  await requireAdmin();
  const keys = await db.select({ k: apiKeys, by: users.name }).from(apiKeys).innerJoin(users, eq(users.id, apiKeys.createdById)).orderBy(desc(apiKeys.createdAt));
  const now = new Date();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">API keys</h2>
        <p className="text-sm text-muted">Let a trusted tool, like Claude, create tasks, announcements, events, sign-up shifts and resources for you.</p>
      </div>
      <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-4 text-sm text-fg-2">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-ink" />
        <div>A key acts as <b>you</b>. It can create and update content and review submissions, but it can't change passwords or roles, remove people, or read accountability records. Everything it does appears in the Activity log as “via API key.” Treat a key like a password and revoke it if you stop using it.</div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title="Keys" />
          {keys.length === 0 ? <EmptyState compact icon={KeyRound} title="No keys yet">Create one to let Claude work in the portal for you.</EmptyState> : (
            <ul className="divide-y divide-line border-t border-line">
              {keys.map(({ k, by }) => {
                const status = k.revokedAt ? "Revoked" : k.expiresAt && k.expiresAt < now ? "Expired" : "Active";
                return (
                  <li key={k.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><span className="font-medium">{k.name}</span><Badge tone={status === "Active" ? "green" : "muted"}>{status}</Badge></div>
                      <div className="text-xs text-muted"><code className="font-mono">{k.prefix}…</code> · created by {by} {ago(k.createdAt)} · {k.lastUsedAt ? `last used ${ago(k.lastUsedAt)}` : "never used"}{k.expiresAt && !k.revokedAt ? ` · expires ${fmtDate(k.expiresAt, undefined, "MMM d, yyyy")}` : ""}</div>
                    </div>
                    {status === "Active" && <ConfirmAction trigger="Revoke" title={`Revoke “${k.name}”?`} description="Anything using this key stops working immediately. This can't be undone; you can always create a new key." confirmLabel="Revoke key" action={revokeApiKeyAction.bind(null, k.id)} />}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card><CardHeader title="Create a key" /><div className="px-5 pb-5"><ApiKeyForm /></div></Card>
      </div>
    </div>
  );
}
