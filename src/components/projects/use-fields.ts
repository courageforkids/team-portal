"use client";
import { useState, type ChangeEvent } from "react";

/**
 * Keeps form values in state so they survive React's automatic form reset after a server action
 * (otherwise a validation error would wipe what the person typed).
 */
export function useFields<T extends Record<string, string>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const bind = (name: keyof T & string) => ({
    name, value: values[name],
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setValues((v) => ({ ...v, [name]: e.target.value })),
  });
  return { values, setValues, bind, reset: () => setValues(initial) };
}
