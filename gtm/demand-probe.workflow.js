export const meta = {
  name: 'demand-probe-drafts',
  description: 'Draft + honesty-critique + revise build-in-public demand-probe posts for 4 channels (indie-hacker beachhead)',
  phases: [
    { title: 'Draft', detail: 'one channel-tuned draft per surface (Substack/LinkedIn/Twitter/Reddit)' },
    { title: 'Critique', detail: 'one critic reviews all 4 together — honesty (no fake product/customers), voice, traction, IP safety' },
    { title: 'Revise', detail: 'per-channel revise applying the critique + cross-channel voice notes' },
  ],
};

// ── Shared, FIXED context (no Date/random; pure literals) ──────────────────────────────────
// The offer + the proof + the hard honesty constraints. Every agent gets this verbatim.
const AUDIENCE = `Solo founders / "vibe coders" who ship products with Lovable, v0, Bolt, Cursor, Replit Agent — `
  + `but make $0. The pain, in their words: "I've shipped 5 things and none made a dime." They already HAVE `
  + `"how to ship." Nobody helps them answer should-this-exist / will-it-make-money / what's-PMF and then does it.`;

const OFFER = `THE OFFER (exact mechanic — do not soften or change it):\n`
  + `1. Bring us your startup/product idea. We KILL it for FREE — a brutal, default-to-NO verdict judged against `
  + `live market data (real named competitors, real demand evidence), not vibes.\n`
  + `2. If your idea SURVIVES that, we BUILD + SHIP it WITH you — and the FIRST FEW survivors we build for FREE, `
  + `because we want the case studies. After that it's paid.\n`
  + `The hook is the NO. Everyone else is structurally paid to help you ship anything; we're the only one that will `
  + `tell you "don't build this, it won't make money" — and prove it. That's the andon cord.`;

const PROOF = `THE PROOF / SCAR TISSUE (this is the credibility — lead with it, it's TRUE and specific):\n`
  + `We didn't kill other people's ideas first. We pointed the line at our OWN two flagship ideas and it killed BOTH:\n`
  + `- Flagship #1 (an LLM-infrastructure play): killed — the "unique" pieces were already commodity (off-the-shelf `
  + `open-source libraries do it). The code was a box of parts, not a product.\n`
  + `- Flagship #2 (an "MCPShield" AI-tool-governance SaaS, ~60% built): killed TWICE. The name was ALREADY TAKEN `
  + `(a live product at mcpshieldai.com). ~25 direct competitors including a Microsoft toolkit that's free and `
  + `open-source. And the one differentiator we pitched (a finance-specific vertical) existed in our slide deck and `
  + `in ZERO lines of the actual code. The line caught that we were lying to ourselves — and saved us ~8-10 days `
  + `building a commodity whose name was taken.\n`
  + `The point for the reader: if our system is willing to kill OUR babies with receipts, it will be honest with YOURS.`;

const HONESTY = `HARD HONESTY CONSTRAINTS (a critic will reject violations — do not break these):\n`
  + `- We have NO shipped product, NO paying customers, NO revenue yet. This post is a DEMAND PROBE. Never imply `
  + `otherwise. No invented metrics ("validated 50 ideas", "trusted by X"), no fake testimonials, no fake urgency.\n`
  + `- The ONLY concrete proof we have is the two self-kills above. Use only those. Do not fabricate others.\n`
  + `- IP: the underlying system is PRIVATE and stays private. Sell the OUTCOME and tell the STORY; never expose how `
  + `the machine works internally. A generic service framing is fine; do not describe the architecture.\n`
  + `- Voice: first-person founder, plain-spoken, a little raw, builder-to-builder. Not corporate. Not hypey. `
  + `Confident because it's honest, not because it's loud.\n`
  + `- Use [BRAND] as a placeholder wherever a product/service name is needed (the founder fills it in).`;

const CHANNELS = [
  { key: 'substack', label: 'Substack',
    brief: `A long-form essay (~800-1200 words). Title + subtitle + body. This is the flagship "manifesto": the `
      + `real story (we killed our own flagships and why), the contrarian thesis (shipping is solved; making money `
      + `isn't; everyone sells you "ship", nobody sells you "should you"), and the offer at the end as a soft, `
      + `earned CTA. Narrative-driven, sectioned with subheads. The most depth of any channel.` },
  { key: 'linkedin', label: 'LinkedIn',
    brief: `A LinkedIn post (~150-300 words). Strong first-line hook (it must stand alone before the "...more" fold). `
      + `Short punchy paragraphs / line breaks, professional-but-human, one clear story beat + the offer + a `
      + `comment-driving CTA ("comment 'kill mine' and I'll do the first 10 free"). No hashtag spam (2-3 max).` },
  { key: 'twitter', label: 'Twitter/X thread',
    brief: `A thread of 8-12 tweets. Tweet 1 is a scroll-stopping hook (the self-kill confession). Each tweet <=270 `
      + `chars, numbered or flowing. Build the story → the thesis → the offer → CTA in the last tweet ("reply with `
      + `your idea, I'll kill it free"). Punchy, build-in-public native, concrete specifics over abstractions.` },
  { key: 'reddit', label: 'Reddit (r/indiehackers, r/SaaS)',
    brief: `A Reddit post for r/indiehackers / r/SaaS. Title + body. CRITICAL: Reddit HATES marketing. This must read `
      + `as a genuine builder sharing a hard-won lesson FIRST (the self-kill story + what it taught about validation), `
      + `with the offer as a low-key "I'm doing this free for a few people if useful" mention near the end — not a `
      + `pitch. Value-first or it gets downvoted/removed. No links unless natural. Authentic, slightly self-deprecating.` },
];

