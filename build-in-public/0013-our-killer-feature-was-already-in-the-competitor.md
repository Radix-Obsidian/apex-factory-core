# 0013 — We went to prove our killer feature, and found it already shipping in our competitor

**Date:** 2026-06-15

## What happened
We built the demo meant to prove H\RNESS's headline feature — surviving a model failure *mid-answer* — and right before publishing it, our own fairness review found that the leading free tool already does the exact same thing. So we didn't publish the brag. We ran a fair head-to-head instead and found the one narrow thing we actually do better.

## The story

H\RNESS's whole pitch is: when the AI model dies in the middle of writing an answer, we keep the answer going on a backup model so the user never sees the break. We were about to show it off side-by-side against **LiteLLM** (the most popular open-source tool in this space): kill the model mid-sentence, watch LiteLLM truncate while H\RNESS sails through. The script was written. The headline was "a tool like LiteLLM *structurally cannot* do this."

Before posting, we did what this log is built on: we tried to **break our own claim** first. A panel of AI reviewers read LiteLLM's *actual code* — the copy sitting in our own project folder — and came back with a result that stopped us cold.

**LiteLLM already does the thing we said was ours.** Its code, on by default, catches a mid-answer failure, takes the half-written text, and hands it to the backup model with the instruction "continue this, don't repeat it." That is, line for line, *our* technique — the one we'd been calling our locked-in advantage. We checked it ourselves to be sure. It was real. Our headline was false, and any LiteLLM maintainer could have proven it with their own source in about thirty seconds.

So we deleted the brag and asked the honest question instead: *with that feature no longer unique, is there anything H\RNESS actually does better?* We built a fair test — same fault, same conditions, and we even **tuned LiteLLM to its best setting** (gave it the timeouts and retries a careful operator would use) so we couldn't be accused of rigging it. We threw three kinds of failure at both tools.

The answer was narrow but real. When the connection **breaks with an error** (a reset, a stall), LiteLLM's recovery kicks in and it finishes the answer fine — we have no edge there. But when the stream ends **cleanly but unfinished** — a "silent truncation," where the connection closes politely without the end-of-message marker — LiteLLM treats it as a *completed, successful* answer and hands the user a half-response with no error. H\RNESS notices the answer never actually finished and recovers. That difference held every single time.

## The numbers

- **The killer feature isn't ours:** LiteLLM 1.83.7 (in our own environment) ships mid-stream recovery with the partial-as-prefill + "continue this" instruction — byte-for-byte our seam.
- **Fair fault test** (H\RNESS vs LiteLLM-default vs LiteLLM-tuned; a passing positive control proves LiteLLM's recovery works):
  - error-type failures (reset, stall): **both recover** — no advantage to us.
  - **clean truncation: H\RNESS recovers 12/12 runs; tuned LiteLLM recovers 0/12.** The one real, repeatable edge.
- **What it cost to learn this:** one fairness review + one fault matrix, ~a dozen Docker runs, $0 in API spend (a local mock upstream). The alternative — shipping "structurally cannot" and getting corrected in public by a maintainer — would have cost our credibility.

## The lesson

**Check your "unique" advantage against your competitor's *current* code, not your memory of it.** Our mental model of LiteLLM was about a year stale; in that year it shipped the exact feature we were building our identity around. We didn't find that out from a blog post or a guess — we found it by reading the source and running a fair test, the same way we'd want a skeptic to. The bar applies to us hardest: it's better to kill your own headline in private than to defend a false one in public.

## Good & bad

**Good:** The honesty check worked exactly as designed — it caught a false claim *before* it shipped. And the fair re-test still found a genuine, repeatable edge (catching silent truncations that a request-level tool reads as success), proven against a competitor we deliberately tuned to win.

**Bad / the honest limits:**
- **Our flagship differentiator is not a moat.** The feature we thought set us apart is already free and widespread. That's a real blow to the "why H\RNESS" story.
- **The surviving edge is narrow.** It covers one failure class — silent truncation. Whether that's common enough in the real world to build a product on is an open question we have not answered yet.
- **We almost shipped the false version.** The "structurally cannot" claim was written and one step from publishing.

**Bottom line:** we set out to prove we were special, and the honest test said "less than you thought." We'd rather know that today, for the price of a few Docker runs, than learn it from a customer or a competitor. Now the real question is whether the one thing we *do* do better is worth building a company on — and that's the next decision, made with eyes open.
