import "server-only";
import { ZodError } from "zod";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import type { ActionResult } from "@/lib/action";
import { AuthError } from "./auth";
import { UploadError } from "./storage";

export class UserError extends Error {}

/** Wraps an action so expected problems become friendly messages and unexpected ones never leak details. */
export async function safe<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (e) {
    if (isRedirectError(e)) throw e;
    if (e instanceof AuthError || e instanceof UploadError || e instanceof UserError) return { ok: false, error: e.message };
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
      return { ok: false, error: e.issues[0]?.message ?? "Please check the form.", fieldErrors };
    }
    console.error("[action error]", e);
    return { ok: false, error: "Something went wrong on our side. Please try again." };
  }
}

/** FormData helpers */
export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
export const optStr = (fd: FormData, k: string) => { const v = str(fd, k); return v === "" ? null : v; };
export const bool = (fd: FormData, k: string) => { const v = fd.get(k); return v === "on" || v === "true" || v === "1"; };
export const all = (fd: FormData, k: string) => fd.getAll(k).map((v) => String(v)).filter(Boolean);
export const filesOf = (fd: FormData, k: string) => fd.getAll(k).filter((v): v is File => typeof v === "object" && v !== null && "size" in v && (v as File).size > 0);
