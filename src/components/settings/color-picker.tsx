"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { PALETTE } from "./palette";

/** Radio-group color picker limited to the curated palette (keeps the current color if it's custom). */
export function ColorPicker({ name, defaultValue, legend = "Color" }: { name: string; defaultValue?: string; legend?: string }) {
  const options: { value: string; name: string }[] = [...PALETTE];
  if (defaultValue && !options.some((o) => o.value.toLowerCase() === defaultValue.toLowerCase())) options.push({ value: defaultValue, name: "Current color" });
  const initial = options.find((o) => o.value.toLowerCase() === (defaultValue ?? "").toLowerCase())?.value ?? PALETTE[0].value;
  const [value, setValue] = useState(initial);
  return (
    <fieldset>
      <legend className="label">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="relative cursor-pointer" title={o.name}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => setValue(o.value)} className="peer sr-only" />
            <span className={cn("grid h-10 w-10 place-items-center rounded-full ring-offset-2 ring-offset-surface transition peer-focus-visible:ring-2 peer-focus-visible:ring-brand",
              value === o.value ? "ring-2 ring-fg" : "hover:scale-105")} style={{ background: o.value }}>
              {value === o.value && <Check className="h-4 w-4 text-white" aria-hidden />}
            </span>
            <span className="sr-only">{o.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
