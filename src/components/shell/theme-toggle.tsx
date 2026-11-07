"use client";
import { useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { cn } from "@/lib/cn";

type Theme = "light" | "dark" | "system";
function apply(t: Theme) {
  const d = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", d);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", d ? "#0d1117" : "#f7f7f5");
}
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => { try { setTheme((localStorage.getItem("cfk-theme") as Theme) || "light"); } catch {} }, []);
  const set = (t: Theme) => { setTheme(t); try { localStorage.setItem("cfk-theme", t); } catch {} apply(t); };
  const opts: [Theme, typeof Sun, string][] = [["light", Sun, "Light"], ["dark", Moon, "Dark"], ["system", Monitor, "System"]];
  return (
    <div role="radiogroup" aria-label="Theme" className="flex rounded-lg bg-surface-2 p-0.5">
      {opts.map(([t, Icon, label]) => (
        <button key={t} role="radio" aria-checked={theme === t} aria-label={label} title={label} onClick={() => set(t)}
          className={cn("grid h-7 flex-1 place-items-center rounded-md transition", theme === t ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg")}>
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
