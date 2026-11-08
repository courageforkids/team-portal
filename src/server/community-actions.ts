"use server";
import { and, eq, inArray } from "drizzle-orm";
import { isDraftIntent, saveFormDraft } from "@/server/drafts";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { pollVotes, polls, shoutoutCheers, shoutoutRecipients, shoutouts, users } from "@/db/schema";
import { actionUser, AuthError } from "./auth";
import { all, bool, safe, str, UserError } from "./safe-action";
import { audienceMatches } from "./policy";
import { notify } from "./notify";
import { rateLimit } from "./rate-limit";
import { audit } from "./audit";
import { parseLocalInput, DEFAULT_TZ } from "@/lib/dates";
import { SHOUTOUT_BADGES } from "@/lib/community";
import type { ActionResult } from "@/lib/action";

const uuid = z.string().uuid();

/* ───────── Polls ───────── */

export async function createPollAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    // "Save as draft": store it privately instead (admins only); publishing later runs this same action.
    if (isDraftIntent(fd) && !fd.get("id")) return saveFormDraft("poll", fd, str(fd, "question")) as Promise<never>;
    const me = await actionUser();
    if (me.role === "volunteer") throw new AuthError("Only leaders and administrators can create polls.");
    const question = str(fd, "question").slice(0, 200);
    if (question.length < 3) throw new UserError("Write the question.");
    const labels = all(fd, "option").map((o) => o.trim().slice(0, 100)).filter(Boolean);
    const unique = [...new Set(labels)];
    if (unique.length < 2) throw new UserError("Add at least 2 different choices.");
    if (unique.length > 12) throw new UserError("Up to 12 choices.");
    const closesRaw = str(fd, "closesAt");
    const closesAt = closesRaw ? parseLocalInput(closesRaw, DEFAULT_TZ) : null;
    if (closesRaw && (!closesAt || closesAt <= new Date())) throw new UserError("Pick a closing time in the future.");
    const roles = all(fd, "roles").filter((r): r is "admin" | "leader" | "volunteer" => ["admin", "leader", "volunteer"].includes(r));
    const showResults = z.enum(["always", "after_vote", "after_close"]).parse(str(fd, "showResults") || "after_vote");
    const [p] = await db.insert(polls).values({
      question, description: str(fd, "description").slice(0, 1000), options: unique.map((label) => ({ id: randomUUID().slice(0, 8), label })),
      multiple: bool(fd, "multiple"), anonymous: bool(fd, "anonymous"), showResults, audience: roles.length ? { roles } : {}, closesAt, createdById: me.id,
    }).returning();
    const people = await db.select({ id: users.id, role: users.role, departmentId: users.departmentId }).from(users).where(eq(users.status, "active"));
    await notify(people.filter((x) => audienceMatches(p.audience, x)).map((x) => x.id), {
      type: "announcement", title: `New poll: ${question}`, body: closesAt ? "Vote before it closes." : "Tap to vote.", href: `/polls#poll-${p.id}`, dedupeKey: `poll:${p.id}`, excludeUserId: me.id,
    });
    return { ok: true, message: "Poll posted." };
  });
}

export async function votePollAction(pollId: string, optionIds: string[]): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const p = (await db.select().from(polls).where(eq(polls.id, uuid.parse(pollId))).limit(1))[0];
    if (!p || !audienceMatches(p.audience, me)) throw new UserError("That poll isn't available.");
    if (p.closedAt || (p.closesAt && p.closesAt <= new Date())) throw new UserError("This poll is closed.");
    const valid = [...new Set(optionIds)].filter((id) => p.options.some((o) => o.id === id));
    if (!valid.length) throw new UserError("Pick a choice.");
    if (!p.multiple && valid.length > 1) throw new UserError("Pick just one.");
    await db.insert(pollVotes).values({ pollId: p.id, userId: me.id, optionIds: valid })
      .onConflictDoUpdate({ target: [pollVotes.pollId, pollVotes.userId], set: { optionIds: valid, votedAt: new Date() } });
    return { ok: true, message: "Vote saved. You can change it until the poll closes." };
  });
}

export async function closePollAction(pollId: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const p = (await db.select().from(polls).where(eq(polls.id, uuid.parse(pollId))).limit(1))[0];
    if (!p) throw new UserError("That poll no longer exists.");
    if (p.createdById !== me.id && me.role !== "admin") throw new AuthError("Only the person who made the poll or an administrator can close it.");
    await db.update(polls).set({ closedAt: new Date() }).where(eq(polls.id, p.id));
    return { ok: true, message: "Poll closed." };
  });
}

export async function deletePollAction(pollId: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const p = (await db.select().from(polls).where(eq(polls.id, uuid.parse(pollId))).limit(1))[0];
    if (!p) throw new UserError("That poll was already deleted.");
    if (p.createdById !== me.id && me.role !== "admin") throw new AuthError();
    await db.delete(polls).where(eq(polls.id, p.id));
    await audit(me.id, "poll.delete", "poll", p.id, { question: p.question });
    return { ok: true, message: "Poll deleted." };
  });
}

/* ───────── Shout-outs ───────── */

export async function giveShoutoutAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const to = [...new Set(all(fd, "to").filter((x) => uuid.safeParse(x).success && x !== me.id))];
    if (!to.length) throw new UserError("Pick who you're giving a shout-out to.");
    const message = str(fd, "message").slice(0, 500);
    if (message.length < 3) throw new UserError("Say what they did. A sentence is perfect.");
    const badge = SHOUTOUT_BADGES.some((b) => b.key === str(fd, "badge")) ? str(fd, "badge") : "thanks";
    if (!(await rateLimit(`shoutout:${me.id}`, 15, 3600))) throw new UserError("That's a lot of shout-outs! Try again in a bit.");
    const people = await db.select({ id: users.id }).from(users).where(and(inArray(users.id, to), eq(users.status, "active")));
    if (people.length !== to.length) throw new UserError("Someone you picked isn't active.");
    const [s] = await db.insert(shoutouts).values({ fromId: me.id, message, badge }).returning();
    await db.insert(shoutoutRecipients).values(to.map((userId) => ({ shoutoutId: s.id, userId })));
    await notify(to, { type: "task_updated", title: `${me.name.split(" ")[0]} gave you a shout-out! 🎉`, body: message.slice(0, 140), href: `/shoutouts#s-${s.id}` });
    return { ok: true, message: "Shout-out posted! 🎉" };
  });
}

export async function toggleCheerAction(shoutoutId: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const id = uuid.parse(shoutoutId);
    const existing = (await db.select().from(shoutoutCheers).where(and(eq(shoutoutCheers.shoutoutId, id), eq(shoutoutCheers.userId, me.id))).limit(1))[0];
    if (existing) await db.delete(shoutoutCheers).where(and(eq(shoutoutCheers.shoutoutId, id), eq(shoutoutCheers.userId, me.id)));
    else await db.insert(shoutoutCheers).values({ shoutoutId: id, userId: me.id }).onConflictDoNothing();
    return { ok: true };
  });
}

export async function deleteShoutoutAction(shoutoutId: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const s = (await db.select().from(shoutouts).where(eq(shoutouts.id, uuid.parse(shoutoutId))).limit(1))[0];
    if (!s) throw new UserError("Already removed.");
    if (s.fromId !== me.id && me.role !== "admin") throw new AuthError();
    await db.delete(shoutouts).where(eq(shoutouts.id, s.id));
    if (s.fromId !== me.id) await audit(me.id, "shoutout.remove", "shoutout", s.id);
    return { ok: true, message: "Shout-out removed." };
  });
}
