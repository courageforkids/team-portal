import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages, onboardingProgress, onboardingSteps, pushSubscriptions, resources, users } from "@/db/schema";

export type StepStatus = {
  id: string; title: string; description: string; kind: "photo" | "notifications" | "chat_intro" | "resource" | "manual";
  href: string | null; resourceTitle: string | null; done: boolean; auto: boolean;
};

export const DEFAULT_STEPS = [
  { title: "Add a profile photo", description: "So the team knows who's who. Profile → Add photo.", kind: "photo" as const, position: 0 },
  { title: "Turn on phone notifications", description: "Open the portal from your home screen, then tap Turn on notifications.", kind: "notifications" as const, position: 1 },
  { title: "Read the Code of Conduct and Team Member Agreement", description: "Find them in Resources. Tick this when you've read both.", kind: "manual" as const, position: 2 },
  { title: "Say hi in the team chat", description: "Post a quick hello in the Everyone chat.", kind: "chat_intro" as const, position: 3 },
];

/** Creates the default steps the first time (only if none exist). */
export async function ensureDefaultSteps() {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(onboardingSteps);
  if (Number(n) === 0) await db.insert(onboardingSteps).values(DEFAULT_STEPS);
}

/** Every applicable step for these people, with done/not done. Auto steps are checked live. */
export async function onboardingStatus(userIds: string[]): Promise<Map<string, StepStatus[]>> {
  await ensureDefaultSteps();
  const out = new Map<string, StepStatus[]>();
  if (!userIds.length) return out;
  const [steps, people, progress, subs, intros] = await Promise.all([
    db.select({ s: onboardingSteps, rTitle: resources.title }).from(onboardingSteps).leftJoin(resources, eq(resources.id, onboardingSteps.resourceId))
      .where(eq(onboardingSteps.active, true)).orderBy(asc(onboardingSteps.position), asc(onboardingSteps.createdAt)),
    db.select({ id: users.id, role: users.role, avatar: users.avatarFileId }).from(users).where(inArray(users.id, userIds)),
    db.select().from(onboardingProgress).where(inArray(onboardingProgress.userId, userIds)),
    db.select({ userId: pushSubscriptions.userId }).from(pushSubscriptions).where(inArray(pushSubscriptions.userId, userIds)),
    db.selectDistinct({ userId: messages.authorId }).from(messages).innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(and(eq(conversations.kind, "team"), inArray(messages.authorId, userIds))),
  ]);
  const hasSub = new Set(subs.map((s) => s.userId)), hasIntro = new Set(intros.map((i) => i.userId));
  for (const p of people) {
    out.set(p.id, steps.filter(({ s }) => !s.roles.length || s.roles.includes(p.role)).map(({ s, rTitle }) => {
      const auto = s.kind === "photo" || s.kind === "notifications" || s.kind === "chat_intro";
      const done = s.kind === "photo" ? !!p.avatar : s.kind === "notifications" ? hasSub.has(p.id) : s.kind === "chat_intro" ? hasIntro.has(p.id)
        : progress.some((x) => x.userId === p.id && x.stepId === s.id);
      const href = s.kind === "photo" || s.kind === "notifications" ? "/profile" : s.kind === "chat_intro" ? "/messages" : s.resourceId ? `/resources/${s.resourceId}` : s.url;
      return { id: s.id, title: s.title, description: s.description, kind: s.kind, href, resourceTitle: rTitle, done, auto };
    }));
  }
  return out;
}
