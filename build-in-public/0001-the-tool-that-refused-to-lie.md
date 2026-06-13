# 0001 — The tool that refused to lie to us

**Date:** 2026-06-11

> **Correction (2026-06-12):** A bug we found later ([entry 0003](0003-first-real-product-found-in-dead-code.md)) means this run was incomplete. The tool was mistakenly analyzing each project's *placeholder* parts and skipping its *fully-built* parts — so on this project it judged the empty front-end and never evaluated the one real piece (an AI engine). The "8 out of 8 killed" verdict is honest about *what it looked at*, but it wasn't a full evaluation. We've fixed the bug; the lesson below still stands.

## What happened
We built a tool that digs through our abandoned code looking for hidden product ideas. We pointed it at our first dead project. It found 8 possible products — then its own built-in critics killed all 8 and told us, with evidence, to build nothing here. That "nothing" is the win.

## The story

Like most builders, we have a graveyard of half-finished projects sitting on GitHub. Code we wrote, debugged, and then walked away from. The instinct is to feel bad and ignore it.

We had a different idea. When you build something, even something that failed, you prove a *capability* along the way — a thing your code learned to do. The dead product is dead, but the capability might be worth re-using for a completely different product. So we built a tool (we're calling it **Recycled**) to go find those capabilities automatically.

Here's the part most people get wrong: a tool like this is only useful if it's willing to tell you "no." A tool that always finds a "great opportunity" is just a flattery machine — it'll keep you busy building junk. So we built ours to be a harsh critic by default.

The way it works, in plain terms:
1. It reads an abandoned project and lists what's actually in there.
2. For each meaningful piece, it asks "what could this become?"
3. Then — the important part — **three independent AI critics** try to *kill* each idea. An idea only survives if all three agree it passes every test: Is it actually new? Is it focused, not generic? Would reusing the old code genuinely be faster than starting fresh? Does it truly need AI to work?
4. If an idea survives, it writes a build plan. If not, it tells you why, in detail.

We ran it on our first dead project — an AI "morning assistant" app. And it came back with a clean, well-argued **no.**

Why? Because when its critics actually read the code, they found the project was mostly empty — placeholder files, to-do notes, and a thin connection to an AI model. There was no real, finished capability to rescue. One of the idea-generators even got a little excited and described features that didn't exist (it had read our to-do *comments* as if they were built). The critics caught that immediately and called it out: *"built on fabricated evidence — these files are fewer than 50 lines of placeholders."*

The most valuable thing it told us, over and over: **"rebuilding this cleanly would be faster than untangling the old code."** That single sentence is the difference between a productive salvage and months wasted polishing a corpse.

## The numbers

- **33 AI workers** ran the job, start to finish, on their own.
- **~20 minutes**, fully automated, no human in the loop.
- **4** reusable capabilities identified → **8** product ideas generated → **24** independent critic reviews (3 per idea).
- **8 of 8 ideas killed.** Zero fake wins.
- **$0 out of pocket** — it ran on our existing AI plan (it deliberately used cheaper AI models for the heavy lifting, never the expensive one).
- Before any of this, the tool's safety checks (**19 of 19**) passed in under a tenth of a second — we test the rules *before* we trust the tool.
- **One honest cost lesson:** that single project burned a big chunk of AI work (~1.4 million words of thinking) just to conclude "there's nothing here." So the next version adds a cheap 5-second pre-check to skip empty projects before doing the expensive deep dive.

## The lesson

**A tool that's willing to tell you "no" is worth more than one that always says "yes."**

Most people building with AI optimize for output — more ideas, more code, more momentum. The harder and more valuable thing is building AI that has *judgment*: that can look at its own suggestions and throw out the weak ones before they cost you time. We designed Recycled to fail loudly and early, on purpose. The first time we ran it, it did exactly that — and saved us from building a product on top of an empty shell.

How we got there is the whole playbook for building AI-native products:
- **Design:** decide the rules first (what counts as a real opportunity, what gets rejected) before writing the smart part.
- **Test:** prove the rules with fast, automatic checks — *before* trusting the AI to follow them.
- **Build:** ship the thinnest version that works end-to-end on *one* example, not a giant system you can't verify.
- **Ship:** run it for real, and report the honest result — even when the honest result is "build nothing."

## Good & bad

**Good:** The system worked exactly as designed. The critics were sharp, specific, and right. It refused to invent a win. The whole thing ran itself for $0.

**Bad:** Our idea-generation step was too gullible — it described features from to-do notes that were never built. (The critics caught it, but we'd rather it not happen.) And the deep dive was expensive for what we learned, so we're adding a cheap pre-filter. Both are now fixed or scheduled.

**The honest bottom line:** one dead project, one honest "no." That doesn't prove the tool finds gold — it proves the tool won't hand us fool's gold. Next, we point it at our bigger, more complete abandoned projects, where there's actually something worth rescuing.
