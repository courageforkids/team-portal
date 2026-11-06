import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { audit } from "@/server/audit";
import { buildJsonExport, membersCsv, tasksCsv } from "@/server/export";

export const dynamic = "force-dynamic";

const KINDS = ["json", "tasks", "members"] as const;
type Kind = (typeof KINDS)[number];

/** Admin-only data export downloads: /api/export/json, /api/export/tasks, /api/export/members */
export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (u.role !== "admin") return NextResponse.json({ error: "Only Executive Administrators can export data." }, { status: 403 });
  const { kind } = await params;
  if (!KINDS.includes(kind as Kind)) return NextResponse.json({ error: "Unknown export." }, { status: 404 });

  const stamp = new Date().toISOString().slice(0, 10);
  let body: string, type: string, filename: string;
  if (kind === "json") {
    body = JSON.stringify(await buildJsonExport(), null, 2);
    type = "application/json; charset=utf-8";
    filename = `cfk-portal-export-${stamp}.json`;
  } else {
    body = kind === "tasks" ? await tasksCsv() : await membersCsv();
    type = "text/csv; charset=utf-8";
    filename = `cfk-${kind}-${stamp}.csv`;
  }
  await audit(u.id, `export.${kind}`, "export", kind, { bytes: Buffer.byteLength(body) });
  return new NextResponse(body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
