# IMA Accelerator V1

Student performance & coaching platform for Abu Lahya's halal influencer marketing mentorship.

## Stack

- Next.js 16 (App Router, proxy.ts NOT middleware.ts)
- React 19, TypeScript strict
- Supabase (auth + Postgres + RLS)
- Tailwind CSS 4
- Google OAuth only, invite-only registration

## Commands

```
npm run dev          # Dev server on port 3000
npm run build        # Production build
npm run lint         # ESLint
npx tsc --noEmit     # Type check (no emit)
```

## Deployment

Production (`members.imaccelerator.com`) is hosted **on this server via PM2**, NOT Vercel. The `vercel.json` and the GitHub remote are red herrings — `git push` does NOT deploy. There are no GitHub creds on this box.

**Deploy = two independent steps. Order matters: DB migrations FIRST, then the app**, or the new code queries columns/RPCs that don't exist yet and breaks live for every user.

> **Quick runbook — when the user says "deploy" (app code, the usual case).**
> Step 1 (migrations) is ONLY needed when this change added new schema/RPCs — a normal "make it live" is just the app. `next start` serves the `.next` from the *last build*, so uncommitted working-tree changes (fixes + any WIP) go live only on rebuild+restart. Do NOT apply any pending DB migration unless it's explicitly part of this deploy. Steps:
> 1. `rm -rf .next.old && cp -a .next .next.old` — snapshot the live build for instant rollback.
> 2. `npm run build` — compiles the **entire working tree**, so it ships every uncommitted change on the branch (confirm that scope is intended). If exit ≠ 0, stop — the running app is untouched until the restart, so nothing broke.
> 3. `pm2 restart ima-coaching` — **`pm2` is not on the non-login shell PATH**; prefix `export PATH=/root/.nvm/versions/node/v20.20.2/bin:$PATH` (check `ls /root/.nvm/versions/node/`). A "command not found" here means the old build is still serving.
> 4. Verify: `pm2 describe ima-coaching` → `online` with 0 unstable restarts; `curl -so /dev/null -w "%{http_code}" http://localhost:3001/login` → 200; spot-check `/student` `/coach` `/owner` → 307 (auth redirect to login); `pm2 logs ima-coaching --lines 15 --nostream` shows no errors.
> 5. Rollback if it misbehaves: `mv .next .next.broken && mv .next.old .next && pm2 restart ima-coaching`.

### 1. Database / migrations
The prod Supabase `NEXT_PUBLIC_SUPABASE_URL=https://api-members.imaccelerator.com` **proxies to the self-hosted Supabase running on THIS box** — the "local" stack (Studio 54323, kong 54321, Postgres **54322**). So **the local DB _is_ production.** There is no separate remote DB and no `supabase db push`.

- Apply a migration to prod:
  ```
  psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/migrations/NNNNN_name.sql
  ```
- New schema must also be mirrored into `sql-import/schema.sql` (source-of-truth) and the `daily_reports`/etc. types in `src/lib/types.ts`.
- ⚠️ Any ad-hoc `INSERT/UPDATE/DELETE` against 54322 hits **live prod data**. Use sentinel dates and clean up.
- Check prod state read-only via REST with the service key from `.env.local`:
  ```
  curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/<table>?select=<col>&limit=1" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
  ```

### 2. App code
The app is PM2 process **`ima-coaching`** (`next start`, cwd `/root/ima-coaching`, **port 3001** behind a reverse proxy — port 3000 on this box is a _different_ app). `next start` loads `.next` at boot, so changes are invisible until restart.

- Standard:
  ```
  npm run build && pm2 restart ima-coaching
  ```
- Lower-downtime alternative (build off to the side, then atomic swap): build an isolated copy under `/root` (`mount --bind` node_modules — Turbopack rejects a symlinked one), `cp -a copy/.next .next.new`, `sed -i` the copy-dir path → `ima-coaching` in `.next.new/required-server-files.{json,js}` (only 2 files embed it), then `mv .next .next.old && mv .next.new .next && pm2 restart ima-coaching`. Keep `.next.old` for rollback.
- A prod `next build` compiles the **entire working tree** — including any unrelated uncommitted changes on the current branch. Confirm scope before shipping.
- Verify: `pm2 describe ima-coaching` is `online` with 0 unstable restarts, and `curl -so /dev/null -w "%{http_code}" http://localhost:3001/login` → 200.
- Other PM2 apps here (`coaches-comms`, `waclose`) — leave them alone.

## Architecture

```
src/app/(auth)/       # Login, register, no-access — no sidebar
src/app/(dashboard)/  # Owner, coach, student views — shares Sidebar layout
src/app/api/          # Route handlers (mutations only)
src/components/ui/    # CVA-based primitives
src/components/       # Feature components
src/lib/config.ts     # Single source of truth (roles, nav, roadmap)
src/lib/supabase/     # Client, server, admin clients
src/proxy.ts          # Route guard — NOT middleware.ts
```

## Database

6 tables: users, invites, magic_links, work_sessions, roadmap_progress, daily_reports. All have RLS. Roles: owner > coach > student.

## Critical Rules

1. **Config is truth** — import from src/lib/config.ts, never hardcode roles/nav/roadmap
2. **Admin client only in server code** — never import in client components
3. **Proxy not middleware** — Next.js 16 uses src/proxy.ts
4. **Google OAuth only** — no password flows exist

## Hard Rules (enforce during EVERY build)

1. **Admin client in API routes** — every `.from()` query in route handlers uses the admin client
2. **Never swallow errors** — every `catch` block must toast or `console.error`, never empty
3. **Check response.ok** — every `fetch()` must check `response.ok` before parsing JSON
4. **Zod import** — `import { z } from "zod"`, never `"zod/v4"`

## Code Quality

- Zod safeParse on all API inputs, try-catch on request.json()
- Auth + role check before validation on every API route
- Filter by user ID in queries, never rely on RLS alone
- Stable useCallback deps — use refs for toast/router

## Design

**The design contract lives in `docs/design/`.** Read it before any UI work.

- `docs/design/05-style-guide.md` — **single source of truth** for color, type, spacing,
  radius, elevation, motion, and component patterns. Every value is measured from the
  codebase, and it has a § Verification section with the grep commands to re-measure.
- `docs/design/03-general-vibe.md` — aesthetic direction, anti-references, hard bans,
  brand asset rules, and the skill overrides for `/impeccable`, `/bolder`, etc.
- `docs/design/04-sections/` — per-pattern build specs (app shell, masthead, metric
  hero, card surfaces, states).
- `docs/design/07-tasks.md` — what's done and what's next.

Load-bearing rules that get violated most often:

1. **Blue is signal, not decoration** — `ima-primary` marks active nav, the *single*
   hero metric, primary CTAs, and focus rings. Nothing else.
2. **One focal point per view.** Never two `6xl`/`7xl` metrics on a page.
3. **The 6/10/14/18px spacing is intentional** — do NOT normalize it to a 4/8/16/24
   scale without an explicit ask. It spans ~200 files including `loading.tsx` skeletons.
4. **No new hex, no new font family, no gradients, no glassmorphism, no dark mode.**
5. **Never apply `tracking-tight` (or any negative tracking) to Arabic text** — it
   breaks connected letterforms.
6. **Shadows at rest are correct.** `shadow-card` on 134 surfaces is deliberate;
   `ima-bg` and `ima-surface` are both `#FFFFFF`, so shadow is the only separation.

**The style guide is a living document** — if you make a design decision that departs
from it, update it in the same commit.
