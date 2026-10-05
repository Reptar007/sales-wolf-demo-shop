# WolfMart — QA Wolf demo shop

A public storefront built to be broken on purpose, so a sales engineer can flip a
switch on a live call and watch QA Wolf catch the regression.

**This is a prop with a real backend.** Every flow genuinely works, because the
demo's credibility comes from the failures being real.

Plan and phase breakdown: `docs/public-demo-site-plan.md` in the
`sales-engineer-toolkit` repo.

## The one rule

> This app must never be able to reach the internal SE toolkit, its Salesforce
> data, or its credentials.

WolfMart is a **separate repo, separate Heroku app, separate database**, with no
shared code and no shared config vars. On top of that deploy isolation:

| Control                  | Where                             | What it stops                                                                                                                |
| ------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Outbound allowlist       | `backend/src/security/egress.js`  | The server opening a connection to anything but `api.anthropic.com` — default-deny, covering both `fetch` and `http`/`https` |
| CSP `connect-src 'self'` | `backend/src/security/headers.js` | The page calling an internal host from the prospect's browser                                                                |
| Isolation guard          | `backend/test/isolation.test.js`  | Internal hosts, credentials, or coupling landing in the repo                                                                 |
| Boot ordering assert     | `backend/src/index.js`            | The server serving traffic with the allowlist not installed                                                                  |

Three things that are easy to undo by accident:

1. **Never deploy this under a subdomain of the internal toolkit's domain.** If a
   cookie is ever scoped to that parent domain, this app would receive it on
   every request. Keep it on its own host.
2. **Never copy config vars across.** This app has its own `DATABASE_URL` and its
   own `DEMO_JWT_SECRET`. See `.env.example`.
3. **Never share a Heroku addon between this app and the internal toolkit.** Both
   live in the same Heroku team, which puts this one command in reach:

   ```bash
   # NEVER — sets the internal app's production DATABASE_URL on this public app.
   heroku addons:attach <internal-postgres> -a sales-wolf-demo-shop
   ```

   Every control in the table above would still pass while this app read live
   internal data, because the credential arrives as ordinary config. This app
   provisions its own Postgres, always. Same rule for piping `heroku config:get`
   from one app into `config:set` on the other.

4. **Don't widen the isolation guard's patterns.** It matches hosts and secrets,
   not the word "SalesWolf" in a comment — writing down _why_ the boundary exists
   is encouraged. The test file explains the reasoning.

Adding an outbound host means editing `ALLOWED_HOSTS` in a diff a reviewer sees.
That is the intended friction.

## Setup

Requires Node **24.16.0** (engine-strict — a wrong version fails `npm ci`) and
Postgres 17.

```bash
nvm use 24.16.0
brew install postgresql@17
brew services start postgresql@17
createdb wolfmart_local
createdb wolfmart_test          # integration tests TRUNCATE this one

npm run install:all
cp .env.example .env            # then set DATABASE_URL, TEST_DATABASE_URL,
                                # DEMO_JWT_SECRET, DEMO_CONTROL_PASSPHRASE
cd backend && npx prisma migrate deploy && cd ..
npm run demo:reset              # seed the catalog, demo accounts, and flags
npm run dev                     # backend :7072, frontend :5174
```

With Homebrew Postgres the URLs are
`postgresql://<your macOS username>@localhost:5432/wolfmart_local` and
`…/wolfmart_test`. Apply migrations to the test database too:
`cd backend && DATABASE_URL=<test url> npx prisma migrate deploy`.

Never run `prisma migrate reset`, `migrate dev`, or `db push` against a shared
database; schema changes go through a reviewed migration.

## Scripts

| Command                           | Does                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                     | Backend + frontend with reload                                                                                        |
| `npm test`                        | All backend tests, including the isolation guard (needs `TEST_DATABASE_URL` for the API suites; they skip without it) |
| `npm run demo:reset`              | Wipe and re-seed the database in `DATABASE_URL` (the nightly job)                                                     |
| `npm run lint` / `npm run format` | ESLint / Prettier                                                                                                     |
| `npm run build`                   | Production frontend build                                                                                             |

