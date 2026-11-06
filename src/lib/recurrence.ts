import { addDays, addMonths } from "date-fns";
export type Rule = "weekly" | "biweekly" | "monthly" | "custom";
export function nextOccurrence(from: Date, rule: Rule, intervalDays?: number | null) {
  if (rule === "weekly") return addDays(from, 7);
  if (rule === "biweekly") return addDays(from, 14);
  if (rule === "monthly") return addMonths(from, 1);
  return addDays(from, Math.max(1, intervalDays ?? 7));
}
