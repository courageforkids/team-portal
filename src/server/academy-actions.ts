"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  academyChallenges, academyClaims, capeBoardNotes, capeBonuses, capeMottos, capeMottoVotes, capeSeasons, conversationMembers, conversations,
  paperPlanes, planeHearts, users,
} from "@/db/schema";
import { actionAdmin, actionUser, type CurrentUser } from "./auth";
import { academySettings, canSeeAcademy, captains, chooseCape, type AcademyConfig } from "./academy";
import { getSettings, saveSettings } from "./settings";
import { adminIds, notify } from "./notify";
import { audit } from "./audit";
import { addSystemMessage } from "./chat";
import { deleteStored, storePrepared } from "./storage";
import { files } from "@/db/schema";
import { all, safe, str, UserError } from "./safe-action";
import {
  activeCapes, CAPE_ORDER, CAPES, CAPTAIN_BONUS_MAX, CAPTAIN_BONUS_PER_WEEK, capeLabel, isCape, MISSION_KINDS, PLANE_STICKERS, PLANE_STYLES, PLANES_PER_DAY,
  SORTING_QUESTIONS, type Cape,
} from "@/lib/academy";
import { heroSvg, sanitizeHero } from "@/lib/hero";
import { isCrestId } from "@/lib/rooms";
import type { ActionResult } from "@/lib/action";

const uuid = z.string().uuid();

async function academyUser() {
  const me = await actionUser();
  const a = await academySettings();
  if (!canSeeAcademy(me, a)) throw new UserError("Courage Academy isn't open yet.");
  return { me, a };
}
async function myCape(id: string): Promise<Cape | null> {
  const [r] = await db.select({ cape: users.cape }).from(users).where(eq(users.id, id));
  return r?.cape && isCape(r.cape) ? r.cape : null;
}

/* ───── Cape chats ───── */

/** Each Cape has one group chat (dm_key "cape:<cape>"). Keeps a person in their Cape's chat and out of the others. */
async function syncCapeChat(userId: string, cape: Cape | null, a: AcademyConfig) {
  const keys = CAPE_ORDER.map((c) => `cape:${c}`);
  const existing = await db.select({ id: conversations.id, dmKey: conversations.dmKey }).from(conversations).where(inArray(conversations.dmKey, keys));
  const others = existing.filter((c) => c.dmKey !== `cape:${cape}`).map((c) => c.id);
  if (others.length) await db.delete(conversationMembers).where(and(eq(conversationMembers.userId, userId), inArray(conversationMembers.conversationId, others)));
  if (!cape) return null;
  let conv = existing.find((c) => c.dmKey === `cape:${cape}`);
  if (!conv) {
    const [made] = await db.insert(conversations).values({ kind: "group", dmKey: `cape:${cape}`, title: `${CAPES[cape].emoji} ${capeLabel(cape, a.capes)}`, description: `Chat for the ${capeLabel(cape, a.capes)}.` })
      .onConflictDoNothing().returning({ id: conversations.id, dmKey: conversations.dmKey });
    conv = made ?? (await db.select({ id: conversations.id, dmKey: conversations.dmKey }).from(conversations).where(eq(conversations.dmKey, `cape:${cape}`)))[0];
  }
  const added = await db.insert(conversationMembers).values({ conversationId: conv.id, userId }).onConflictDoNothing().returning();
  return added.length ? conv.id : null;
}

/* ───── Hero picture ───── */

