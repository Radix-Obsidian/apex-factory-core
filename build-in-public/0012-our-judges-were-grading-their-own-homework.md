# 0012 — Our "neutral" judges were grading their own homework

**Date:** 2026-06-15

## What happened
We caught our own quality score being judged partly by the two companies whose work was on trial — so we re-ran it with three *outside* judges, and the fix actually scored **higher** (4.72/5), not lower; along the way we also tested an assumption about our own stack and found it was flat wrong.

## The story

Last entry we fixed our headline feature (invisible failover) and measured it: 4.3/5, a pass. We even called the jury "vendor-neutral." Then we looked harder at our own setup and winced.

The test scores how well **OpenAI** continues a half-finished answer from **Claude**. Our three "neutral" judges were Claude, GPT, and Gemini. See the problem? **Two of the three judges were the very models being graded** — Claude judging its own first half, GPT judging its own continuation. A judge with a stake in the outcome isn't neutral, and the median vote could literally be cast by one of them. We had the right instinct (use a panel) and still left the back door open.

So we fixed it properly. We brought in **three judges from outside both companies** — open models from DeepSeek, Meta, and Alibaba (different "families," none of them the vendors on trial) — and re-ran the whole thing at triple the sample size to average out luck. The honest worry going in: outside judges with no loyalty might score us *lower*.

They didn't. **Bare failover scored 3.74 (fail). Our fix scored 4.72 (pass)** — a bigger margin than the compromised panel gave us (4.3). The fix holds up *better* under impartial eyes, which is the result you actually want.

**Then the second catch.** While picking providers, we'd assumed our own primary vendor (Claude) "continues a half-answer cleanly." Instead of trusting that, we sent one real request to check — and got a flat error: *"this model does not support assistant message prefill."* Our newest Claude models **refuse** the exact technique our failover relies on. That assumption was already written into our shipped code **and into last entry's public post.** We'd been wrong in public for a day.

We fixed all of it: corrected the code, corrected the previous entry with a visible note, and wrote the true behavior into our docs.

## The numbers

- **Neutral re-run (3 outside judges, 30 prompts × 3 samples each):** bare failover **3.74/5 (fail)** → with our fix **4.72/5 (pass)**. The compromised panel had said 4.3 — the honest number is *higher*.
- **The cost of neutrality:** one OpenRouter account + **$10**. That's the whole bill for a panel that can't be accused of grading itself.
- **One API call** is what it took to disprove our "Claude continues cleanly" assumption (HTTP 400).
- **Corrections shipped:** 1 code fix (our "honors prefill" flag was wrong for modern Claude), 1 public-entry correction, docs updated. Tests green, lint clean, one pull request.

## The lesson

**"Neutral" means the judge has no stake — verify that literally, and verify your own stack against the live API, not your memory.** Two different traps, same root cause: we trusted a label ("vendor-neutral," "Claude prefills cleanly") instead of checking it. The first let the graded parties vote on themselves; the second put a false claim in our own code and our own marketing. Both were cheap to catch the moment we actually looked — a different set of judges, a single test request. The expensive version is the one you ship because the label sounded right.

## Good & bad

**Good:** Our headline number is now judged by models with zero stake in the result, and it got *stronger* (4.72). We caught a false assumption about our own product before a customer did, and corrected it everywhere — including a post we'd already published.

**Bad / the honest limits:**
- **We were wrong in public for a day.** The previous entry said Claude continues cleanly. It doesn't. Corrected now, but it shipped.
- **One open question remains:** the cheap outside judges scored us a bit higher than the big-name ones — that could mean they're fair, or just easier graders. We haven't yet proven they're as *strict*, only that they're *neutral*. That check is next.
- **Anthropic-as-a-fallback is now a known gap.** Since modern Claude refuses the technique, failing *over to* Claude needs a different approach than failing over to OpenAI — designed and measured, not assumed. Tracked, not done.

**Bottom line:** we stopped letting the contestants judge the contest, and the honest score came back better than the rigged one. The cleanest proof you can give is the one your critics would run themselves.
