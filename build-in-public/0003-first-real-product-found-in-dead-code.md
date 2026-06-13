# 0003 — Our tool found its first real product in our dead code

**Date:** 2026-06-12

## What happened
We pointed our salvage tool's deep analysis at one of our abandoned projects — an AI governance gateway called ShepGate. It generated 10 possible products, its three built-in critics killed 9 of them, and **one survived every test**: a "firewall for AI agents" we're calling MCPShield, with a concrete 8–10 day build plan that reuses ~60% of the existing code. That's the tool's first real "go-ahead." Getting there meant catching two of our own bugs that were *hiding* the win.

## The story

Last time, our tool correctly found nothing worth saving in an empty project. This time we aimed it at a project that the quick scan flagged as genuinely built: ShepGate, a system that sits between an AI agent and the tools it can use, and enforces rules — *this agent can read files, but deleting anything needs a human to approve it first.* It logs everything. It's exactly the kind of thing every company deploying AI agents is about to need.

**The first run failed in a way that taught us something.** It came back in three minutes saying "nothing to analyze here." For a fully-built project, that's nonsense — and the suspiciously fast "nothing" is what exposed the bug. Our tool labels each part of a project as either "fully built" or "just a placeholder," and then — through a one-word mistake in the code — it was studying the *placeholders* and ignoring the *fully-built* parts. It was searching the junk drawer and ignoring the toolbox. (This same bug had quietly hurt our very first run, too — see the correction on entry 0001.) We fixed it: now it studies the real, working code, best parts first.

**The second run found a winner — then almost threw it away.** With the fix, the tool did the full job: it pulled out the reusable capabilities, brainstormed 10 products, and ran each past three independent AI critics whose only job is to kill weak ideas. Nine died. One survived all three critics on all five tests. But then it failed at the very last gate — a safety check that confirms every file the plan wants to reuse *actually exists*, so the tool can never invent files. It reported all the files as missing.

They weren't missing. **Bug number two:** the tool was checking each file's address with the project name accidentally written twice — like mailing a letter to "123 Main St, 123 Main St" — so every lookup bounced. The files were real; the address was malformed. We fixed the formatting, re-checked, and all eight source files were confirmed real. **Greenlight.**

Two bugs, and here's the thing worth sitting with: *both of them were hiding value.* One made the tool ignore good code. The other made it reject real files. Neither showed up as an error — one looked like a valid "nothing here," the other like a valid "files missing." We only caught them because we could see the tool's *work*, not just its verdict.

## The winner: MCPShield

The surviving idea: a managed "firewall for AI agents." Companies plugging AI agents into real tools (GitHub, databases, Slack) need to prove to their own enterprise customers that the AI can't go rogue — that risky actions get queued for human approval, that everything's logged, that credentials are locked down. ShepGate already had that engine built. MCPShield repackages it as a hosted service those companies can hand to their clients on day one instead of building it themselves over six weeks.

The tool didn't just say "good idea" — it wrote the build plan: which 8 files to lift, what thin new layer to add on top (multi-tenant accounts, dashboard, login, billing), and an honest estimate: **8–10 days for one engineer, because ~60% of the hard part already exists.**

## The numbers

- **42 AI workers**, ~**19 minutes**, fully automated. **$0 out of pocket** (existing plan, cheaper models, no premium model used).
- **10 product ideas** generated → **9 killed** by the critics → **1 survived** (all 3 critics, all 5 tests passed).
- **8 source files** to reuse — every one verified to actually exist before the plan was accepted.
- **~60% of the backend** already built; **8–10 day** estimate to a sellable first version.
- **2 bugs** found and fixed mid-run — both of which had been *hiding* real value.

## The lesson

**A tool earns the right to say "yes" by how honestly it says "no."** Nine kills are what make the one greenlight believable. If it had said "yes" to all ten, we'd trust none of them. The value isn't the idea generator — it's the ruthless critic standing behind it.

And the deeper engineering lesson: **build AI tools that show their work, not just their answer.** Both our bugs produced *plausible-looking results* — "nothing here," "files missing" — that we'd have believed if we couldn't see underneath. We caught them because the tool logs every step: a 3-minute "nothing" and a wall of failed file lookups. If your AI tool is a black box that only emits a verdict, you can't tell a real "no" from a bug wearing a "no" costume.

## Good & bad

**Good:** First real product surfaced from dead code, fully argued, with a concrete build plan — and it's genuinely on-trend (AI agent governance). The critics did their job. $0 and 19 minutes.

**Bad — documented honestly:**
- We shipped two bugs that both hid value. One made the tool analyze the worst code in every project; the other made it reject real files. Both are now fixed (and both are now covered by automatic tests so they can't come back).
- Our first run (entry 0001) was affected by bug #1 — its "8 out of 8 killed" verdict was reached by judging the project's *placeholder* parts and never evaluating its one real piece. The kill stands for what it looked at, but it wasn't a complete evaluation. We've corrected that entry.

**Bottom line:** one real, build-ready product pulled out of a project we'd abandoned — for $0 and 19 minutes — after our own tool's honesty (and its detailed logs) caught two bugs that were hiding the win. This is the proof we were after: the tool can find gold, and it won't hand us anything it can't back up.
