"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { capeBonuses, capeSeasons, paperPlanes, users } from "@/db/schema";
import { actionAdmin, actionUser } from "./auth";
import { academySettings, chooseCape } from "./academy";
import { saveSettings } from "./settings";
import { notify } from "./notify";
import { audit } from "./audit";
import { all, safe, str, UserError } from "./safe-action";
import { CAPE_ORDER, CAPES, isCape, PLANE_STYLES, PLANES_PER_DAY, SORTING_QUESTIONS, type Cape } from "@/lib/academy";
import type { ActionResult } from "@/lib/action";

export async function sortMeAction(answers: string[]): Promise<ActionResult<{ cape: Cape }>> {
  return safe(async () => {
    const me = await actionUser();
    const [row] = await db.select({ cape: users.cape }).from(users).where(eq(users.id, me.id));
    if (row?.cape && isCape(row.cape)) return { ok: true, data: { cape: row.cape } };
    if (answers.length !== SORTING_QUESTIONS.length || !answers.every(isCape)) throw new UserError("Answer every question first.");
    const { capeCount } = await academySettings();
    const cape = await chooseCape(answers as Cape[], capeCount);
    await db.update(users).set({ cape, sortedAt: new Date() }).where(and(eq(users.id, me.id), isNull(users.cape)));
    await audit(me.id, "academy.sorted", "user", me.id, { cape });
    return { ok: true, data: { cape } };
  });
}

export async function throwPlaneAction(input: { toId: string; style: string; message: string }): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const toId = z.string().uuid().parse(input.toId);
    if (toId === me.id) throw new UserError("Pick a teammate, not yourself.");
    const style = z.enum(Object.keys(PLANE_STYLES) as [string, ...string[]]).parse(input.style);
    const message = input.message.trim().slice(0, 200);
    if (!message) throw new UserError("Write a short note for your plane.");
    const [to] = await db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.id, toId), eq(users.status, "active")));
    if (!to) throw new UserError("That teammate isn't available.");
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(paperPlanes).where(and(eq(paperPlanes.fromId, me.id), gte(paperPlanes.createdAt, new Date(Date.now() - 86400000))));
    if (n >= PLANES_PER_DAY) throw new UserError(`You've thrown ${PLANES_PER_DAY} planes today. Save some for tomorrow!`);
    await db.insert(paperPlanes).values({ fromId: me.id, toId, style, message });
    await notify([toId], { type: "paper_plane", title: `✈️ ${me.name.split(" ")[0]} threw you a paper plane!`, body: "Open the portal to catch it.", href: "/academy/planes" });
    return { ok: true, message: `Your plane is flying to ${to.name.split(" ")[0]}!` };
  });
}

export async function markPlanesSeenAction(ids: string[]): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const list = z.array(z.string().uuid()).max(50).parse(ids);
    if (list.length) await db.update(paperPlanes).set({ seenAt: new Date() }).where(and(eq(paperPlanes.toId, me.id), inArray(paperPlanes.id, list), isNull(paperPlanes.seenAt)));
    return { ok: true };
  });
}

export async function reportPlaneAction(id: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const [p] = await db.update(paperPlanes).set({ reportedAt: new Date(), seenAt: new Date() }).where(and(eq(paperPlanes.id, z.string().uuid().parse(id)), eq(paperPlanes.toId, me.id))).returning({ id: paperPlanes.id });
    if (!p) throw new UserError("That plane wasn't found.");
    const admins = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), eq(users.status, "active")));
    await notify(admins.map((a) => a.id), { type: "chat_report", title: "A paper plane was reported", body: "Check Courage Academy → Reported planes.", href: "/academy#admin" });
    await audit(me.id, "plane.report", "paper_plane", p.id);
    revalidatePath("/academy/planes");
    return { ok: true, message: "Thanks for telling us. An admin will take a look." };
  });
}

