# Courage for Kids Team Portal

Internal team portal for Courage for Kids (student-run 501(c)(3), Spartanburg SC). Next.js 15 + Postgres (Drizzle). Read `docs/CONVENTIONS.md` before changing code; `README.md` and `docs/` cover deployment, security and tests.

## Acting in the live portal for Jacob (the Executive Director)
- Live portal: https://team-portal-five-smoky.vercel.app (may move to https://team.teamcourageforkids.org).
- If the environment has `PORTAL_API_KEY`, use the API in `docs/API.md` to create/update tasks, announcements, events, sign-up shifts and resources, and to check what's waiting for review. Set `PORTAL_URL` to the live address if it isn't set.
- Start with `GET /api/v1/lookups` to get exact names; people can be passed by first name when unique.
- Never print, echo or commit the key. Never ask Jacob to paste a key or password into chat; it belongs in the environment's secrets.
- Confirm with Jacob before anything that notifies the whole team at once (announcements, team-wide tasks) unless he already asked for it in his own words.
- Never put patient names, photos or medical details into the portal.

## Shipping code
- `main` auto-deploys to Vercel; database migrations in `drizzle/` run automatically during the deploy (`scripts/deploy-setup.ts`).
- Before pushing: `npx tsc --noEmit`, `npx eslint src tests`, `npm run test:unit`, and the Playwright suite against a local build (see `docs/TESTING.md`).
