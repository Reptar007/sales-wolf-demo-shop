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
3. **Don't widen the isolation guard's patterns.** It matches hosts and secrets,
   not the word "SalesWolf" in a comment — writing down _why_ the boundary exists
   is encouraged. The test file explains the reasoning.

Adding an outbound host means editing `ALLOWED_HOSTS` in a diff a reviewer sees.
That is the intended friction.

## Setup

Requires Node **24.16.0** (engine-strict — a wrong version fails `npm ci`).

```bash
nvm use 24.16.0
npm run install:all
cp .env.example .env   # then fill in DATABASE_URL and DEMO_JWT_SECRET
npm run dev            # backend :7072, frontend :5174
```

## Scripts

| Command                           | Does                                         |
| --------------------------------- | -------------------------------------------- |
| `npm run dev`                     | Backend + frontend with reload               |
| `npm test`                        | Backend tests, including the isolation guard |
| `npm run lint` / `npm run format` | ESLint / Prettier                            |
| `npm run build`                   | Production frontend build                    |

## Verifying the boundary

`npm test` proves it in CI. Against a running instance:

```bash
curl -s localhost:7072/api/health | grep egressAllowlist   # installed: true
```

The P0 landing page reports the same status, so opening the deployed URL answers
"is this still isolated?" without a shell.

## Status

**P0 complete** — isolation boundary, stack, CI, deployable skeleton.
P1 (catalog, cart, checkout) is next. Phases in the plan doc.
