import Link from "next/link";
import { cn } from "@/lib/cn";
import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent" | "subtle";
type Size = "sm" | "md" | "lg" | "icon";

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(
    "focus-ring inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold whitespace-nowrap select-none",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:scale-[.98]",
    "disabled:opacity-55 disabled:pointer-events-none",
    size === "sm" && "h-8 px-3 text-[13px]",
    size === "md" && "h-10 px-4 text-sm",
    size === "lg" && "h-12 px-5 text-[15px]",
    size === "icon" && "h-9 w-9 text-sm",
    variant === "primary" && "bg-brand text-brand-fg shadow-soft hover:bg-brand-hover",
    variant === "secondary" && "bg-surface text-fg border border-line-strong shadow-soft hover:bg-surface-2",
    variant === "ghost" && "text-fg-2 hover:bg-surface-2 hover:text-fg",
    variant === "subtle" && "bg-surface-2 text-fg-2 hover:bg-surface-3 hover:text-fg",
    variant === "danger" && "bg-bad text-white hover:opacity-90",
    variant === "accent" && "bg-accent text-[#1a1a1a] shadow-soft hover:brightness-95",
    extra,
  );
}

export function Button({ variant, size, className, ...p }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button {...p} className={buttonClass(variant, size, className)} />;
}

export function ButtonLink({ variant, size, className, ...p }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link {...p} className={buttonClass(variant, size, className)} />;
}
