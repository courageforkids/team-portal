"use client";
import { useEffect, useRef, type ComponentProps } from "react";
import { Select } from "@/components/ui/form";

/**
 * A controlled Select that survives React's automatic form reset after a server action.
 * (React restores controlled inputs but not selects, so we re-apply the value on the form's reset event.)
 */
export function KeepSelect(p: ComponentProps<"select">) {
  const ref = useRef<HTMLSelectElement>(null);
  const value = useRef(p.value);
  value.current = p.value;
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const onReset = () => setTimeout(() => { if (ref.current && value.current !== undefined) ref.current.value = String(value.current); });
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);
  return <Select ref={ref} {...p} />;
}
