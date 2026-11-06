import type { Tone } from "@/components/ui/badge";

export const ACC_TYPES = ["coaching_note", "documented_warning", "improvement_plan", "follow_up"] as const;
export type AccType = (typeof ACC_TYPES)[number];
export const ACC_TYPE_LABEL: Record<AccType, string> = {
  coaching_note: "Coaching note",
  documented_warning: "Documented warning",
  improvement_plan: "Improvement plan",
  follow_up: "Follow-up",
};
export const ACC_STATUSES = ["open", "in_progress", "resolved"] as const;
export type AccStatus = (typeof ACC_STATUSES)[number];
export const ACC_STATUS_LABEL: Record<AccStatus, string> = { open: "Open", in_progress: "In progress", resolved: "Resolved" };
export const ACC_STATUS_TONE: Record<AccStatus, Tone> = { open: "blue", in_progress: "violet", resolved: "green" };
export const ACC_TYPE_TONE: Record<AccType, Tone> = {
  coaching_note: "brand", documented_warning: "amber", improvement_plan: "violet", follow_up: "neutral",
};
