---
paths:
  - ".github/**"
  - "scripts/**"
  - "Dockerfile"
  - "docker-compose.yml"
  - "start.sh"
  - "railway.toml"
  - "src/lib/storage.ts"
  - "src/lib/email.ts"
  - "src/app/api/version/**"
  - "src/app/api/upload/**"
---

# Operations

## Deploys

- Production is Railway, deploying `main` on push. The environment must stay linked to the branch: it silently was not for two months in 2026, and the site looked healthy the whole time.
- Verify a deploy with `curl -s https://www.ourplaceonline.com/api/version` against `git rev-parse main`. A healthy site is not evidence of a landed deploy. `deploy-drift.yml` runs this comparison every morning.
- Railway traps: "Redeploy" replays the same image (use "Deploy latest commit"), and a deployment header id is a Railway id, not a git sha.
- `start.sh` runs `prisma migrate deploy` on every container start, so migrations ship with the code. Never `db push` against production.
- The image copies full `node_modules`, devDependencies included, because Next's standalone tracing misses Prisma's runtime deps. Known bloat. `npm audit --omit=dev` flags a MySQL driver Prisma's CLI pulls in that nothing here can reach.

## CI (`ci.yml`)

Runs format, lint at zero warnings, tsc, tests, and a production build on every push. The build needs the same throwaway `JWT_SECRET` and `DATABASE_URL` placeholders the Dockerfile sets, because `next build` evaluates module-level code. `.npmrc` disables install scripts, so `npm run db:generate` runs after install. Leave Railway's "Wait for CI" off until CI has been reliably green for a while.

## Backups

- Railway backups are Pro-plan only. `scripts/backup-db.ts` (nightly via `backup-db.yml`) dumps to a private R2 bucket, verifies the stored object, and prunes past 30 days. `verify-restore.yml` restores the newest archive weekly into a throwaway Postgres and checks row counts.
- Dumps must never go in `R2_BUCKET`: that bucket is served publicly. The script refuses if the two bucket names match.
- The Postgres major version is shared by production, `docker-compose.yml`, and the workflows' `PG_MAJOR` (18 as of September 2026). `pg_dump` and `pg_restore` refuse a newer server, so these move together, and a dev bump needs `docker compose down -v`. Postgres 18+ images mount the volume at `/var/lib/postgresql`.

## R2 and email

- Every R2 PUT must send `Content-Length`. undici streams bodies at or above 64 KiB and drops the derived header; R2 answers 411. Tiny fixtures pass and real photos fail, so test uploads at realistic sizes.
- `storage.ts` raises `StorageConfigError` (503, names the missing variables) or `StorageUploadError` (502, carries R2's status).
- Email is Resend through plain `fetch` in `email.ts`. Without `RESEND_API_KEY`, dev logs the reset code to the console.

## Local development

`docker compose up -d` starts Postgres. `.env` (Prisma CLI) and `.env.development.local` (Next dev) both point at it, so dev never touches production. Dev art lives under `public/world/`.
