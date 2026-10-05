# WolfMart SE runbook

**Live:** <https://www.wolfmartdemo.com>

How to run a WolfMart demo on a live call: break the store on purpose, show QA
Wolf catching it, then put it back. Written for an SE picking this up cold.

Everything in WolfMart is fictional: products, accounts, orders, cards, email.
Nothing ships and no payment is ever taken.

## The two screens you need

| Screen        | URL             | Who sees it                                     |
| ------------- | --------------- | ----------------------------------------------- |
| Storefront    | `/`             | The prospect (share this tab)                   |
| Demo control  | `/demo-control` | You only (keep it on your second screen)        |
| Chat console  | `/agent`        | You only, if you demo live chat                 |
| System status | `/status`       | Anyone; the "is it healthy and isolated?" check |

`/demo-control` and `/agent` ask for the **demo passphrase** (the
`DEMO_CONTROL_PASSPHRASE` config var; ask in the SE channel if you don't have it).
Unlocking lasts 12 hours on that browser. **Lock** on the panel signs you out.

## Pre-call checklist

Five minutes before the call:

1. Open `/status`. Every row should be green, including "Egress allowlist active".
2. Open `/demo-control` and unlock. The summary bar should read **All clear — no
   flags on**. If not, press **Reset all**.
3. If the store looks used (odd carts, test orders, a demo account with a changed
   password), press **Reset demo data…** and confirm. The nightly reset normally
   handles this.
4. In QA Wolf, open the WolfMart suite and confirm the latest run is green. Have
   the run page ready in a tab.
5. Open the storefront in the tab you'll share. Close the demo-control tab from
   anything you'll screen-share.

## The 5-minute demo

1. **Open the store** (30s). Share the storefront. Browse a category, open a
   product, add it to the cart. "This is a real store with a real backend: cart,
   checkout, accounts, search."
2. **Show a green QA Wolf run** (60s). Switch to the QA Wolf run page. "These are
   the flows QA Wolf runs on every deploy: browse, search, cart, checkout,
   sign-in. All green."
3. **Break something** (30s). On your control screen, flip one flag, e.g.
   **Checkout returns 500**. The change takes effect on the very next request.
   Optionally show it by hand in the store: place an order and watch it fail.
4. **Re-run** (90s). Trigger the suite (or just the affected flow) in QA Wolf.
   While it runs, read the flag's "What QA Wolf catches" line from the panel.
5. **Red** (60s). The run fails on the exact flow you broke. Open the failure:
   the video, the step that failed, the error. "This is what your team would get
   in Slack before a customer saw it."
6. **Reset all** (10s). Press **Reset all** on the panel. Re-run if you want to
   end on green.

Pick one flag per call unless asked for more. `checkout_500` and
`cart_total_drift` land best with most audiences; `login_flake` is the strongest
story for teams who say their tests are already flaky.

## Chaos flags

Each flag is injected on the server, so what QA Wolf catches is exactly what a
real shopper would hit. Flags are off after every reset.

| Flag (panel label)                              | What breaks                                                                 | Flow to show                                            | What QA Wolf catches                                                        | What to say                                                                                                         |
| ----------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `checkout_500` (Checkout returns 500)           | Placing an order fails with a server error.                                 | Add to cart → checkout → place order                    | The order never completes; the checkout flow fails at "Place order".        | "The most expensive bug a store can ship, and it's invisible until someone tries to pay."                           |
| `cart_total_drift` (Cart total drifts by $1)    | The order total is $1.00 more than subtotal − discount + shipping + tax.    | Add to cart → view cart summary                         | An assertion that the summary adds up fails, to the cent.                   | "Nobody eyeballing the page would notice. A test that does the arithmetic does, every run."                         |
| `search_latency` (Search takes 4 seconds)       | Every search with a query waits 4s. Browsing categories stays fast.         | Search for "boot" from the header                       | The search flow times out or blows its time budget.                         | "Nothing is broken, it's just slow — the kind of regression that shows up as churn before it shows up as a ticket." |
| `login_flake` (Login fails 1 in 3)              | About one sign-in in three is rejected even with the right password.        | Sign in as `demo@wolfmart.test`                         | The sign-in flow fails intermittently across runs.                          | "A flake is a bug you haven't found yet. QA Wolf flags the pattern instead of letting it get re-run into green."    |
| `stock_race` (Stock race at checkout)           | Items look in stock and add to cart, then checkout says they just sold out. | Add to cart (works) → place order (409 "just sold out") | The purchase flow fails at the last step, after every earlier check passed. | "Every page said in stock. Only an end-to-end run catches the race at purchase time."                               |
| `image_404` (Product images 404)                | Every product image request returns 404; the pages themselves still load.   | Home page or any category                               | Broken images are detected even though the page returned 200.               | "Uptime monitoring says the site is up. Your customers see a store with no pictures."                               |
| `promo_expired` (Valid promo silently rejected) | `WOLF10` and `PACK20` appear to apply, but no discount is taken.            | Cart → apply `WOLF10`                                   | The assertion on the discounted total fails.                                | "No error, no red text. The only way to catch it is to check the number."                                           |

## Credential card

Demo accounts (all use password **`WolfMart!2026`**):

| Email                     | Notes                                                        |
| ------------------------- | ------------------------------------------------------------ |
| `sebastian@wolfmart.test` | Sebastian's own: address and orders `WM-100011`, `WM-100012` |
| `ricky@wolfmart.test`     | Ricky's own: address and orders `WM-100021`, `WM-100022`     |
| `jun@wolfmart.test`       | Jun's own: address and orders `WM-100031`, `WM-100032`       |
| `becca@wolfmart.test`     | Becca's own: address and orders `WM-100041`, `WM-100042`     |
| `dion@wolfmart.test`      | Dion's own: address and orders `WM-100051`, `WM-100052`      |
| `ian@wolfmart.test`       | Ian's own: address and orders `WM-100061`, `WM-100062`       |
| `demo@wolfmart.test`      | Shared generic account: `WM-100001`, `WM-100002`             |
| `alpha@wolfmart.test`     | Empty account (a first-time customer)                        |
| `pack@wolfmart.test`      | Empty account                                                |

**Use your own account on calls.** Accounts share a cart and order history with
anyone else signed into them, so two SEs on `demo@` at the same time will see
each other's items. To add a teammate, add a row to `DEMO_USERS` in
`backend/src/seed/data.js`; it appears after the next reset.

**QA Wolf flows should sign up a fresh account per run** (e.g. a unique
`run-<id>@wolfmart.test`) rather than reuse a seeded one, so parallel runs never
share a cart.

Demo cards (any future expiry, any CVC):

| Card number           | Brand      | Result   |
| --------------------- | ---------- | -------- |
| `4242 4242 4242 4242` | Visa       | Approved |
| `5555 5555 5555 4444` | Mastercard | Approved |
| `3782 822463 10005`   | Amex       | Approved |
| `4000 0000 0000 0002` | Visa       | Declined |

Card numbers never leave the browser: the checkout page maps them to demo payment
tokens before anything is sent to the server.

Promo codes:

| Code       | Effect                   |
| ---------- | ------------------------ |
| `WOLF10`   | 10% off                  |
| `PACK20`   | $20 off orders of $100+  |
| `HOWL2024` | Expired (shows an error) |

## Test mailbox (password reset)

WolfMart sends no real email. The one message a shopper would get by email, the
password reset link, lands in the **test mailbox** at `/demo-inbox` instead.
Orders don't go there: they live on the confirmation page and in the account's
order history.

To show password reset: `/forgot-password` → enter the account email → follow the
**test mailbox** link → click **Choose a new password** → set a new one. The link
is single-use and expires in an hour.

The mailbox shows only mail triggered from the same browser (plus mail for the
account signed in there), so a prospect never sees another visitor's messages.
If you reset a seeded account's password during a call, **Reset demo data**
afterwards so the credential card stays true.

## Live chat and the AI assistant

- **Live chat (P3).** Shoppers get a chat widget on the storefront; you answer
  as the store's support agent from `/agent` (same passphrase). Useful for
  showing QA Wolf testing a real-time, two-party flow.
- **AI shopping assistant (P4).** The ✦ button above the chat launcher. It
  searches the live catalog, checks stock, adds items to the shopper's real
  cart (watch the header count change), and looks up the signed-in user's
  orders. Try "Find a waterproof jacket under $150, then add it in medium."
  It needs `ANTHROPIC_API_KEY` on the app; without it the widget says the
  assistant is offline and nothing else is affected. Limits: 20 messages per
  conversation ("Start over" resets), 30 per IP per hour, and a monthly spend
  ceiling after which it switches itself off until next month.
- **Answering chat from the same browser.** Open `/agent` in a second tab. The
  storefront widget in that browser keeps acting as the customer.

Both are wiped by **Reset demo data** and by the nightly reset, so no prospect
can read a previous prospect's conversation.

## Troubleshooting

| Symptom                                                  | Fix                                                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| QA Wolf run is red before you've flipped anything        | Open `/demo-control`. A flag is probably still on from an earlier call: **Reset all**. If still red, **Reset demo data**.            |
| "Your session expired" on the panel                      | Reload `/demo-control` and enter the passphrase again.                                                                               |
| Passphrase form says no passphrase is configured         | `DEMO_CONTROL_PASSPHRASE` isn't set on the app. Set it (see README, Deploying).                                                      |
| A demo account's password doesn't work                   | Someone reset it on an earlier call, or `login_flake` is on. **Reset all**, then **Reset demo data**.                                |
| A product is unexpectedly out of stock                   | Earlier orders used it up. **Reset demo data**. (`Snowpack Winter Boot` and `Gaiter Pro` are out of stock on purpose.)               |
| The flip doesn't seem to take effect                     | Flags apply on the next request; reload the storefront page. For images, a hard reload.                                              |
| `/status` shows "Egress allowlist NOT ACTIVE" or is down | Stop the demo and tell the app owner. Do not demo an app that reports the boundary down.                                             |
| Everything is down                                       | Check the Heroku app's dyno and logs (`heroku logs --tail -a sales-wolf-demo-shop`). Release-phase migration failures show up there. |

Every flag flip is logged (`[demo-control] flag <key> -> on|off`), which helps
line up a failed run with what was flipped.

## Nightly reset (Heroku Scheduler)

`npm run demo:reset` wipes and re-seeds everything: catalog, stock, demo
accounts, orders, carts, inbox, chat, assistant transcripts, and turns every flag
off. It is the same code path as the panel's **Reset demo data** and the test
suite's setup.

Heroku Scheduler can't be configured from the repo, so set it up once by hand:

```bash
heroku addons:create scheduler:standard -a sales-wolf-demo-shop
heroku addons:open scheduler -a sales-wolf-demo-shop
```

In the Scheduler dashboard that opens:

1. **Create job**.
2. Schedule: **Every day at…** a quiet hour, e.g. `08:00 UTC` (overnight in the
   US, before the European morning).
3. Run command: `npm run demo:reset`
4. Dyno size: the smallest available (the reset takes a few seconds).
5. **Save job**.

To check it ran, look for `[demo:reset] seeded … products` in
`heroku logs -a sales-wolf-demo-shop --dyno scheduler`. To run it by hand:
`heroku run npm run demo:reset -a sales-wolf-demo-shop`.