/** Saves the hero as the profile picture: a PNG drawn on the phone when we have one (works everywhere), otherwise an SVG made here. */
async function writeHeroAvatar(userId: string, png?: Buffer | null): Promise<void> {
  const [u] = await db.select({ hero: users.hero, cape: users.cape, avatarFileId: users.avatarFileId, heroAvatar: users.heroAvatar, name: users.name }).from(users).where(eq(users.id, userId));
  if (!u?.heroAvatar || !u.hero) return;
  let file: { name: string; size: number; mime: string; buf: Buffer };
  if (png) file = { name: "hero.png", size: png.length, mime: "image/png", buf: png };
  else {
    const cape = u.cape && isCape(u.cape) ? CAPES[u.cape] : null;
    const svg = heroSvg(sanitizeHero(u.hero), { view: "head", capeColor: cape?.color ?? "#004F81", capeTrim: "#FED438", animate: false, idPrefix: "av" });
    const buf = Buffer.from(svg, "utf8");
    file = { name: "hero.svg", size: buf.length, mime: "image/svg+xml", buf };
  }
  const [row] = await storePrepared([file], { type: "avatar", id: userId }, userId);
  const old = u.avatarFileId;
  await db.update(users).set({ avatarFileId: row.id }).where(eq(users.id, userId));
  if (old) await dropHeroFile(old);
}
/** Deletes a generated hero picture (never a real photo). */
async function dropHeroFile(fileId: string) {
  const [f] = await db.select().from(files).where(and(eq(files.id, fileId), inArray(files.filename, ["hero.svg", "hero.png"]), eq(files.ownerType, "avatar")));
  if (!f) return;
  await db.delete(files).where(eq(files.id, f.id));
  await deleteStored(f.storageKey).catch(() => {});
}

export async function saveHeroAction(fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const { me } = await academyUser();
    let raw: unknown = null;
    try { raw = JSON.parse(str(fd, "hero")); } catch { throw new UserError("Couldn't read your hero. Try again."); }
    const hero = sanitizeHero(raw);
    const input = { useAsAvatar: str(fd, "useAsAvatar") === "1" };
    // The phone draws the picture as a PNG; accept it only if it really is a small PNG.
    const pngFile = fd.get("png");
    let png: Buffer | null = null;
    if (pngFile instanceof File && pngFile.size > 0 && pngFile.size < 1_500_000) {
      const b = Buffer.from(await pngFile.arrayBuffer());
      if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) png = b;
    }
    const [u] = await db.select({ heroAvatar: users.heroAvatar, avatarFileId: users.avatarFileId, photoFileId: users.photoFileId }).from(users).where(eq(users.id, me.id));
    const want = !!input.useAsAvatar;
    if (want && !u.heroAvatar) {
      // Switching to the hero picture: keep their photo so they can switch back.
      await db.update(users).set({ hero, heroAvatar: true, photoFileId: u.avatarFileId }).where(eq(users.id, me.id));
    } else if (!want && u.heroAvatar) {
      const heroFile = u.avatarFileId;
      await db.update(users).set({ hero, heroAvatar: false, avatarFileId: u.photoFileId, photoFileId: null }).where(eq(users.id, me.id));
      if (heroFile) await dropHeroFile(heroFile);
    } else {
      await db.update(users).set({ hero }).where(eq(users.id, me.id));
    }
    if (want) await writeHeroAvatar(me.id, png);
    revalidatePath("/", "layout");
    return { ok: true, message: want ? "Hero saved. It's your profile picture now. 🦸" : "Hero saved. 🦸" };
  });
}

/* ───── Sorting ───── */

export async function sortMeAction(answers: string[]): Promise<ActionResult<{ cape: Cape }>> {
  return safe(async () => {
    const { me, a } = await academyUser();
    const [row] = await db.select({ cape: users.cape }).from(users).where(eq(users.id, me.id));
    if (row?.cape && isCape(row.cape)) return { ok: true, data: { cape: row.cape } };
    if (answers.length !== SORTING_QUESTIONS.length || !answers.every(isCape)) throw new UserError("Answer every question first.");
    const cape = await chooseCape(answers as Cape[], a.capeCount);
    const done = await db.update(users).set({ cape, sortedAt: new Date() }).where(and(eq(users.id, me.id), isNull(users.cape))).returning({ id: users.id });
    if (done.length) {
      const chat = await syncCapeChat(me.id, cape, a);
      if (chat) await addSystemMessage(chat, `🎉 ${me.name.split(" ")[0]} joined the ${capeLabel(cape, a.capes)}!`);
      await audit(me.id, "academy.sorted", "user", me.id, { cape });
    }
    return { ok: true, data: { cape } };
  });
}

/* ───── Paper planes ───── */

