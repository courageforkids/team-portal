/** "$1,250.50" → 125050. Returns null for blank; throws on nonsense. */
export function parseMoney(v: string): number | null {
  const s = v.replace(/[$,\s]/g, "");
  if (!s) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error("Enter an amount like 25 or 1,250.50");
  const cents = Math.round(Number(s) * 100);
  if (cents > 100_000_000_00) throw new Error("That amount is too large.");
  return cents;
}

export function fmtMoney(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });
}

export const GIFT_TYPE_LABEL = { cash: "Money", in_kind: "Donated items", other: "Other (stock, DAF, vehicle…)" } as const;
export const DONOR_KIND_LABEL = { individual: "Individual", business: "Business", foundation: "Foundation", school: "School", church: "Church", other: "Other" } as const;
export const GIFT_METHODS = ["Cash", "Check", "Card", "Online", "Venmo", "PayPal", "Zelle", "Other"] as const;