In `backend/`: `npm run test:isolation` runs just the isolation guard and egress
tests, with no database (CI's first job).

The test files run one at a time (`--test-concurrency=1`) because each one resets
the same test database.

## Demo credentials

Every seeded account uses the password `WolfMart!2026`. Each SE has their own
(`sebastian@`, `ricky@`, `jun@wolfmart.test`, with order history) so simultaneous
demos never share a cart; `demo@wolfmart.test` is the generic one, and
`alpha@`/`pack@` are empty. Demo cards,
promo codes, the flag-by-flag demo script, and the pre-call checklist are in
[`docs/RUNBOOK.md`](docs/RUNBOOK.md).

## Routes

| Storefront                | Page                                             |
| ------------------------- | ------------------------------------------------ |
| `/`                       | Home                                             |
| `/c/:category`            | Category listing                                 |
| `/search?q=`              | Search results                                   |
| `/p/:slug`                | Product                                          |
| `/cart`                   | Cart                                             |
| `/checkout`               | Checkout                                         |
| `/order/:number`          | Order confirmation                               |
| `/signin`, `/signup`      | Sign in / create account                         |
| `/forgot-password`        | Request a reset link (lands in the test mailbox) |
| `/reset-password`         | Choose a new password                            |
| `/account`                | Profile, addresses, order history                |
| `/account/orders/:number` | Past order                                       |
| `/demo-inbox`             | Test mailbox: password reset links               |
| `/status`                 | Health and isolation check                       |

| SE-only (demo passphrase) | Page                                    |
| ------------------------- | --------------------------------------- |
| `/agent`                  | Live chat console                       |
| `/demo-control`           | Chaos flags, Reset all, reset demo data |

Both SE-only screens are `noindex` like the rest of the site and unlock with
`DEMO_CONTROL_PASSPHRASE`.

## Verifying the boundary

`npm test` proves it in CI. Against a running instance:

```bash
curl -s localhost:7072/api/health | grep egressAllowlist   # installed: true
```

`/status` replaced the P0 landing page as the "is this still isolated?" check:
opening it on the deployed URL reports the same status without a shell.

## Deploying

Heroku runs the build with `NODE_ENV=production`, which makes `npm install` omit
devDependencies. `vite` is a devDependency — correctly, it is a build tool — so
`heroku-postbuild` asks for dev dependencies explicitly when building the
frontend, then installs the backend with `--omit=dev`. Dropping that
`--include=dev` breaks the deploy with `sh: vite: command not found`.

```bash
heroku create sales-wolf-demo-shop --team qa-wolf
# This app's OWN Postgres. Never attach another app's (see "The one rule").
heroku addons:create heroku-postgresql:essential-0 -a sales-wolf-demo-shop
heroku config:set -a sales-wolf-demo-shop NODE_ENV=production \
  DEMO_JWT_SECRET="$(openssl rand -base64 32)" \
  DEMO_CONTROL_PASSPHRASE="<pick one; share it with the SE team only>"
# Optional, for the AI assistant (P4). Budget is a hard monthly ceiling in USD.
heroku config:set -a sales-wolf-demo-shop ANTHROPIC_API_KEY=<key> \
  ASSISTANT_MONTHLY_BUDGET_USD=25
git push heroku main
```

The `release` phase in the `Procfile` runs `prisma migrate deploy` before each
new release takes traffic. The first deploy has an empty database, so seed it
once:

```bash
heroku run npm run demo:reset -a sales-wolf-demo-shop
```

Then set up the nightly reset with Heroku Scheduler (`npm run demo:reset`, daily);
step-by-step in [`docs/RUNBOOK.md`](docs/RUNBOOK.md#nightly-reset-heroku-scheduler).

Confirm the boundary survived:

```bash
curl -s https://sales-wolf-demo-shop-*.herokuapp.com/api/health | grep egressAllowlist
```

## Status

- **P0 complete** — isolation boundary, stack, CI, deployable skeleton.
- **P1 complete** — catalog, search and filters, cart, checkout with demo cards
  and promo codes.
- **P2 complete** — accounts, cart merge on sign-in, order history, saved
  addresses, password reset via the test mailbox.
- **P3 complete** — live chat over socket.io (same origin, WebSocket only,
  Origin-checked): a storefront widget answered by an SE from `/agent`, with
  typing indicators, unread badges, history on reload, and reconnect.
- **P4 complete** — Claude shopping assistant with four catalog tools
  (search, stock, add to cart, the signed-in user's order status). Bounded by
  per-IP (30/hour) and per-conversation (20) message caps and a monthly spend
  ceiling (`ASSISTANT_MONTHLY_BUDGET_USD`, default $25) after which the route
  disables itself. Without `ANTHROPIC_API_KEY` it shows as offline. Covered by
  tests with a faked API; not yet exercised against the live API.
- **P5 complete** — demo control panel (`/demo-control`), nightly reset, CI with
  a real Postgres, and the SE runbook.

Phases in the plan doc.