export async function throwPlaneAction(input: { toId: string; style: string; message: string; sticker?: string | null; public?: boolean }): Promise<ActionResult> {
  return safe(async () => {
    const { me } = await academyUser();
    const toId = uuid.parse(input.toId);
    if (toId === me.id) throw new UserError("Pick a teammate, not yourself.");
    const style = z.enum(Object.keys(PLANE_STYLES) as [string, ...string[]]).parse(input.style);
    const sticker = input.sticker && (PLANE_STICKERS as readonly string[]).includes(input.sticker) ? input.sticker : null;
    const message = String(input.message ?? "").trim().slice(0, 200);
    if (!message) throw new UserError("Write a short note for your plane.");
    const [to] = await db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.id, toId), eq(users.status, "active")));
    if (!to) throw new UserError("That teammate isn't available.");
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(paperPlanes).where(and(eq(paperPlanes.fromId, me.id), gte(paperPlanes.createdAt, new Date(Date.now() - 86400000))));
    if (n >= PLANES_PER_DAY) throw new UserError(`You've thrown ${PLANES_PER_DAY} planes today. Save some for tomorrow!`);
    await db.insert(paperPlanes).values({ fromId: me.id, toId, style, message, sticker, public: !!input.public });
    await notify([toId], { type: "paper_plane", title: `✈️ ${me.name.split(" ")[0]} threw you a paper plane!`, body: "Open the portal to catch it.", href: "/academy/scrapbook" });
    return { ok: true, message: `Your plane is flying to ${to.name.split(" ")[0]}!` };
  });
}

export async function markPlanesSeenAction(ids: string[]): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const list = z.array(uuid).max(50).parse(ids);
    if (list.length) await db.update(paperPlanes).set({ seenAt: new Date() }).where(and(eq(paperPlanes.toId, me.id), inArray(paperPlanes.id, list), isNull(paperPlanes.seenAt)));
    return { ok: true };
  });
}

export async function heartPlaneAction(id: string): Promise<ActionResult<{ hearted: boolean }>> {
  return safe(async () => {
    const { me } = await academyUser();
    const pid = uuid.parse(id);
    const [p] = await db.select({ id: paperPlanes.id }).from(paperPlanes).where(and(eq(paperPlanes.id, pid), eq(paperPlanes.public, true), isNull(paperPlanes.reportedAt)));
    if (!p) throw new UserError("That plane isn't on the board.");
    const gone = await db.delete(planeHearts).where(and(eq(planeHearts.planeId, pid), eq(planeHearts.userId, me.id))).returning();
    if (!gone.length) await db.insert(planeHearts).values({ planeId: pid, userId: me.id }).onConflictDoNothing();
    revalidatePath("/academy");
    return { ok: true, data: { hearted: !gone.length } };
  });
}

export async function reportPlaneAction(id: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const pid = uuid.parse(id);
    // The person it was sent to, or anyone who can see it on the public board.
    const [p] = await db.update(paperPlanes).set({ reportedAt: new Date(), seenAt: new Date() })
      .where(and(eq(paperPlanes.id, pid), sql`(${paperPlanes.toId} = ${me.id} or ${paperPlanes.public} = true)`)).returning({ id: paperPlanes.id });
    if (!p) throw new UserError("That plane wasn't found.");
    await notify(await adminIds(), { type: "chat_report", title: "A paper plane was reported", body: "Check Courage Academy → Admin → Reported planes.", href: "/academy/admin" });
    await audit(me.id, "plane.report", "paper_plane", p.id);
    revalidatePath("/academy", "layout");
    return { ok: true, message: "Thanks for telling us. An admin will take a look." };
  });
}

/* ───── Mission points ───── */

