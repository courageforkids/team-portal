"use server";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { files, resources } from "@/db/schema";
import { actionAdmin } from "@/server/auth";
import { audit } from "@/server/audit";
import { bool, filesOf, safe, str, UserError } from "@/server/safe-action";
import { deleteStored, saveUploads } from "@/server/storage";
import { isUuid, normalizeUrl } from "@/server/projects";
import type { ActionResult } from "@/lib/action";

const Schema = z.object({
  title: z.string().trim().min(1, "Give the resource a title.").max(160, "Keep the title under 160 characters."),
  description: z.string().trim().max(1000, "Keep the description under 1,000 characters."),
  category: z.string().trim().min(1, "Choose a category.").max(40, "Keep the category under 40 characters."),
  kind: z.enum(["file", "link", "note"], { message: "Choose a type." }),
  visibility: z.enum(["everyone", "leadership", "admin"], { message: "Choose who can see this." }),
});

function read(fd: FormData) {
  const base = Schema.parse({
    title: str(fd, "title"), description: str(fd, "description"), category: str(fd, "category"),
    kind: str(fd, "kind"), visibility: str(fd, "visibility"),
  });
  let url: string | null = null, body: string | null = null;
  if (base.kind === "link") {
    url = normalizeUrl(str(fd, "url"));
    if (!url) throw new UserError("Enter a valid web address starting with http:// or https://");
  }
  if (base.kind === "note") {
    body = String(fd.get("body") ?? "").replace(/\r\n/g, "\n").trim();
    if (!body) throw new UserError("Write the note's content.");
    if (body.length > 50_000) throw new UserError("Keep the note under 50,000 characters.");
  }
  // Category names are free text; tidy the casing of the first letter.
  const category = base.category.charAt(0).toUpperCase() + base.category.slice(1);
  return { ...base, category, url, body, pinned: bool(fd, "pinned") };
}

async function removeFile(fileId: string | null) {
  if (!fileId) return;
  const f = (await db.select({ key: files.storageKey }).from(files).where(eq(files.id, fileId)).limit(1))[0];
  await db.delete(files).where(eq(files.id, fileId));
  if (f) await deleteStored(f.key).catch(() => {});
}

export async function createResource(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const input = read(fd);
    const id = randomUUID();
    let fileId: string | null = null;
    if (input.kind === "file") {
      const list = filesOf(fd, "file");
      if (!list.length) throw new UserError("Choose a file to upload.");
      const [row] = await saveUploads(list.slice(0, 1), { type: "resource", id }, me.id);
      fileId = row.id;
    }
    await db.insert(resources).values({ id, ...input, fileId, createdById: me.id });
    await audit(me.id, "resource.create", "resource", id, { title: input.title, kind: input.kind, visibility: input.visibility });
    return { ok: true, message: "Resource added." };
  });
}

export async function updateResource(id: string, _: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    if (!isUuid(id)) throw new UserError("That resource no longer exists.");
    const before = (await db.select().from(resources).where(eq(resources.id, id)).limit(1))[0];
    if (!before) throw new UserError("That resource no longer exists.");
    const input = read(fd);
    let fileId: string | null = input.kind === "file" ? before.fileId : null;
    let oldFile: string | null = input.kind === "file" ? null : before.fileId;
    if (input.kind === "file") {
      const list = filesOf(fd, "file");
      if (list.length) {
        const [row] = await saveUploads(list.slice(0, 1), { type: "resource", id }, me.id);
        oldFile = before.fileId;
        fileId = row.id;
      } else if (!fileId) throw new UserError("Choose a file to upload.");
    }
    await db.update(resources).set({ ...input, fileId, updatedAt: new Date() }).where(eq(resources.id, id));
    await removeFile(oldFile);
    await audit(me.id, "resource.update", "resource", id, { title: input.title, kind: input.kind, visibility: input.visibility, replacedFile: !!oldFile && input.kind === "file" });
    return { ok: true, message: "Resource saved." };
  });
}

export async function deleteResource(id: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    if (!isUuid(id)) throw new UserError("That resource no longer exists.");
    const r = (await db.select().from(resources).where(eq(resources.id, id)).limit(1))[0];
    if (!r) throw new UserError("That resource no longer exists.");
    await db.delete(resources).where(eq(resources.id, id));
    await removeFile(r.fileId);
    await audit(me.id, "resource.delete", "resource", id, { title: r.title });
    return { ok: true, message: `"${r.title}" was deleted.`, redirectTo: "/resources" };
  });
}

export async function setResourcePinned(id: string, pinned: boolean): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    if (!isUuid(id)) throw new UserError("That resource no longer exists.");
    const r = await db.update(resources).set({ pinned, updatedAt: new Date() }).where(eq(resources.id, id)).returning({ title: resources.title });
    if (!r.length) throw new UserError("That resource no longer exists.");
    await audit(me.id, pinned ? "resource.pin" : "resource.unpin", "resource", id, { title: r[0].title });
    return { ok: true, message: pinned ? `Pinned "${r[0].title}".` : `Unpinned "${r[0].title}".` };
  });
}
