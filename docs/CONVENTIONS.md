# Team Portal — engineering conventions

Read this before adding a page or action.

## Layout
- `src/app/(auth)/…` public sign-in pages. `src/app/(app)/…` signed-in pages (shell layout with sidebar + mobile nav).
- `src/server/*` server-only modules (DB, auth, policy, notifications, storage). Never import these into client components.
- `src/components/ui/*` design-system primitives. `src/components/tasks/task-bits.tsx` task cards/rows/badges.
- `src/lib/*` shared helpers safe for client and server (`task-meta.ts`, `dates.ts`, `cn.ts`, `action.ts`).

## Authorization (non-negotiable)
- Pages: `const me = await requireUser()` or `await requireAdmin()` from `@/server/auth` at the top of every page.
- Server actions: start with `actionUser()` / `actionAdmin()`; wrap the body in `safe(async () => { … })` from `@/server/safe-action`
  and return `ActionResult` (`{ ok: true, message?, redirectTo? } | { ok: false, error }`). Throw `UserError("friendly msg")` for validation problems.
- Visibility helpers live in `@/server/policy`: `taskVisibilityWhere`, `taskAccess`, `visibilityAllowed`, `allowedVisibilities`, `audienceMatches`, `canViewAnnouncement`.
- Roles: `admin` (Executive Administrator), `leader` (Leadership Member), `volunteer`. Volunteers never see projects/departments pages or leadership-only content.
- Accountability records: admin only, everywhere, always checked server-side.
- Log important admin changes with `audit(actorId, "thing.verb", "targetType", targetId, detail)` from `@/server/audit`.

## Data
- Drizzle ORM, schema in `src/db/schema.ts`, client `db` from `@/db`. Schema changes: edit schema, then `npx drizzle-kit generate --name <what>`.
- Task lists: always use `loadTasks(viewer, filters)` from `@/server/queries` (applies visibility). People/departments: `getPeople()`, `getDepartments()`.
- Notifications: `notify(userIds, { type, title, body, href, dedupeKey })` from `@/server/notify`. Email goes to the outbox; nothing is sent unless an admin enables it.
- Files: `saveUploads(files, { type, id }, userId)` from `@/server/storage`; link to `/api/files/<id>` (add `?inline=1` to preview images/PDFs). The route re-checks permission.
- Dates: store UTC `timestamptz`. Show with `fmtDate`/`fmtDateTime`/`dueLabel` from `@/lib/dates` using the record's or user's timezone. Parse `datetime-local` inputs with `parseLocalInput(value, tz)`.

## UI
- Page skeleton: `<PageHeader title description actions />`, then content in `Card`s. Use `EmptyState` for empty lists (helpful text + an action when the viewer can act).
- Forms: client component with `<ActionForm action={serverAction}>` + `Field`, `Input`, `Textarea`, `Select`, `Checkbox`, `SubmitButton` from `@/components/ui/form`.
  ActionForm shows toasts, refreshes the page, follows `redirectTo`.
- Destructive actions: `<ConfirmAction … />` from `@/components/ui/confirm`.
- Colors: only theme tokens (`bg-surface`, `text-fg`, `text-muted`, `border-line`, `bg-brand`, `text-brand-ink`, `bg-brand-soft`, `bg-accent`, `bg-accent-soft`,
  `text-ok/warn/bad/violet`, `bg-*-soft`). Never raw hex for UI chrome (dark mode depends on tokens). Department colors (data) are fine as inline styles.
- Icons: `lucide-react`, `h-4 w-4` inline, `aria-hidden` when decorative. Touch targets ≥ 40px on mobile. Every input has a label.
- Copy: warm, plain, short. Never shame members; overdue is shown calmly. No fake numbers or dead buttons — if a control is shown it must work.