export async function claimMissionAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const { me } = await academyUser();
    const kind = str(fd, "kind");
    if (!(kind in MISSION_KINDS)) throw new UserError("Pick what you did.");
    const details = str(fd, "details").slice(0, 400);
    if (details.length < 5) throw new UserError("Add a sentence about what you did, so it can be approved.");
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(academyClaims).where(and(eq(academyClaims.userId, me.id), eq(academyClaims.status, "pending")));
    if (n >= 10) throw new UserError("You have 10 claims waiting already. Give an admin a chance to catch up.");
    const k = MISSION_KINDS[kind as keyof typeof MISSION_KINDS];
    await db.insert(academyClaims).values({ userId: me.id, kind, details, points: k.points });
    await notify(await adminIds(), { type: "academy", title: `${me.name.split(" ")[0]} claimed mission points`, body: `${k.emoji} ${k.label}: ${details.slice(0, 120)}`, href: "/academy/admin", excludeUserId: me.id });
    revalidatePath("/academy");
    return { ok: true, message: "Claim sent! You'll get the points when an admin approves it." };
  });
}

export async function reviewClaimAction(id: string, approve: boolean, points?: number): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const [c] = await db.select().from(academyClaims).where(and(eq(academyClaims.id, uuid.parse(id)), eq(academyClaims.status, "pending")));
    if (!c) throw new UserError("That claim was already reviewed.");
    const pts = Math.max(1, Math.min(100, Math.floor(points ?? c.points)));
    await db.update(academyClaims).set({ status: approve ? "approved" : "declined", points: pts, reviewedById: me.id, reviewedAt: new Date() }).where(eq(academyClaims.id, c.id));
    const k = MISSION_KINDS[c.kind as keyof typeof MISSION_KINDS] ?? MISSION_KINDS.other;
    if (approve) {
      await db.insert(capeBonuses).values({ userId: c.userId, cape: await myCape(c.userId), points: pts, reason: `${k.label}: ${c.details.slice(0, 100)}`, source: "mission", createdById: me.id });
      await notify([c.userId], { type: "academy", title: `${k.emoji} +${pts} mission points!`, body: k.label, href: "/academy" });
    }
    await audit(me.id, approve ? "academy.claim_approved" : "academy.claim_declined", "claim", c.id, { points: pts });
    revalidatePath("/academy", "layout");
    return { ok: true, message: approve ? `Approved: +${pts}.` : "Declined." };
  });
}

/* ───── Captains & common rooms ───── */

async function captainOf(me: Pick<CurrentUser, "id">, a: AcademyConfig): Promise<Cape | null> {
  const cs = await captains(a);
  return (Object.entries(cs).find(([, uid]) => uid === me.id)?.[0] as Cape | undefined) ?? null;
}

export async function captainBonusAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const { me, a } = await academyUser();
    const cape = await captainOf(me, a);
    if (!cape) throw new UserError("Only this month's captain can give captain bonuses.");
    const toId = uuid.parse(str(fd, "userId"));
    if (toId === me.id) throw new UserError("Captains can't give themselves bonuses.");
    if ((await myCape(toId)) !== cape) throw new UserError("You can only give bonuses to your own Cape.");
    const points = Math.floor(Number(str(fd, "points")));
    if (!(points >= 1 && points <= CAPTAIN_BONUS_MAX)) throw new UserError(`Pick 1 to ${CAPTAIN_BONUS_MAX} points.`);
    const reason = str(fd, "reason").slice(0, 120);
    if (!reason) throw new UserError("Say what it's for.");
    const [{ used }] = await db.select({ used: sql<number>`coalesce(sum(${capeBonuses.points}),0)::int` }).from(capeBonuses)
      .where(and(eq(capeBonuses.createdById, me.id), eq(capeBonuses.source, "captain"), gte(capeBonuses.createdAt, new Date(Date.now() - 7 * 86400000))));
    if (Number(used) + points > CAPTAIN_BONUS_PER_WEEK) throw new UserError(`Captains can give ${CAPTAIN_BONUS_PER_WEEK} points a week. You have ${Math.max(0, CAPTAIN_BONUS_PER_WEEK - Number(used))} left.`);
    await db.insert(capeBonuses).values({ userId: toId, cape, points, reason, source: "captain", createdById: me.id });
    await notify([toId], { type: "academy", title: `👑 Your captain gave you +${points}!`, body: reason, href: `/academy/capes/${cape}` });
    revalidatePath(`/academy/capes/${cape}`);
    return { ok: true, message: `+${points} sent!` };
  });
}

