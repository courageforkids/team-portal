# Courage for Kids | Team Portal

The private operations home for the Courage for Kids team: assignments, submissions, reviews, deadlines,
announcements, calendar, projects, resources and performance tracking — in one secure web app.

*Their fight. Our mission.*

## What's inside

| Area | What it does |
|---|---|
| **Home** | Personal dashboard: greeting, overview stats, priorities, deadlines, events, recent activity, quick actions, onboarding |
| **Tasks** | My tasks / All tasks with list, board and calendar views; search, filters, sorting; recurring tasks; extensions; comments |
| **Submissions & review** | File/text/link/checklist submissions, full version history, Review Center for fast approve / request-revision |
| **Command center** (admin) | Organization-wide stats, team overview, department activity, recent submissions |
| **Performance** (admin) | Weekly/monthly metrics with explanations, workload distribution, on-time trend — no rankings |
| **Accountability** (admin only) | Private coaching notes, warnings, improvement plans, follow-ups |
| **Announcements** | Pinned, scheduled, targeted announcements with read acknowledgments |
| **Calendar** | Month / week / agenda views of deadlines and events, filters, .ics download and personal subscription feed |
| **Projects & departments** | Projects with milestones, documents and connected tasks; department pages |
| **Team directory & resources** | Profiles (no private data), searchable resource center with permission levels |
| **Settings** (admin) | Members, invitations, roles, departments, categories, reminders, recurring tasks, branding, email outbox, activity log, data export |

## Tech stack

- **Next.js 15** (App Router, Server Components, Server Actions), **React 19**, **TypeScript**, **Tailwind CSS v4**
- **PostgreSQL** via **Drizzle ORM** (SQL migrations in `drizzle/`)
- Built-in authentication: scrypt password hashing, DB-backed sessions in httpOnly cookies, invitation-only accounts
- File storage: any S3-compatible bucket (Cloudflare R2 recommended) or local disk; files are always served through a permission-checked route
- Email: Resend (optional, off by default — every message is kept in an outbox you can read)

## Local development

```bash
cp .env.example .env.local     # set DATABASE_URL, STORAGE_DRIVER=local, CRON_SECRET
npm install
npm run db:migrate             # create tables
npm run seed:demo              # FICTIONAL demo data (wipes the database!)
npm run dev                    # http://localhost:3000
```

Demo sign-ins (password `CourageDemo2026!`): `jacob@demo.cfk.test` (admin), `julia@demo.cfk.test` (leader), `sam@demo.cfk.test` (volunteer).

## Tests

```bash
npm run typecheck
npm run test:unit                                  # pure logic: deadlines, time zones, recurrence, metrics, passwords
E2E_BASE_URL=http://localhost:3000 npm run test:e2e  # full browser workflows (desktop + iPhone)
```

See `docs/TESTING.md` for the latest results.

## Docs

- `docs/DEPLOYMENT.md` — hosting, database, storage, email, DNS, costs, launch checklist
- `docs/SECURITY.md` — permissions model, privacy defaults, backups, retention and deletion
- `docs/CONVENTIONS.md` — how the code is organized (for future contributors)