const SHARED = `AUDIENCE:\n${AUDIENCE}\n\n${OFFER}\n\n${PROOF}\n\n${HONESTY}`;

const DRAFT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['channel', 'body', 'cta'],
  properties: {
    channel: { type: 'string' },
    title: { type: 'string', description: 'headline/subject; for Twitter use tweet 1; empty allowed for LinkedIn' },
    body: { type: 'string', description: 'the full post text, ready to paste (thread = newline-separated tweets)' },
    cta: { type: 'string', description: 'the explicit call to action' },
    self_notes: { type: 'string', description: 'any honesty/IP risks the drafter is unsure about' },
  },
};

const CRITIQUE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['voice_notes', 'per_channel'],
  properties: {
    honesty_flags: { type: 'array', items: { type: 'string' }, description: 'any overclaim / fake-metric / IP-leak across the set' },
    voice_notes: { type: 'string', description: 'cross-channel voice consistency guidance to apply in revision' },
    per_channel: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['channel', 'verdict', 'fixes'],
        properties: {
          channel: { type: 'string' },
          verdict: { type: 'string', enum: ['ship', 'revise'] },
          issues: { type: 'array', items: { type: 'string' } },
          fixes: { type: 'array', items: { type: 'string' }, description: 'concrete, actionable edits for the revise pass' },
          traction_risk: { type: 'string', description: 'will it land or read as spam on THIS channel? how to fix' },
        },
      },
    },
  },
};

// ── Phase 1: Draft (parallel, one per channel) ──────────────────────────────────────────────
phase('Draft');
const drafts = (await parallel(CHANNELS.map(ch => () =>
  agent(
    `You are a top-tier build-in-public copywriter drafting a demand-probe post for ${ch.label}.\n\n`
    + `${SHARED}\n\nCHANNEL BRIEF — ${ch.label}:\n${ch.brief}\n\n`
    + `Write the single best version you can. Return the DraftPost.`,
    { label: `draft:${ch.key}`, phase: 'Draft', schema: DRAFT_SCHEMA, model: 'sonnet' })
    .then(d => ({ ...d, channel: d.channel || ch.label, _key: ch.key }))
    .catch(() => null)
))).filter(Boolean);

if (!drafts.length) return { error: 'all drafts failed', drafts: [], critique: null };

// ── Phase 2: Critique (barrier — the critic needs ALL drafts for voice consistency) ─────────
phase('Critique');
const critique = await agent(
  `You are a brutally honest editor + Reddit/indie-hacker community veteran reviewing a SET of demand-probe posts `
  + `that will be published across channels by ONE founder. Your job: protect the founder from (a) overclaiming `
  + `(we have NO product/customers/revenue — this is a probe), (b) fabricated metrics or testimonials, (c) leaking `
  + `how the private system works, (d) sounding hypey/corporate, and (e) posting something that will flop or get `
  + `removed on its channel (especially Reddit, which punishes anything that smells like marketing).\n\n`
  + `The constraints the drafts were given:\n${HONESTY}\n\n`
  + `THE DRAFTS:\n${JSON.stringify(drafts.map(d => ({ channel: d.channel, title: d.title, body: d.body, cta: d.cta })), null, 2)}\n\n`
  + `For EACH channel return verdict ship|revise + concrete fixes + a traction_risk read. List any honesty_flags `
  + `across the whole set. Give cross-channel voice_notes. Default to "revise" if anything is even slightly off — `
  + `the bar is: would a skeptical indie hacker trust this and not roll their eyes? Return the Critique.`,
  { label: 'critique:all', phase: 'Critique', schema: CRITIQUE_SCHEMA, agentType: 'code-reviewer', model: 'sonnet' });

const fixesByChannel = new Map((critique.per_channel || []).map(c => [c.channel, c]));

// ── Phase 3: Revise (parallel — each draft + its critique → final) ──────────────────────────
phase('Revise');
const finals = (await parallel(drafts.map(d => () => {
  const ch = CHANNELS.find(c => c.key === d._key);
  const crit = fixesByChannel.get(d.channel) || fixesByChannel.get(ch?.label) || { fixes: [], issues: [] };
  return agent(
    `You are revising your ${ch?.label || d.channel} demand-probe draft to FINAL, paste-ready quality.\n\n`
    + `${SHARED}\n\nCHANNEL BRIEF:\n${ch?.brief || ''}\n\n`
    + `YOUR DRAFT:\n${JSON.stringify({ title: d.title, body: d.body, cta: d.cta }, null, 2)}\n\n`
    + `EDITOR'S CROSS-CHANNEL VOICE NOTES:\n${critique.voice_notes || '(none)'}\n\n`
    + `EDITOR'S FIXES FOR THIS CHANNEL:\n${JSON.stringify(crit.fixes || [], null, 2)}\n`
    + `ISSUES TO RESOLVE:\n${JSON.stringify(crit.issues || [], null, 2)}\n`
    + `TRACTION RISK TO ADDRESS:\n${crit.traction_risk || '(none)'}\n\n`
    + `Apply every fix that improves it without breaking the honesty constraints. Return the final DraftPost.`,
    { label: `revise:${d._key}`, phase: 'Revise', schema: DRAFT_SCHEMA, model: 'sonnet' })
    .then(f => ({ ...f, channel: f.channel || ch?.label || d.channel, _key: d._key }))
    .catch(() => d); // fall back to the reviewed draft if revise fails
}))).filter(Boolean);

return { finals, critique, draft_count: drafts.length };
