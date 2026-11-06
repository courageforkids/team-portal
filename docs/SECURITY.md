# Security & privacy

The portal is used by students, including minors. Defaults are privacy-first.

## Accounts
- **No public registration.** Accounts are created only from an administrator's invitation link (single use, expires in 7 days, stored as a SHA-256 hash).
- Passwords: scrypt (N=16384) with per-user salt; at least 10 characters with a number or symbol.
- Sessions: random 256-bit token in an `httpOnly`, `SameSite=Lax`, `Secure` cookie; only its hash is stored. 30-day sliding expiry. Password changes/resets sign out other devices. Deactivating a member deletes all their sessions immediately.
- Rate limits (stored in Postgres, so they work across servers): sign-in 8 attempts / 15 min per email and 30 per IP; reset requests 3/hour per email; password changes 5 / 15 min.
- Sign-in errors never reveal whether an email exists.

## Roles & permissions (enforced on the server for every page, action and file)
| | Executive Administrator | Leadership Member | Volunteer |
|---|---|---|---|
| Own tasks, submit work, request extensions | ✓ | ✓ | ✓ |
| Create / assign / edit tasks, settings, invitations | ✓ | — | — |
| Review submissions | ✓ (all) | only tasks where they're the named reviewer | — |
| See others' tasks | all | tasks in projects they direct / departments they lead / they review | — |
| Projects & departments | manage | view (directors manage their milestones/docs) | — |
| Performance, command center, exports | ✓ | — | — |
| Accountability records | ✓ only | never | never |
| Announcements / events / resources | all | content for everyone + leadership | content for everyone |

Central rules live in `src/server/policy.ts`. Hiding a button is never the only protection.

## Files
- Uploads are limited to 25 MB each, 10 per submission, to an allowlist of image/PDF/Office/video/audio types, and checked by content (a renamed executable is rejected).
- The storage bucket is private. Every download goes through `/api/files/[id]`, which re-checks that the viewer may see the task, submission, announcement or resource the file belongs to. Responses are sandboxed (`Content-Security-Policy: sandbox`, `nosniff`).

## Privacy rules for the team
- **Never put patient names, photos, diagnoses or family details in tasks, submissions or comments** unless the family has given written consent through the established consent procedure. The task system is not a place for medical or family records.
- Members' emails show in the directory only if they choose to.
- Performance numbers are visible only to administrators, are never ranked, and never trigger automatic consequences.
- Accountability records are visible only to Executive Administrators; viewing them is logged.

## Audit trail
Sign-ins, invitations, role changes, deactivations, task creation/edits/deletion, reviews, extension decisions, accountability changes, setting changes and data exports are written to the activity log (Settings → Activity log).

## Backups & recovery
- **Database:** Neon and Supabase keep point-in-time restore on their free tiers for a limited window (check the current plan). In addition, an administrator should download **Settings → Data export → JSON** at least monthly and store it in the organization's Google Drive (restricted to admins).
- For a full backup: `pg_dump "$DATABASE_URL" -Fc -f cfk-portal-$(date +%F).dump` · restore with `pg_restore -d "$NEW_DATABASE_URL" --clean cfk-portal-YYYY-MM-DD.dump`.
- **Files:** enable object versioning or a periodic copy of the R2 bucket (e.g. `rclone sync r2:cfk-portal-files ./backup`).
- Test a restore once per semester into a scratch database.

## Retention & deletion
- Notifications older than 12 months and email-outbox rows older than 6 months can be deleted (`delete from notifications where created_at < now() - interval '12 months'`).
- When a member leaves: **deactivate** (keeps their work history for the organization, blocks sign-in). If they or a parent ask for deletion, an admin can export their records first and then delete the user row — their tasks remain, with authorship shown as "Former member".
- Accountability records: keep only as long as needed (suggest resolving and deleting one year after resolution).
- Demo data (`@demo.cfk.test`) must never be loaded into production; the seed script refuses when `NODE_ENV=production`.