export async function addBoardNoteAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const { me, a } = await academyUser();
    const cape = str(fd, "cape");
    if (!isCape(cape)) throw new UserError("Pick a Cape.");
    if (me.role !== "admin" && (await captainOf(me, a)) !== cape) throw new UserError("Only the captain can post on the board.");
    const body = str(fd, "body").slice(0, 300);
    if (!body) throw new UserError("Write a note first.");
    await db.insert(capeBoardNotes).values({ cape, body, createdById: me.id });
    revalidatePath(`/academy/capes/${cape}`);
    return { ok: true, message: "Pinned to the board." };
  });
}

export async function deleteBoardNoteAction(id: string): Promise<ActionResult> {
  return safe(async () => {
    const { me, a } = await academyUser();
    const [n] = await db.select().from(capeBoardNotes).where(eq(capeBoardNotes.id, uuid.parse(id)));
    if (!n) throw new UserError("That note is gone.");
    if (me.role !== "admin" && n.createdById !== me.id && (await captainOf(me, a)) !== n.cape) throw new UserError("Only the captain can remove board notes.");
    await db.delete(capeBoardNotes).where(eq(capeBoardNotes.id, n.id));
    revalidatePath(`/academy/capes/${n.cape}`);
    return { ok: true, message: "Note removed." };
  });
}

export async function setCapeIdentityAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const { me, a } = await academyUser();
    const cape = str(fd, "cape");
    if (!isCape(cape)) throw new UserError("Pick a Cape.");
    if (me.role !== "admin" && (await captainOf(me, a)) !== cape) throw new UserError("Only the captain can change the Cape's name and crest.");
    const name = str(fd, "name").replace(/\s+/g, " ").slice(0, 24);
    const crest = str(fd, "crest");
    if (crest && !isCrestId(crest)) throw new UserError("Pick a crest.");
    const academy = (await getSettings()).academy ?? {};
    const capes = { ...(academy.capes ?? {}), [cape]: { name: name || undefined, crest: crest || undefined } };
    await saveSettings({ academy: { ...academy, capes } });
    const chatId = academy.capeChats?.[cape] ?? (await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.dmKey, `cape:${cape}`)))[0]?.id;
    if (chatId) await db.update(conversations).set({ title: `${CAPES[cape].emoji} ${name || CAPES[cape].name}` }).where(eq(conversations.id, chatId));
    await audit(me.id, "academy.identity", "cape", cape, { name, crest });
    revalidatePath("/academy", "layout");
    return { ok: true, message: "Cape updated." };
  });
}

export async function suggestMottoAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const { me } = await academyUser();
    const cape = await myCape(me.id);
    if (!cape) throw new UserError("Get sorted into a Cape first.");
    const text = str(fd, "text").replace(/\s+/g, " ").slice(0, 60);
    if (text.length < 3) throw new UserError("Write a motto (a few words).");
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(capeMottos).where(and(eq(capeMottos.cape, cape), eq(capeMottos.createdById, me.id)));
    if (n >= 3) throw new UserError("You can suggest up to 3 mottos.");
    const [m] = await db.insert(capeMottos).values({ cape, text, createdById: me.id }).returning();
    await db.insert(capeMottoVotes).values({ cape, userId: me.id, mottoId: m.id }).onConflictDoUpdate({ target: [capeMottoVotes.cape, capeMottoVotes.userId], set: { mottoId: m.id } });
    revalidatePath(`/academy/capes/${cape}`);
    return { ok: true, message: "Motto added, and your vote is on it." };
  });
}

export async function voteMottoAction(mottoId: string): Promise<ActionResult> {
  return safe(async () => {
    const { me } = await academyUser();
    const cape = await myCape(me.id);
    const [m] = await db.select().from(capeMottos).where(eq(capeMottos.id, uuid.parse(mottoId)));
    if (!m || m.cape !== cape) throw new UserError("You can only vote for your own Cape's motto.");
    await db.insert(capeMottoVotes).values({ cape, userId: me.id, mottoId: m.id }).onConflictDoUpdate({ target: [capeMottoVotes.cape, capeMottoVotes.userId], set: { mottoId: m.id } });
    revalidatePath(`/academy/capes/${cape}`);
    return { ok: true, message: "Vote saved." };
  });
}

