import { count, eq } from "drizzle-orm";
import { FileJson, FileSpreadsheet, Download, ShieldCheck } from "lucide-react";
import { db } from "@/db";
import { tasks, users } from "@/db/schema";
import { requireAdmin } from "@/server/auth";
import { Card, CardHeader } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";

export const metadata = { title: "Data export · Settings" };

export default async function ExportSettingsPage() {
  await requireAdmin();
  const [[t], [m], [a]] = await Promise.all([
    db.select({ n: count() }).from(tasks), db.select({ n: count() }).from(users), db.select({ n: count() }).from(users).where(eq(users.status, "active")),
  ]);
  const items = [
    { href: "/api/export/json", icon: FileJson, title: "Everything (JSON)", desc: "All organizational data in one file — tasks, submissions, reviews, people, projects, announcements, events, resources, accountability records, settings and the activity log.", cta: "Download JSON" },
    { href: "/api/export/tasks", icon: FileSpreadsheet, title: "Tasks (CSV)", desc: `${t.n} task${t.n === 1 ? "" : "s"} with status, dates, department and assignees. Opens in Excel or Google Sheets.`, cta: "Download tasks CSV" },
    { href: "/api/export/members", icon: FileSpreadsheet, title: "Members (CSV)", desc: `${m.n} account${m.n === 1 ? "" : "s"} (${a.n} active) with role, title, department and status.`, cta: "Download members CSV" },
  ];
  return (
    <>
      <Card>
        <CardHeader title="Data export" description="Download a copy of the team's data for records, reporting or moving to another tool." />
        <ul className="divide-y divide-line border-t border-line">
          {items.map((i) => (
            <li key={i.href} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-ink"><i.icon className="h-5 w-5" aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-fg">{i.title}</p>
                <p className="text-sm text-muted">{i.desc}</p>
              </div>
              <a href={i.href} download className={buttonClass("secondary", "md", "shrink-0")}><Download className="h-4 w-4" aria-hidden />{i.cta}</a>
            </li>
          ))}
        </ul>
      </Card>
      <div className="flex gap-3 rounded-[14px] border border-line bg-surface-2 px-4 py-3.5 text-sm sm:px-5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-ink" aria-hidden />
        <div className="text-fg-2">
          <p className="font-semibold text-fg">Handle exports with care</p>
          <p className="mt-0.5">Exports include personal information about members, some of whom are minors, and private accountability records. Password hashes, sign-in sessions, calendar tokens and invitation/reset tokens are never included. Every download is recorded in the activity log.</p>
        </div>
      </div>
    </>
  );
}
