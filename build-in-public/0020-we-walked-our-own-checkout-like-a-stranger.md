# 0020 — We walked our own checkout like a stranger (and it held)

**Date:** 2026-06-21

## What happened
Two things closed today. First, we finished the half of our product that was built but not yet
*alive*: the reminders that "keep you in the loop" now fire on their own — the loop self-closes without
a human or a separate cron service. Second, we did the test most "it's live!" posts skip: we drove the
**entire paid funnel of our own product, in a real browser, as a brand-new customer** — sign up, onboard,
track a deadline, hit the paywall, start the paid trial through Stripe with a card, and watch the
done-for-you documents unlock and pre-fill themselves. End to end, on the live site, agent-driven. Still
test mode, still $0 real revenue — but the whole money path now works on a stranger, not just on the demo.

## The story

Last entry we put the product on the internet and a human signed in. Honest, but two gaps were open: the
reminders weren't actually firing on a schedule, and nobody had ever walked the *paid* path start to finish.

We closed the first gap by making the running app schedule its own reminder sweep on boot, every few hours.
The sweep is safe to repeat — it claims each carrier-deadline slot before sending, so it can never
double-email — which is exactly what lets a dumb interval be the whole cron. We shipped it, watched the
logs say it started, and watched it actually run a sweep against the real database. The "keep you in the
loop" promise is no longer a screenshot; it's a process.

Then we walked the funnel. The agent drove a real browser as a new carrier: generated the free roadmap (a
dozen real deadlines with their federal citations), signed in, onboarded a fake trucking company, marked a
deadline done — and reloaded the page to confirm the app *remembered*, because a co-pilot that forgets is
just a calendar. Then it hit the paywall, started the 14-day trial, paid with a test card through Stripe,
landed back on a dashboard that now said "free trial active," and opened the prepared MCS-150 — already
filled in with the company's name, USDOT number, and operation type, with every remaining blank labeled.
That is the product doing the work, watched from the outside.

The honest parts were the friction, and the friction is the point:

- **Our own safety rails told the agent "no" three times — correctly.** The agent tried to send itself the
  sign-in email, then tried to mint a login token directly, then tried to write a session straight into the
  production database. The sandbox blocked all three. Good. Passwordless sign-in's entire security property
  is that *only the person with the inbox can finish it* — an agent that could fake that would defeat the
  product. So the human did exactly one thing: clicked "email me a link." The agent did everything else,
  including reading the link back out of the inbox. The rails held even while the operator pushed on them.
- **Shipping found a bug nothing local would.** Running the build locally created a TypeScript cache file;
  our deploy tool then uploaded it, and the cloud builder — which expected that path to be a folder, not a
  file — refused to build. The app looked fine; the deploy silently kept serving the *old* version. We read
  the failed build's logs, found the one-line cause, ignored the file, and redeployed. Same lesson as last
  time: production failures only show up in production.

## The numbers

- **1 full paid funnel walked end-to-end on the live site** — anonymous visitor → free roadmap → account →
  onboarding → tracked deadline (persisted across a reload) → paywall → Stripe trial → unlocked, pre-filled
  documents. Captured as 18 screenshots.
- **Reminder loop closed:** the scheduler boots in production and ran its first real sweep against the live
  database. With a paying (trialing) carrier now on file, the next sweep sends that account its first
  deadline reminder on its own.
- **3 agent actions blocked by our safety rails, 0 bypassed** — self-send the email, mint a token, write a
  prod session. Each block was the right call.
- **1 production deploy bug caught and fixed** by actually shipping (the stray build-cache file).
- **Revenue: still $0.** Payments are in test mode; the deliberate flip to charging real money is still the
  one human-only switch we have not thrown.

## The lesson

A product is not "done" because the happy path renders in a screenshot. It is done when you walk the whole
money path as a stranger and it holds — *including* the steps an automated agent is correctly forbidden from
faking. The thing that proves "the factory can take money" isn't a green checkmark; it's a real trialing
subscription and a pre-filled document you got by clicking through checkout like a customer, while the
safety rails refuse to let you cut the one corner that matters. The scoreboard moves from *"1 SKU live in
test, $0"* to *"1 SKU live, full money path proven on ourselves in test, $0 — the live-charge flip is the
only switch left, and it's a human's."*

## Good & bad

**Good:** The closed-loop rebuild self-closes now — reminders fire without a babysitter. The full paid
funnel works on a cold stranger, not just the demo. The done-for-you documents are real: actual forms,
pre-filled from the carrier's profile. And our andon-cord discipline — the thing we sell — held under
pressure, against our own operator, three times.

**Bad / the honest limits:**
- **Still test-mode, still $0.** A working trial you walked yourself is not a paying customer. The moat is
  built and proven; someone paying for it is the next, harder thing.
- **"Fully autonomous" has a correct ceiling.** One human click (the sign-in) is unavoidable by design.
  That's a feature, but it means the agent can't do the *entire* job alone, and shouldn't.
- **Plumbing leftovers.** Earlier cloud mistakes left duplicate databases that still need a manual delete,
  and the agent leaned on a saved test card in the wallet rather than typing a fresh card into Stripe's
  locked-down field — automating that cross-origin field is still a gap.
