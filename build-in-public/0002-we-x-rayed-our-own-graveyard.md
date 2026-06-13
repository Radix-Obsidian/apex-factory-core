# 0002 — We X-rayed our own graveyard of dead projects

**Date:** 2026-06-11

## What happened
We ran a cheap, fast scan over all 19 of our abandoned projects to answer one question for each: "is there real working code in here, or is it an empty shell?" It caught 4 empty shells, found 15 with genuine working code, and surfaced a cluster of AI-safety tools we'd half-forgotten we'd built — all in three and a half minutes for half the cost of studying a single project in depth.

## The story

In our last entry, our salvage tool did a deep dive on one dead project and correctly found there was nothing worth rescuing. But that deep dive was expensive — it spent a lot of AI effort to conclude "this one's empty." Doing that 19 times would be wasteful.

So we added a cheap pre-check first. Think of it like a triage nurse: before anyone gets the full workup, a quick look decides who actually needs it. For each dead project, a lightweight pass reads the file list, opens a handful of the most important files, and scores two things:
- **How built is it really?** (Real working code, or just a starter template and to-do notes?)
- **Is there a genuinely reusable capability** — an actual engine, pipeline, or integration — versus generic plumbing anyone can regenerate in minutes?

The results were better than we expected.

**It correctly threw out the dead weight.** Four projects scored zero and got skipped: two were literally empty repositories, one was an untouched starter template, and one was a payment screen with no actual product behind it. The triage caught all four cheaply, so we never waste a deep dive on them.

**It found real, working systems.** Fifteen projects had genuine built code — not scaffolding.

**And the surprise:** sitting in our graveyard was a whole cluster of AI-safety and governance tools we'd started and shelved. A gateway that controls and approves what AI agents are allowed to do. A secrets scanner. A leak-detection system with canary watermarking. A proxy that catches AI hallucinations and tracks cost. A multi-AI orchestration engine. We'd forgotten how much of this was actually built. That's the entire point of doing this: the value you already created, sitting unused.

## The numbers

- **19 dead projects** scanned, fully automated.
- **~3.5 minutes**, start to finish.
- **$0 out of pocket** (ran on cheap AI models on our existing plan).
- **4 empty shells** correctly identified and skipped.
- **15 projects** with real, working code worth a closer look.
- **Cost win:** scanning all 19 projects used **roughly half** the AI effort it took to deep-analyze a *single* project last time. The cheap filter pays for itself instantly.

## The lesson

**Spend cheap before you spend expensive.** The order of operations matters more than the tools. A fast, rough filter that's allowed to be wrong-but-cheap, run *before* the slow expensive analysis, is the difference between a tool you can afford to run on 19 projects (or 19,000) and one you can't. Most people reach for the powerful expensive step first. Put a cheap funnel in front of it.

## Good & bad

**Good:** The funnel works. It cleanly separated empty shells from real systems, cost almost nothing, and reminded us we're sitting on a cluster of AI-governance tools that are genuinely on-trend.

**Bad — and this is important:** the cheap triage is *optimistic.* It rated the project we'd already deep-analyzed and rejected as "worth a deep dive," because it can see there's real code there — it just can't tell that the code is too generic or too tangled to be worth rescuing. So the triage answers "is there something here?" not "is this a guaranteed win." Those are two different questions, and we'll keep them clearly separate. A cheap filter that's a little too generous is fine — it just means the expensive step still makes the final call.

**Bottom line:** 19 dead projects, 4 honestly thrown out, 15 worth a look, and a forgotten cluster of AI-safety tools rediscovered — for $0 and under four minutes. Next we point the deep analysis at the single most promising one and see if it earns a real "go-ahead."
