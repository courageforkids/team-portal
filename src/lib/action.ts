/** Result type shared by every server action. */
export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T; redirectTo?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export const initialResult = null as ActionResult<unknown> | null;
