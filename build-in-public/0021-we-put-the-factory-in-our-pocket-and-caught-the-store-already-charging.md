# 0021 — We put the factory in our pocket, and caught the store already charging

**Date:** 2026-06-24

## What happened
We gave the chairman a way to run the entire factory — and its live products — from his phone, by
text message, like a Claude Code session over Telegram. No IDE unless the building is on fire. While
setting up a "test subscribe" to prove the money path one more time, we checked instead of assumed and
found one of our storefronts was *already in live mode, charging real money*. We surfaced that instead
of quietly running a test card.

## The story

The goal was simple to say and hard to earn: AJ should be able to talk to the factory the way he talks
to a person. "What's the portfolio look like?" "Read this repo." "Deploy that." From the road, from his
pocket, in plain English — with one hard rule baked in: **confirm before anything big** (spending money,
deploying to production, deleting, or sending), but do reversible work freely. So we wired a Telegram bot
to a dedicated always-on agent that lives in the factory's own folder and can read, build, deploy, and
operate the real repos.

It did not work the first time, and the reason is worth writing down. Anthropic recently changed how login
tokens behave: if a third-party app borrows the token from your subscription plan, it now draws from
"extra usage," not your plan — and a fresh one we minted simply bounced. The fix was a plain API key. The
non-obvious part: the tool we use to run the agent decides what *kind* of credential you handed it by
looking at the text. Anything that doesn't start with the plan-token prefix, it treats as an API key and
sends through the proper door (the `x-api-key` header). So a real API key drops into a profile labeled
"token" and just works. Once we swapped it, the smoke test passed clean: the agent introduced itself —
"Apex online" — read the repo on request, and named the revenue focus on its own, unprompted. The factory
answered the phone.

Two more things got fixed while we were in there:

- **A heartbeat that had been dead for 54 runs in a row.** Our every-few-minutes health ping was throwing a
  401 the whole time — a revoked bot token, failing silently into a counter nobody was reading. We
  repointed it at the working agent and the live bot, and the error count reset to 0. Fifty-four
  consecutive failures is exactly the kind of rot that hides behind a green dashboard if no one looks.
- **A daily 8am digest, for $0.** Portfolio health, revenue, and lead stats land on the phone every
  morning — pure plumbing, no AI model in the loop, so it costs nothing to run. A founder shouldn't have to
  *ask* how the business is doing; the business should tell him.

Then the honest moment. To prove the paid path one more time, we went to run a "test subscribe" on
waimd.org. Old habit from the last entry kicked in — check, don't assume — so before sending a card we
looked at what mode Stripe was actually in. It was **live**. The checkout sessions were `cs_live_` — real
money, real cards, not a sandbox. If we'd assumed it was test mode like everything else, we'd have fired a
test card at a live storefront and learned nothing, or worse. We stopped and told the founder the
inconvenient truth: this store is already armed. He didn't flinch — "let's go make money" — so instead of a
fake subscribe, we armed him with the three hottest leads: copy-paste emails and tap-to-call numbers he
could work from the road. The factory's first sales motion, run from a phone.

## The numbers

- **1 factory agent wired to 1 Telegram bot**, smoke-tested green: it self-introduced ("Apex online"), read
  the repo on command, and named the revenue focus unprompted.
- **1 credential wall hit and cleared** — plan login tokens now get throttled for third-party apps; the
  working fix was a real API key, which the runner auto-routes to the `x-api-key` header from a plain
  "token" profile.
- **Heartbeat: 54 consecutive failed runs → 0.** A revoked bot token had been 401-ing silently the entire
  time.
- **1 daily 8am digest live at $0/run** — portfolio + revenue + lead stats, pure code, no LLM.
- **1 storefront caught already in LIVE Stripe mode** (`cs_live_` sessions) before we sent a test card.
- **3 hottest leads handed to the founder** as ready-to-send emails + tap-to-call, instead of a fake
  test subscribe.

## The lesson

The same discipline that protects your code protects your money: **verify the state you're in before you
act on it.** We almost ran a test card on a live register purely because every *other* surface this week was
in test mode — the assumption was reasonable and would have been wrong. Checking cost us thirty seconds;
assuming would have cost us a confusing charge and a lie in the data. And the bigger shift is real: a
solo founder can now run a charging business — read, deploy, operate, and sell — from a text thread on his
phone, with the andon cord ("confirm before big moves") wired in as a default, not a hope. Convenience that
removes the friction *and* keeps the safety rail is the whole game.

## Good & bad

**Good:** The factory is genuinely pocket-sized now — conversational control over real repos, with
confirm-before-spend/deploy/delete/send built in. A 54-run-dead heartbeat is alive again. A free daily
digest means the business reports to the founder instead of the other way around. And we caught a live
storefront before treating it like a sandbox — the verify-don't-assume reflex held under a deadline, again.

**Bad / the honest limits:**
- **The plan-token throttle bit us by surprise.** We only learned the rule by hitting the wall; a fresh
  token bouncing cost us a debugging detour we'd have skipped if we'd read the change first.
- **A dead heartbeat ran dead for 54 cycles before anyone noticed.** The monitoring monitored nothing. We
  fixed the symptom; we still owe ourselves an alert that screams when the watcher itself goes quiet.
- **Still no revenue.** A live storefront and three warm leads is a loaded gun, not a sale. "Let's go make
  money" is the intent — a paying customer is still the next, harder thing, same as last entry.
