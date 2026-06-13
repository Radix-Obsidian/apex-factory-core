# 0004 — Three more dead projects, three honest "no"s (and why each one teaches something)

**Date:** 2026-06-12

## What happened
After finding our first real product (MCPShield, [entry 0003](0003-first-real-product-found-in-dead-code.md)), we pointed the deep analysis at three more shelved AI tools from our graveyard. All three got a "no." But they failed for three *completely different* reasons — and those three reasons are a clean lesson in what separates a real AI-native product from a fake one.

## The story

We ran three projects through the full gauntlet: a data-leak scanner (NoLeakAi), an AI-usage proxy that claimed to catch hallucinations (toknxr), and an idea-to-plan tool (ShepLight). Thirty product ideas generated across the three. Zero survived the critics. Here's why each died — because the *why* is the whole point.

### 1. NoLeakAi — a genuinely great tool, killed for not being AI

This one stung. NoLeakAi is a real, well-built data-privacy scanner: it finds leaked secrets and personal info, watermarks datasets with hidden "canary" tokens to catch leaks, and signs everything cryptographically. The critics scored its ideas near the top on novelty and market demand — one scored 23 out of 25.

And they killed it anyway, on a single bar: **it's not actually AI.** Under the hood it's clever pattern-matching and math — regex, entropy calculations, frequency analysis. Zero AI models. The "AI" in the name is marketing. Our factory only builds things that *collapse* without AI, so a great non-AI tool is still a "no" for us.

**Lesson:** "Is this a good product?" and "Is this the right product *for us*?" are different questions. Pick your bar and hold it even when the thing in front of you is genuinely good. A filter that bends for a high score isn't a filter.

> **Update (the day after):** we changed this bar. We realized "AI-native or out" was too narrow — the factory's real edge is *how* it builds (autonomous, AI-native manufacturing), not whether every product is itself an AI model. Top investors fund more than pure-AI plays, and so should we. The new bar is **defensible + vertical + real demand + legally liftable, with an AI angle as a strong plus, not a gate.** Under that bar, a tool like NoLeakAi could now survive. We're leaving this entry exactly as written, because the honest record is the point: *we held a bar, then realized the bar itself was wrong, and fixed it.* Changing your own filter when you catch it being too narrow is a different, harder kind of discipline than just holding the line — and it's the one that actually compounds.

### 2. toknxr — a "capability" that was secretly faking it

toknxr is a proxy that sits in front of AI calls and claimed to detect hallucinations and score code quality. The critics did something simple and devastating: they *read the code.* The "hallucination detector" flags any sentence containing words like "obviously," calls any long CamelCase word a "fabrication," and — this is real — **adds random noise to its own confidence score.** The "capability" wasn't a capability; it was a confident-looking guess.

So it failed on "would salvaging actually beat building clean?" — no, because there's nothing real to salvage. Rebuilding an honest version is cheaper than rescuing a fake one.

**Lesson:** The critics read the source, not the README. A feature that *sounds* smart but is secretly a random number generator gets caught — but only if your evaluation actually inspects the work instead of trusting the label.

### 3. ShepLight — real AI, but a crowded, unfocused "me-too"

ShepLight was the opposite of NoLeakAi: genuinely AI-native (it uses real models to turn a founder's raw idea into a structured plan). But it died on two bars: **it's not new, and it's not focused.** "Turn your idea into an MVP plan" is a saturated 2026 category, and the project sprawled across six half-finished surfaces instead of one sharp wedge.

**Lesson:** Being AI-native isn't enough. It has to be genuinely *new* and ruthlessly *focused.* A real AI product aimed at a crowded space with no edge is still a "no."

## The numbers

- **3 projects**, **123 AI workers**, **~101 minutes**, **$0 out of pocket.**
- **30 product ideas** generated → **0 survived** → each killed for a specific, code-backed reason.
- **Running scoreboard: 5 dead projects deep-analyzed → 1 real product (MCPShield) → 4 honest "no"s.** Roughly a 1-in-5 hit rate, with receipts on every rejection.

## The lesson

**A good filter doesn't reject everything the same way — it finds the specific reason each thing fails.** Not AI-native. Fake capability. Me-too. Three projects, three different verdicts, each backed by evidence from the actual code. That precision is exactly what makes the *one* "yes" (MCPShield) trustworthy. If the tool said "no" to everything for vague reasons, the one "yes" would be worthless too.

## Good & bad

**Good:** No false positives. The tool held its "AI-native" bar against a high-scoring tool, caught a fake capability by reading the source, and rejected a crowded me-too — three distinct, correct judgment calls.

**Bad / the thing to watch:** **Cost.** Deep-analyzing these three projects burned about 6 million words of AI thinking in 100 minutes. That's affordable for our own graveyard of ~15 projects. It is *not* affordable for scanning the wider internet, which is where we're headed next. The cheap pre-filter from [entry 0002](0002-we-x-rayed-our-own-graveyard.md) stops being a nice-to-have and becomes the thing that makes the whole idea economically possible. You cannot deep-analyze everything. The funnel is the business.

**Bottom line:** the graveyard gave us one real product and four honest "no"s — and honestly, the "no"s taught us more than the "yes" did.
