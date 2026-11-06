/** Shared (client + server) announcement vocabulary. */
import type { Tone } from "@/components/ui/badge";

export const ANNOUNCEMENT_CATEGORIES = ["update", "reminder", "event", "news", "policy", "meeting"] as const;
export type AnnouncementCategory = (typeof ANNOUNCEMENT_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<AnnouncementCategory, string> = {
  update: "Update", reminder: "Reminder", event: "Event", news: "News", policy: "Policy", meeting: "Meeting",
};

export const CATEGORY_TONE: Record<AnnouncementCategory, Tone> = {
  update: "brand", reminder: "amber", event: "violet", news: "green", policy: "neutral", meeting: "blue",
};

export function asCategory(v: string | null | undefined): AnnouncementCategory | null {
  return (ANNOUNCEMENT_CATEGORIES as readonly string[]).includes(v ?? "") ? (v as AnnouncementCategory) : null;
}

export const AUDIENCE_ROLE_LABEL = { admin: "Administrators", leader: "Leadership", volunteer: "Volunteers" } as const;

/** "Everyone", "Leadership", "Volunteers · Outreach", … */
export function audienceLabel(
  a: { roles?: ("admin" | "leader" | "volunteer")[]; departmentIds?: string[] } | null | undefined,
  deptNames: Map<string, string>,
) {
  const parts: string[] = [];
  if (a?.roles?.length) parts.push(a.roles.map((r) => AUDIENCE_ROLE_LABEL[r]).join(" & "));
  if (a?.departmentIds?.length) parts.push(a.departmentIds.map((d) => deptNames.get(d) ?? "Former department").join(", "));
  return parts.length ? parts.join(" · ") : "Everyone";
}

/** Plain one-line excerpt for cards. */
export function excerpt(body: string, max = 180) {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max).replace(/\s+\S*$/, "") + "…" : flat;
}