export async function deleteMottoAction(mottoId: string): Promise<ActionResult> {
  return safe(async () => {
    const { me } = await academyUser();
    const [m] = await db.select().from(capeMottos).where(eq(capeMottos.id, uuid.parse(mottoId)));
    if (!m) throw new UserError("That motto is gone.");
    if (m.createdById !== me.id && me.role !== "admin") throw new UserError("Only the person who suggested it (or an admin) can remove it.");
    await db.delete(capeMottos).where(eq(capeMottos.id, m.id));
    revalidatePath(`/academy/capes/${m.cape}`);
    return { ok: true, message: "Motto removed." };
  });
}

/* ───── Admin ───── */

export async function saveAcademySettingsAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const borders = z.enum(["off", "academy", "everywhere"]).parse(str(fd, "borders") || "academy");
    const capeCount = str(fd, "capeCount") === "4" ? 4 : 2;
    const academy = (await getSettings()).academy ?? {};
    await saveSettings({ academy: { ...academy, borders, capeCount } });
    await audit(me.id, "academy.settings", "settings", "1", { capeCount, borders });
    revalidatePath("/", "layout");
    return { ok: true, message: "Academy settings saved." };
  });
}

export async function createSeasonAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const name = str(fd, "name").slice(0, 60), startsOn = str(fd, "startsOn"), endsOn = str(fd, "endsOn");
    const theme = str(fd, "theme") === "winter" ? "winter" : null;
    if (!name) throw new UserError("Give the season a name, like “Winter Season”.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || !/^\d{4}-\d{2}-\d{2}$/.test(endsOn) || endsOn < startsOn) throw new UserError("Pick a start date and an end date after it.");
    const overlap = await db.select({ id: capeSeasons.id }).from(capeSeasons).where(and(sql`${capeSeasons.startsOn} <= ${endsOn}`, sql`${capeSeasons.endsOn} >= ${startsOn}`)).limit(1);
    if (overlap.length) throw new UserError("That overlaps another season. Change the dates or delete the other one.");
    await db.insert(capeSeasons).values({ name, startsOn, endsOn, theme });
    await audit(me.id, "academy.season", "season", name, { startsOn, endsOn, theme });
    revalidatePath("/academy", "layout");
    return { ok: true, message: `Season “${name}” created.` };
  });
}

export async function deleteSeasonAction(id: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    await db.delete(capeSeasons).where(eq(capeSeasons.id, uuid.parse(id)));
    await audit(me.id, "academy.season_deleted", "season", id);
    revalidatePath("/academy", "layout");
    return { ok: true, message: "Season deleted." };
  });
}

export async function giveBonusAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const a = await academySettings();
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
      label = capeLabel(cape, a.capes);
    } else {
      const [u] = await db.select({ id: users.id, name: users.name, cape: users.cape }).from(users).where(eq(users.id, uuid.parse(target)));
      if (!u) throw new UserError("Pick a Cape or a person.");
      await db.insert(capeBonuses).values({ userId: u.id, cape: u.cape, points, reason, createdById: me.id });
      label = u.name.split(" ")[0];
      await notify([u.id], { type: "academy", title: `⭐ +${points} bonus points!`, body: reason, href: "/academy" });
    }
    await audit(me.id, "academy.bonus", "bonus", target, { points, reason });
    revalidatePath("/academy", "layout");
    return { ok: true, message: `+${points} to ${label}!` };
  });
}

export async function resortMembersAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const a = await academySettings();
    const ids = all(fd, "userId");
    for (const id of ids) {
      const v = str(fd, `cape_${id}`);
      const cape = v === "" ? null : isCape(v) && activeCapes(a.capeCount).includes(v) ? v : undefined;
      if (cape === undefined) continue;
      const uid = uuid.parse(id);
      const [cur] = await db.select({ cape: users.cape }).from(users).where(eq(users.id, uid));
      if ((cur?.cape ?? null) === cape) continue;
      await db.update(users).set({ cape, sortedAt: cape ? new Date() : null }).where(eq(users.id, uid));
      await syncCapeChat(uid, cape, a);
    }
    await audit(me.id, "academy.resort", "users", String(ids.length));
    revalidatePath("/academy", "layout");
    return { ok: true, message: "Capes updated." };
  });
}