export async function saveBirthdayAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const m = str(fd, "month"), d = str(fd, "day");
    let birthday: string | null = null;
    if (m || d) {
      const mm = Number(m), dd = Number(d);
      const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mm - 1];
      if (!max || !(dd >= 1 && dd <= max)) throw new UserError("Pick a real month and day.");
      birthday = `${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }
    await db.update(users).set({ birthday }).where(eq(users.id, me.id));
    revalidatePath("/profile");
    return { ok: true, message: birthday ? "Birthday saved. 🎂" : "Birthday removed." };
  });
}

/* ───── Admin ───── */

export async function saveAcademySettingsAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const cur = await academySettings();
    const goals = [0, 1, 2].map((i) => {
      const label = str(fd, `goal${i}Label`).slice(0, 60);
      const target = Number(str(fd, `goal${i}Target`).replace(/[$,]/g, ""));
      if (!label || !(target > 0)) return null;
      const metric = z.enum(["boxes", "money", "manual"]).parse(str(fd, `goal${i}Metric`) || "manual");
      const current = Number(str(fd, `goal${i}Current`).replace(/[$,]/g, "")) || 0;
      return { id: `g${i}`, label, metric, target: Math.min(target, 10_000_000), current: metric === "manual" ? current : undefined, year: Number(str(fd, `goal${i}Year`)) || new Date().getFullYear() };
    }).filter((g): g is NonNullable<typeof g> => !!g);
    const capeCount = str(fd, "capeCount") === "4" ? 4 : 2;
    await saveSettings({ academy: { enabled: str(fd, "enabled") !== "off", capeCount, goals } });
    await audit(me.id, "academy.settings", "settings", "1", { capeCount, goals: goals.length });
    void cur;
    revalidatePath("/", "layout");
    return { ok: true, message: "Academy settings saved." };
  });
}

export async function createSeasonAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const name = str(fd, "name").slice(0, 60), startsOn = str(fd, "startsOn"), endsOn = str(fd, "endsOn");
    if (!name) throw new UserError("Give the season a name, like “Spring 2027”.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || !/^\d{4}-\d{2}-\d{2}$/.test(endsOn) || endsOn < startsOn) throw new UserError("Pick a start date and an end date after it.");
    const overlap = await db.select({ id: capeSeasons.id }).from(capeSeasons).where(and(sql`${capeSeasons.startsOn} <= ${endsOn}`, sql`${capeSeasons.endsOn} >= ${startsOn}`)).limit(1);
    if (overlap.length) throw new UserError("That overlaps another season. Change the dates or delete the other one.");
    await db.insert(capeSeasons).values({ name, startsOn, endsOn });
    await audit(me.id, "academy.season", "season", name, { startsOn, endsOn });
    revalidatePath("/academy");
    return { ok: true, message: `Season “${name}” created.` };
  });
}

export async function deleteSeasonAction(id: string): Promise<ActionResult> {
  return safe(async () => {
    await actionAdmin();
    await db.delete(capeSeasons).where(eq(capeSeasons.id, z.string().uuid().parse(id)));
    revalidatePath("/academy");
    return { ok: true, message: "Season deleted." };
  });
}

export async function giveBonusAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const target = str(fd, "target");
    const points = Math.floor(Number(str(fd, "points")));
    if (!(points >= 1 && points <= 100)) throw new UserError("Bonus points must be between 1 and 100.");
    const reason = str(fd, "reason").slice(0, 140);
    if (!reason) throw new UserError("Say what the bonus is for.");
    let label: string;
    if (target.startsWith("cape:")) {
      const cape = target.slice(5);
      if (!isCape(cape)) throw new UserError("Pick a Cape or a person.");
      await db.insert(capeBonuses).values({ cape, points, reason, createdById: me.id });
      label = CAPES[cape].name;
    } else {
      const [u] = await db.select({ id: users.id, name: users.name, cape: users.cape }).from(users).where(eq(users.id, z.string().uuid().parse(target)));
      if (!u) throw new UserError("Pick a Cape or a person.");
      await db.insert(capeBonuses).values({ userId: u.id, cape: u.cape, points, reason, createdById: me.id });
      label = u.name.split(" ")[0];
      await notify([u.id], { type: "paper_plane", title: `⭐ +${points} bonus points!`, body: reason, href: "/academy" });
    }
    await audit(me.id, "academy.bonus", "bonus", target, { points, reason });
    revalidatePath("/academy");
    return { ok: true, message: `+${points} to ${label}!` };
  });
}

export async function resortMembersAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const ids = all(fd, "userId");
    for (const id of ids) {
      const v = str(fd, `cape_${id}`);
      const cape = v === "" ? null : isCape(v) && CAPE_ORDER.includes(v) ? v : undefined;
      if (cape === undefined) continue;
      await db.update(users).set({ cape, sortedAt: cape ? new Date() : null }).where(eq(users.id, z.string().uuid().parse(id)));
    }
    await audit(me.id, "academy.resort", "users", String(ids.length));
    revalidatePath("/academy");
    return { ok: true, message: "Capes updated." };
  });
}

export async function clearPlaneReportAction(id: string, remove: boolean): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    if (remove) await db.delete(paperPlanes).where(eq(paperPlanes.id, z.string().uuid().parse(id)));
    else await db.update(paperPlanes).set({ reportedAt: null }).where(eq(paperPlanes.id, z.string().uuid().parse(id)));
    await audit(me.id, remove ? "plane.delete" : "plane.restore", "paper_plane", id);
    revalidatePath("/academy");
    return { ok: true, message: remove ? "Plane deleted." : "Plane restored." };
  });
}
