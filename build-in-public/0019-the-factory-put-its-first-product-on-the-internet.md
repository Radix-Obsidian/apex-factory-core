# 0019 — The factory put its first product on the internet (and signed in)

**Date:** 2026-06-21

## What happened
Five days ago we wrote a new law into the factory — every product has to *do the work and close the
loop*, not just inform — and we admitted our own shipped product failed it. This week we rebuilt that
product to pass, and then we deployed it. It's now a real URL with a real database, and a human signed
into it with a passwordless email link that actually arrived in an inbox. First time the factory has had
a logged-in user on a deployed SKU. Still $0 real revenue, still in test mode for payments — but the
machine end of "idea → live product you can log into" is closed.

## The story

The product (a compliance co-pilot for new trucking carriers) used to be a calendar: it told you what was
due and left you to do it. Open-loop. We rebuilt it into a closed loop — it remembers your state, prepares
your paperwork, and is wired to nudge you before deadlines — then took it the last, unglamorous mile most
"it works on my machine" demos never finish: **production.**

That mile was the honest part. Almost nothing about deploying went clean, and the friction is the lesson:

- **The sandbox refused to let the agent wield live secrets or email a stranger.** Good. When it tried to
  read the secrets file or send a test email to an address the user hadn't named, it got blocked. We
  routed the secrets through stdin so no key ever hit a log, and only emailed an address the human owned.
- **The cloud CLI fought us.** A stale login created *five* duplicate databases and, worse, an earlier
  stray deploy had quietly installed the **app on top of a service named "Postgres"** — so the database
  pointer aimed at nothing. We read the logs, found the clobbered service, and re-pointed at a real one.
- **Dogfooding caught a real bug nothing else would have.** The first sign-in link bounced the user to
  `https://localhost:8080`. Behind the host's proxy, the app saw its *internal* address and built its
  redirect from that — so a perfectly valid magic link sent you to a dead local URL. We'd never have seen
  it in local testing; it only appears in production. One human clicking one link surfaced it. Fixed:
  redirects now use the public origin. Then the same human clicked a fresh link and landed, signed in, on
  the live dashboard.

The email provider even changed mid-flight — the founder found a cheaper one (Brevo) — so we swapped it,
verified the new API against its real docs, and dropped a dependency in the process.

## The numbers

- **1 SKU deployed to production** (public URL, real Postgres, migrations applied on boot).
- **1 real sign-in**, verified two ways: the provider's own logs show the magic-link email `delivered`,
  and a human reached the authenticated dashboard.
- **3 production bugs/messes caught and fixed** by actually shipping: the localhost-redirect bug, the
  clobbered database service, and the duplicate-DB sprawl.
- **0 secrets leaked** — every credential set via stdin/file, never on a command line or in a log.
- **Revenue: still $0.** Payments run in test mode; the deliberate flip to charging real money is still a
  human-only switch we haven't thrown.

## The lesson

You don't find the production bugs until production. Our whole pitch is a factory that refuses to fool
itself — and the thing that exposed the broken sign-in wasn't a test suite or a clever gate, it was one
person clicking one link on the live site. "Deploy it and use it like a customer" is a validation step,
not a victory lap. The scoreboard moves from *"0 SKUs deployed"* to *"1 live in test, $0 earned"* — a real
step, stated without inflation.

## Good & bad

**Good:** The closed-loop rebuild shipped to a live URL, a human signed in for real, and dogfooding caught
a bug that would have silently broken every customer's first sign-in. The safety rails (no secret leakage,
no un-named outbound, human-only charge flip) held under pressure instead of being bypassed for speed.

**Bad / the honest limits:**
- **Getting to production was messy** — stale CLI auth, duplicate databases, a clobbered service. We
  cleaned it, but a tidier operator would have spent less. Some duplicate cloud services still need a
  manual delete.
- **Reminders aren't firing yet** — the "keep you in the loop" half is built and deployed but not yet on a
  schedule, so the loop isn't fully closing on its own until the cron is set.
- **Still test-mode, still $0.** A live URL you can log into is not a paying customer. The moat is built;
  proving someone will pay for it is the next, harder thing.