export async function setCaptainAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const cape = str(fd, "cape");
    if (!isCape(cape)) throw new UserError("Pick a Cape.");
    const userId = uuid.parse(str(fd, "userId"));
    if ((await myCape(userId)) !== cape) throw new UserError("The captain has to be in that Cape.");
    const academy = (await getSettings()).academy ?? {};
    const month = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }).slice(0, 7);
    await saveSettings({ academy: { ...academy, captains: { ...(academy.captains ?? {}), [cape]: { userId, month, manual: true } } } });
    await notify([userId], { type: "academy", title: "👑 You're your Cape's captain this month!", body: "Pin notes on the board, give small bonuses, and pick your Cape's crest.", href: `/academy/capes/${cape}` });
    await audit(me.id, "academy.captain", "cape", cape, { userId });
    revalidatePath("/academy", "layout");
    return { ok: true, message: "Captain set." };
  });
}

export async function createChallengeAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const title = str(fd, "title").slice(0, 80), details = str(fd, "details").slice(0, 400);
    const startsOn = str(fd, "startsOn"), endsOn = str(fd, "endsOn");
    const points = Math.floor(Number(str(fd, "points") || "10"));
    if (!title) throw new UserError("Give the challenge a title.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || !/^\d{4}-\d{2}-\d{2}$/.test(endsOn) || endsOn < startsOn) throw new UserError("Pick a start date and an end date after it.");
    if (!(points >= 1 && points <= 100)) throw new UserError("Points must be between 1 and 100.");
    await db.insert(academyChallenges).values({ title, details, startsOn, endsOn, points, createdById: me.id });
    await audit(me.id, "academy.challenge", "challenge", title);
    revalidatePath("/academy", "layout");
    return { ok: true, message: "Challenge posted." };
  });
}

export async function decideChallengeAction(id: string, cape: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    if (!isCape(cape)) throw new UserError("Pick the winning Cape.");
    const a = await academySettings();
    const [c] = await db.update(academyChallenges).set({ winnerCape: cape, decidedAt: new Date() })
      .where(and(eq(academyChallenges.id, uuid.parse(id)), isNull(academyChallenges.winnerCape))).returning();
    if (!c) throw new UserError("That challenge was already decided.");
    await db.insert(capeBonuses).values({ cape, points: c.points, reason: `Won the challenge: ${c.title}`, source: "challenge", createdById: me.id });
    const winners = await db.select({ id: users.id }).from(users).where(and(eq(users.status, "active"), eq(users.cape, cape)));
    await notify(winners.map((w) => w.id), { type: "academy", title: `🏆 The ${capeLabel(cape, a.capes)} won “${c.title}”!`, body: `+${c.points} for your Cape.`, href: `/academy/capes/${cape}` });
    await audit(me.id, "academy.challenge_won", "challenge", c.id, { cape });
    revalidatePath("/academy", "layout");
    return { ok: true, message: `${capeLabel(cape, a.capes)} wins! +${c.points}.` };
  });
}

export async function deleteChallengeAction(id: string): Promise<ActionResult> {
  return safe(async () => {
    await actionAdmin();
    await db.delete(academyChallenges).where(eq(academyChallenges.id, uuid.parse(id)));
    revalidatePath("/academy", "layout");
    return { ok: true, message: "Challenge removed." };
  });
}

export async function clearPlaneReportAction(id: string, remove: boolean): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    if (remove) await db.delete(paperPlanes).where(eq(paperPlanes.id, uuid.parse(id)));
    else await db.update(paperPlanes).set({ reportedAt: null }).where(eq(paperPlanes.id, uuid.parse(id)));
    await audit(me.id, remove ? "plane.delete" : "plane.restore", "paper_plane", id);
    revalidatePath("/academy", "layout");
    return { ok: true, message: remove ? "Plane deleted." : "Plane restored." };
  });
}

