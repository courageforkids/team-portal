/** Shared labels for Courage HQ. What each column means depends on the item's kind. */
export const HQ_KINDS = ["task", "grant", "gift", "contact"] as const;
export type HqKind = (typeof HQ_KINDS)[number];

export const HQ_TABS: { key: HqKind; label: string }[] = [
  { key: "task", label: "Tasks" }, { key: "grant", label: "Grants" }, { key: "gift", label: "Gifts" }, { key: "contact", label: "People" },
];

export const TASK_AREAS = ["Admin", "Courage Boxes", "Events", "Fundraising", "Grants", "Sponsors", "Social media", "Team", "Volunteers", "Families & stories"];
export const GRANT_STATUSES = ["Researching", "Drafting", "Submitted", "Won", "Declined"];
export const GRANT_OPEN = ["Researching", "Drafting", "Submitted"];
export const GIFT_KINDS = ["Cash", "In-kind"];
export const CONTACT_TYPES = ["Sponsor", "Hospital", "Partner", "Media", "Donor", "Other"];

/** Extra fields kept per kind (stored in `extra`). */
export const HQ_EXTRA: Record<HqKind, string[]> = {
  task: ["deliverable", "doneWhen", "priority"],
  grant: ["reportDue"],
  gift: [],
  contact: ["email", "phone", "instagram", "lastContact"],
};

/** Column meaning per kind, for forms and the API. */
export const HQ_FIELDS: Record<HqKind, { title: string; subtitle: string; category: string; date: string; person?: string; amount?: string; nextStep?: string }> = {
  task: { title: "Task", subtitle: "Related to", category: "Area", date: "Due", person: "Owner" },
  grant: { title: "Funder", subtitle: "Program", category: "Status", date: "Deadline", amount: "Amount", nextStep: "Next step" },
  gift: { title: "Donor", subtitle: "What they gave", category: "Kind", date: "Date", amount: "Amount (cash only)" },
  contact: { title: "Name", subtitle: "Organization", category: "Type", date: "Next follow-up", nextStep: "Next step" },
};

export const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
