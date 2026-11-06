/** Curated department/category colors. All read well as small dots and bars in light and dark mode. */
export const PALETTE = [
  { value: "#004F81", name: "Navy" },
  { value: "#0E7490", name: "Teal" },
  { value: "#15803D", name: "Green" },
  { value: "#4D7C0F", name: "Olive" },
  { value: "#B45309", name: "Amber" },
  { value: "#C2410C", name: "Orange" },
  { value: "#BE185D", name: "Pink" },
  { value: "#B42318", name: "Red" },
  { value: "#7C3AED", name: "Violet" },
  { value: "#4338CA", name: "Indigo" },
  { value: "#64748B", name: "Slate" },
] as const;
export const PALETTE_VALUES: string[] = PALETTE.map((p) => p.value);
export const REMINDER_OPTIONS = [72, 48, 24, 12, 2] as const;
