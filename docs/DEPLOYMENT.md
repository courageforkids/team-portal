# Deployment guide

> Nothing has been purchased, deployed or changed in DNS. Every step below needs the Executive Director's approval.

## Recommended setup

| Piece | Service | Why | Cost |
|---|---|---|---|
| Web app | **Vercel** (or Netlify) | Built for Next.js, automatic HTTPS, deploys from GitHub | See note below |
| Database | **Neon Postgres** (Free plan) | Managed Postgres, branching, point-in-time restore | $0 — 1 GB storage, 100 compute-hours/month |
| File storage | **Cloudflare R2** (private bucket) | S3-compatible, **no download (egress) fees** | $0 up to 10 GB, then $0.015/GB-month |
| Email (later, optional) | **Resend** | Simple API, one verified domain free | $0 — 3,000/month, 100/day |
| Scheduled reminders | **GitHub Actions** (`.github/workflows/reminders.yml`) | Free scheduler every 30 min | $0 |

**Hosting note.** Vercel's free Hobby plan is officially for personal, non-commercial use, and Vercel's documentation doesn't clearly say whether a nonprofit team's internal tool qualifies. Choose one:
1. **Vercel Pro — about $20/month per member who deploys** (only Jacob needs a seat). Clearly allowed; the simplest option.
2. Ask Vercel support whether a 501(c)(3)'s internal tool may run on Hobby, or check whether Vercel offers a nonprofit program.
3. Deploy to **Netlify's free plan**, which also supports Next.js. Confirm its current terms first.

### Estimated monthly cost (8–30 people, ~a few hundred tasks/month, mostly photos and PDFs)
- **$0/month** on free tiers (Netlify, or Vercel Hobby if Vercel confirms it's allowed).
- **About $20/month** with Vercel Pro.
- When you'd start paying more: more than 10 GB of uploads (about $0.15/month per extra 10 GB on R2), more than 1 GB of database (Neon Launch plan, usage-based), or more than 100 emails/day (Resend Pro, about $20/month). At the expected team size, none of these are likely in year one.

## One-time setup (≈ 45 minutes)

1. **GitHub:** put this folder in a **private** repository under the organization's account.
2. **Neon:** create a project (region: US East) → copy the *pooled* connection string → that's `DATABASE_URL`.
3. **Cloudflare R2:** create bucket `cfk-portal-files` (keep it **private**, no public URL) → create an API token with Object Read & Write for that bucket → note the endpoint, access key and secret.
4. **Vercel/Netlify:** import the GitHub repo. Set environment variables from `.env.example`:
   `DATABASE_URL`, `APP_URL=https://team.teamcourageforkids.org`, `CRON_SECRET` (run `openssl rand -hex 32`), `STORAGE_DRIVER=s3`, `S3_ENDPOINT`, `S3_REGION=auto`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.
   Secrets live only in the host's environment settings, never in the code.
5. **Create the tables:** on your computer, `DATABASE_URL=<neon url> npm run db:migrate`.
6. **Create your administrator account** (no demo data):
   `DATABASE_URL=<neon url> ADMIN_EMAIL=jacob@teamcourageforkids.org ADMIN_NAME="Jacob Rogers" ADMIN_PASSWORD='<strong password>' npm run bootstrap`
7. **Custom subdomain** (needs DNS approval): in the host, add domain `team.teamcourageforkids.org`. It will show a DNS record, usually `CNAME team → cname.vercel-dns.com`. Add that record in **Wix → Domains → Manage DNS records**. HTTPS is issued automatically within minutes.
8. **Reminders:** in GitHub → Settings → Secrets → Actions, add `PORTAL_URL` and `CRON_SECRET`. The workflow then runs every 30 minutes.
9. Sign in, then go to **Settings → Invitations** and invite the team. Each invite link is shown for you to copy and text or email yourself until email is turned on.

## Phone notifications
1. Run `npx web-push generate-vapid-keys` once.
2. Add `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` to the host's environment variables, then redeploy.
3. Each member taps **Turn on notifications** (on Home or in Profile). On iPhone, they must first add the portal to the Home Screen (iOS 16.4 or newer).
Alerts follow each member's notification preferences. Expired devices are removed automatically. If the keys are missing, the feature stays hidden.

## Turning on email (optional, needs approval)
1. Create a Resend account and add the domain `teamcourageforkids.org`. Resend shows 3 DNS records (SPF/DKIM); add them in Wix DNS.
2. Put `RESEND_API_KEY` in the host's environment variables and redeploy.
3. In the portal: **Settings → Email** → set the sender (e.g. `Courage for Kids <portal@teamcourageforkids.org>`), then flip the switch (it asks you to type ENABLE).
Until then, every email the system *would* send is kept in Settings → Email → Outbox, and **nothing leaves the system**.

## Launch checklist
- [ ] Hosting plan chosen and approved (Vercel Pro / Netlify / confirmed Hobby)
- [ ] Neon, R2, host accounts created under an organization email (with an adult advisor as a second owner)
- [ ] Environment variables set; `db:migrate` and `bootstrap` run
- [ ] DNS record added for `team.teamcourageforkids.org`
- [ ] Signed in as admin; reviewed Settings (departments, categories, reminder times, quiet hours)
- [ ] Replaced sample Resources with the real Handbook, Code of Conduct, Leadership Expectations, Submission Guidelines
- [ ] Invited one leader as a pilot, ran one full task → submit → review cycle
- [ ] Invited the rest of the team
- [ ] First monthly JSON export saved to the admin-only Drive folder

## Updating the app
Push to the `main` branch → the host redeploys automatically. If a change adds a migration (`drizzle/*.sql`), run `npm run db:migrate` against the production `DATABASE_URL` before or right after deploying.
