// recycled/ideate.workflow.js — Recycled NET-NEW IDEATION (D17), the generator the salvage line lacked.
// Where workflow.js salvages dead repos, this GENERATES fresh product ideas from real demand and runs them
// through the SAME honest judge (ground-truth gate → kill-pass → durability → first-principles). It only
// orchestrates agents — it cannot touch the filesystem. The orchestrating agent pipes the result into:
//   cd /Users/the-hive/factory-core && node recycled/recycled-scan.mjs ideate ingest <run-id>
// which persists the run artifacts (auditable + feeds D16 metrics) AND projects greenlights into the build queue.
//
// REUSE-FIRST (D17): the judge (ground-truth + kill-pass + durability) is reused wholesale; the only NEW thing
// is the generator (I1 demand-mine + I2 synthesis) and the net-new bar (reuse_over_rebuild). Methodology, not
// new infra: Amy Hoy "Sales Safari" pain-mining + JTBD + PG "live in the future" + YC "build for existing demand".
// The kill-pass is NOT weakened — a self-generated idea is judged exactly as hard as a salvage candidate.
export const meta = {
  name: 'recycled-ideate',
  description: 'Recycled net-new ideation (D17): mine real demand → synthesize specific ideas → same honest gate → build-spec or honest kill',
  phases: [
    { title: 'Demand-mine', detail: 'pain-mine real, cited, repeated demand (Sales-Safari + JTBD)' },
    { title: 'Synthesize', detail: 'turn top pains into specific zero-to-one product candidates' },
    { title: 'Ground-truth', detail: 'live competitive sweep per candidate (cures blindness)' },
    { title: 'Kill', detail: '3 adversarial skeptics per candidate, default-to-kill, ideation bars' },
    { title: 'Durability', detail: 'Thiel 7-questions (≥6/7) + Elon first-principles per survivor' },
    { title: 'Synth', detail: 'durable survivors → net-new build-spec (build-from-scratch)' },
  ],
};

const FC = '/Users/the-hive/factory-core';
let _A = args;
if (typeof _A === 'string') { try { _A = JSON.parse(_A); } catch { _A = null; } }
// Idea domain (RESOLVED default: boring, high-intent, low-competition B2B). Override via args.domain.
const DOMAIN = (_A && _A.domain) ||
  'boring, high-intent, LOW-competition B2B back-office work (ops, finance, compliance, logistics, field-service, ' +
  'agencies) where a specific role ALREADY pays for tools or hand-jams painful manual/spreadsheet workarounds';
const MAX_PAINS = (_A && _A.maxPains) || 6;       // top pain clusters to carry into synthesis
const MAX_IDEAS = (_A && _A.maxIdeas) || 6;       // candidate ideas to ground-truth + judge

// ── inline output contracts (the sandbox can't read schemas/*.json) ──
const PAIN_CLUSTERS = { type: 'object', required: ['clusters'], properties: { clusters: { type: 'array', items: {
  type: 'object', required: ['pain', 'segment', 'frequency', 'served_read', 'underserved_signal', 'evidence', 'sources'], properties: {
    pain: { type: 'string' },                       // the specific, repeated frustration (not a vague theme)
    segment: { type: 'string' },                    // the precise role/vertical who has it
    workaround: { type: 'string' },                 // what they do today (manual / spreadsheet / duct-taped tools)
    pays_today: { type: 'string' },                 // evidence they already spend money/time on this
    frequency: { type: 'string', enum: ['rare', 'recurring', 'constant'] },
    // how well-served the pain ALREADY is (the whitespace signal — the last run died because every pain was well-served)
    served_read: { type: 'string', enum: ['manual-workaround-dominant', 'tools-exist-but-inadequate', 'well-served'] },
    underserved_signal: { type: 'string' },         // concrete evidence it is NOT well-served (quote it) — or why it IS
    evidence: { type: 'array', items: { type: 'string' } },  // quoted real complaints
    sources: { type: 'array', items: { type: 'string' } } } } } } }; // REAL urls actually consulted
const OPPORTUNITIES = { type: 'object', required: ['candidates'], properties: { candidates: { type: 'array', items: {
  type: 'object', required: ['candidate_id', 'lane', 'product', 'ai_native_test', 'does_it_for_you', 'zero_to_one_rank', 'whitespace', 'scores'], properties: {
    candidate_id: { type: 'string' }, lane: { type: 'string', enum: ['consumer', 'SMB', 'AI-native-service'] }, product: { type: 'string' },
    vertical: { type: 'string' }, icp: { type: 'string' }, wedge: { type: 'string' },
    // named incumbents who serve the broad pain + the SPECIFIC underserved wedge this targets + why incumbents can't follow
    whitespace: { type: 'string' },
    ai_native_test: { type: 'string', enum: ['PASS', 'FAIL'] },
    // D19: does it OWN THE OUTCOME / close the loop, or is it horizontal SaaS handing the user another tool to operate?
    does_it_for_you: { type: 'string', enum: ['PASS', 'FAIL'] }, zero_to_one_rank: { type: 'string', enum: ['true-zero-to-one', 'incremental', 'me-too'] },
    scores: { type: 'object', required: ['reuse_leverage', 'dependency_cost_inverted', 'capability_novelty', 'buildable_in_budget', 'market_pull'], properties: {
      reuse_leverage: { type: 'integer' }, dependency_cost_inverted: { type: 'integer' }, capability_novelty: { type: 'integer' },
      buildable_in_budget: { type: 'integer' }, market_pull: { type: 'integer' } } } } } } } };
const GROUNDTRUTH = { type: 'object', required: ['searched_landscape', 'competitors', 'sources', 'checked_at', 'novelty_read', 'demand_read'], properties: {
  searched_landscape: { type: 'boolean' },
  competitors: { type: 'array', items: { type: 'object', required: ['name', 'what_they_ship', 'overlap'], properties: {
    name: { type: 'string' }, what_they_ship: { type: 'string' }, overlap: { type: 'string', enum: ['direct', 'adjacent', 'weak'] } } } },
  demand_evidence: { type: 'array', items: { type: 'string' } },
  sources: { type: 'array', items: { type: 'string' } },
  checked_at: { type: 'string' },
  novelty_read: { type: 'string', enum: ['genuinely-novel', 'differentiated', 'crowded-me-too'] },
  demand_read: { type: 'string', enum: ['evidenced-demand', 'plausible', 'no-evidence'] } } };
// Net-new kill-pass verdict: the cost bar is reuse_over_rebuild (NOT salvage_cheaper_than_rebuild) — there's no repo to salvage.
const VERDICT = { type: 'object', required: ['bars', 'verdict', 'confidence'], properties: {
  bars: { type: 'object', required: ['not_frankenstein', 'not_horizontal_sprawl', 'real_demand', 'is_zero_to_one', 'does_it_for_you', 'reuse_over_rebuild'], properties: {
    not_frankenstein: { type: 'string', enum: ['PASS', 'FAIL'] }, not_horizontal_sprawl: { type: 'string', enum: ['PASS', 'FAIL'] },
    real_demand: { type: 'string', enum: ['PASS', 'FAIL'] }, is_zero_to_one: { type: 'string', enum: ['PASS', 'FAIL'] },
    does_it_for_you: { type: 'string', enum: ['PASS', 'FAIL'] }, reuse_over_rebuild: { type: 'string', enum: ['PASS', 'FAIL'] } } },
  verdict: { type: 'string', enum: ['SURVIVE', 'KILL'] }, kill_reason: { type: 'string' }, confidence: { type: 'number' } } };
const BUILDSPEC = { type: 'object', required: ['product', 'wrap_plan', 'ai_native_test'], properties: {
  product: { type: 'string' }, icp: { type: 'string' }, wedge: { type: 'string' },
  wrap_plan: { type: 'string' }, rough_dev_effort: { type: 'string' }, ai_native_test: { type: 'string', enum: ['PASS', 'FAIL'] } } };

const SEVEN_Q = ['engineering', 'timing', 'monopoly', 'people', 'distribution', 'durability', 'secret'];
const FP_CHECKS = ['reasoned_from_fundamentals', 'requirements_questioned', 'irreducible'];
const _qa = keys => { const p = {}; for (const k of keys) p[k] = { type: 'object', required: ['pass', 'why'], properties: { pass: { type: 'boolean' }, why: { type: 'string' } } }; return p; };
const DURABILITY_SCHEMA = { type: 'object', required: ['seven_questions', 'first_principles'], properties: {
  seven_questions: { type: 'object', required: SEVEN_Q, properties: _qa(SEVEN_Q) },
  first_principles: { type: 'object', required: FP_CHECKS, properties: _qa(FP_CHECKS) } } };

// ── inline mirrors of recycled-scan.mjs (the tested source of truth). MUST stay in sync. ──
const IDEATION_BARS = ['not_frankenstein', 'not_horizontal_sprawl', 'real_demand', 'is_zero_to_one', 'does_it_for_you', 'reuse_over_rebuild'];
function rollup(list, min = 3) {
  const l = (list || []).filter(Boolean);
  if (l.length < min) return { verdict: 'KILL', reason: `abstain: ${l.length}/${min} skeptics` };
  for (const v of l) {
    if (v.verdict !== 'SURVIVE') return { verdict: 'KILL', reason: v.kill_reason || `skeptic ${v.skeptic} ${v.verdict}` };
    if (typeof v.confidence === 'number' && v.confidence < 0.6) return { verdict: 'KILL', reason: `skeptic ${v.skeptic} low confidence ${v.confidence}` };
    for (const b of IDEATION_BARS) if (v?.bars?.[b] !== 'PASS') return { verdict: 'KILL', reason: `skeptic ${v.skeptic} failed ${b}` };
  }
  return { verdict: 'SURVIVE', reason: `unanimous ${l.length} skeptics` };
}
function groundTruthOk(p) {
  if (!p || typeof p !== 'object') return { ok: false, reason: 'no ground-truth packet — skeptics would be blind' };
  const competitors = Array.isArray(p.competitors) ? p.competitors.filter(Boolean) : [];
  const sources = Array.isArray(p.sources) ? p.sources.filter(Boolean) : [];
  if (!sources.length) return { ok: false, reason: 'uncited ground-truth (no sources)' };
  if (!competitors.length && p.searched_landscape !== true) return { ok: false, reason: 'empty ground-truth with no attested search' };
  return { ok: true, reason: `${competitors.length} competitor(s), ${sources.length} source(s)` };
}
const DURABILITY_MIN_PASS = 6, FP_MIN_PASS = 2; // MUST match recycled-scan.mjs
function scoreSevenQuestions(a) { const by = {}; let n = 0; for (const q of SEVEN_Q) { const ok = a?.[q]?.pass === true; by[q] = ok; if (ok) n++; } return { passed: n, total: SEVEN_Q.length, by_question: by, durability_pass: n >= DURABILITY_MIN_PASS }; }
function scoreFirstPrinciples(fp) { const by = {}; let n = 0; for (const c of FP_CHECKS) { const ok = fp?.[c]?.pass === true; by[c] = ok; if (ok) n++; } return { passed: n, total: FP_CHECKS.length, by_check: by, first_principles_pass: by.reasoned_from_fundamentals === true && n >= FP_MIN_PASS }; }

const WEB = 'FIRST load web tools: ToolSearch with query "select:WebSearch,WebFetch". Then actually search the live web.';

// ── I1: demand-mine — find real, specific, repeated pain people already pay/workaround to solve ──
log(`Recycled ideation → domain: ${DOMAIN}`);
const mined = await agent(
  `You are a DEMAND MINER using Amy Hoy's "Sales Safari" + Jobs-to-be-Done. Find REAL, SPECIFIC, REPEATED, and crucially UNDER-SERVED pain in this domain:\n${DOMAIN}\n${WEB}\n` +
  `Go where the pain is aired: niche subreddits, industry forums, G2/Capterra/TrustRadius ONE-STAR reviews, Stack Exchange, job postings (a role in shortage = unmet work), "I wish there was a tool that..." posts.\n` +
  `PRIORITIZE under-served pain — where the dominant workaround is still MANUAL/spreadsheet (a true tool gap), OR where people explicitly say the existing tools FAIL them on a specific dimension. DEPRIORITIZE pain already well-served by a popular named tool — that is exactly where the last run died: every idea turned out to be a me-too of an existing product.\n` +
  `For each cluster require: a SPECIFIC frustration (not a vague theme), the precise role/segment, the workaround TODAY, evidence they ALREADY pay or spend real time (existing demand, per YC), frequency, a served_read (manual-workaround-dominant | tools-exist-but-inadequate | well-served), an underserved_signal (the concrete evidence it is NOT well-served — quote it), quoted evidence, and REAL source urls you actually consulted.\n` +
  `Be ruthless: skip generic horizontal ideas and "trending topics". FAVOR manual-workaround-dominant + tools-exist-but-inadequate over well-served. Return {clusters:[...]} — the ${MAX_PAINS} strongest UNDER-SERVED clusters. NEVER fabricate a source.`,
  { model: 'sonnet', phase: 'Demand-mine', label: 'demand-mine', schema: PAIN_CLUSTERS });
// Whitespace-first: feed the LEAST-served pains into synthesis (manual-workaround > inadequate-tools > well-served).
const SERVED_RANK = { 'manual-workaround-dominant': 2, 'tools-exist-but-inadequate': 1, 'well-served': 0 };
const pains = (mined.clusters || [])
  .sort((a, b) => (SERVED_RANK[b.served_read] ?? 0) - (SERVED_RANK[a.served_read] ?? 0))
  .slice(0, MAX_PAINS);
log(`Demand-mined ${(mined.clusters || []).length} pains; served_read: ${(mined.clusters || []).map(c => c.served_read).join(', ') || 'none'}`);
if (!pains.length) {
  return { inventory: [], capabilities: [], candidates: [], judged: [], durability: [], buildspecs: [],
    frozen: [{ repo: 'net-new/ideation', reason: 'demand-mine surfaced no specific, cited, demand-backed pain in this domain' }] };
}

// ── I2: synthesize — turn the top pains into specific, zero-to-one product candidates ──
const mapped = (await parallel(pains.map(p => () => agent(
  `Turn this real pain into NET-NEW product candidates — but ONLY ones that target genuine WHITE SPACE. ${WEB}\n` +
  `PAIN: ${JSON.stringify(p)}\n` +
  `STEP 1 — LANDSCAPE SWEEP FIRST (do this before proposing anything): search who ALREADY serves this pain for this segment — named incumbents + OSS, their current behavior and pricing. The last ideation run died because every idea was a me-too of an existing product; do this check NOW so that can't happen again.\n` +
  `STEP 2 — find the GAP the incumbents miss: a narrower niche, an underserved sub-segment, the specific workflow incumbents skip or do badly, or a wedge their business model can't follow. If the pain is fully and well served with NO defensible gap, return ZERO candidates for it — honest, do NOT force a me-too.\n` +
  `THE BAR: specific + vertical (NOT horizontal), DEFENSIBLY DIFFERENTIATED vs the named incumbents (zero_to_one_rank MUST be "true-zero-to-one"; do not propose "incremental"/"me-too"), real evidenced demand, buildable mostly by orchestrating proven components in a small budget.\n` +
  `D19 — DOES-IT-FOR-YOU (a HARD gate): the product must OWN THE OUTCOME and close the loop — it does the work for the user and keeps them in the loop (monitor → act → notify), NOT a horizontal dashboard/tool the user still has to operate with AI bolted on as a feature. Set does_it_for_you=PASS ONLY for a genuine outcome-owning, closed-loop product; mark FAIL for anything that's "just another tool you operate". This is the difference between a cool feature and a moat.\n` +
  `REQUIRED per candidate — whitespace: name the incumbents who serve the broad pain + the SPECIFIC underserved wedge this targets + WHY the incumbents don't/can't cover it (business-model conflict, too-small-for-them, wrong-segment).\n` +
  `Score 0-5: reuse_leverage, dependency_cost_inverted, capability_novelty, buildable_in_budget, market_pull (honest). Give lane, vertical, icp, wedge, ai_native_test (remove AI — collapse=PASS; informational, not a gate), does_it_for_you (the D19 gate above). Return {candidates:[...]} — 0 to 2 (FEWER is better than forced; quality over quota).`,
  { model: 'sonnet', phase: 'Synthesize', label: `synth:${(p.segment || 'pain').slice(0, 24)}`, schema: OPPORTUNITIES })
    .then(r => ({ pain: p, candidates: (r.candidates || []).filter(c => c.zero_to_one_rank === 'true-zero-to-one' && c.does_it_for_you === 'PASS').slice(0, 2) })))
)).filter(Boolean);

let candidates = mapped.flatMap((m, mi) => m.candidates.map((c, i) => ({
  ...c, net_new: true, source_pain: m.pain?.pain,
  candidate_id: c.candidate_id || `ideate-${mi + 1}-${i + 1}`,
  score_total: Object.values(c.scores || {}).reduce((a, b) => a + (Number(b) || 0), 0),
}))).slice(0, MAX_IDEAS);
if (!candidates.length) {
  return { inventory: [], capabilities: [], candidates: [], judged: [], durability: [], buildspecs: [],
    frozen: [{ repo: 'net-new/ideation', reason: 'pains mined but no specific product mapping survived synthesis' }] };
}

// ── I3+I4: ground-truth sweep → gate → adversarial kill-pass (3 skeptics, default-to-kill, IDEATION bars) ──
const judged = (await parallel(candidates.map(cand => async () => {
  const packet = await agent(
    `GROUND-TRUTH sweep for this NET-NEW candidate. Establish the LIVE 2026 competitive landscape so the skeptics judge novelty + demand against REALITY, not the idea's self-claims.\n` +
    `Candidate: ${JSON.stringify(cand)}\n${WEB}\n` +
    `Search hard for who ALREADY ships this (named companies + OSS, with current behavior) and for real evidence of demand.\n` +
    `Return: competitors[] (name, what_they_ship, overlap=direct|adjacent|weak), demand_evidence[], sources[] (REAL urls), searched_landscape=true, checked_at=today's date in ISO, novelty_read, demand_read.\n` +
    `If after a genuine search the field is truly empty, return competitors:[] with searched_landscape:true and explain in demand_read — but NEVER fabricate a competitor and NEVER return an unsourced packet.`,
    { model: 'sonnet', phase: 'Ground-truth', label: `ground:${cand.candidate_id}`, schema: GROUNDTRUTH })
    .catch(() => null);
  const gt = groundTruthOk(packet);
  if (!gt.ok) return { candidate_id: cand.candidate_id, ground_truth: packet || null, verdicts: [], rollup: { verdict: 'KILL', reason: `ground-truth gate: ${gt.reason}`, ground_truth_ok: false } };
  const verdicts = (await parallel([1, 2, 3].map(n => () => agent(
    `You are a RUTHLESS skeptic. Try to REFUTE this net-new product idea. Default to FAIL on doubt.\n` +
    `Candidate: ${JSON.stringify(cand)}\n` +
    `LIVE GROUND-TRUTH (judge is_zero_to_one and real_demand against THIS, never the idea's self-claims — if a competitor already ships it, is_zero_to_one FAILs): ${JSON.stringify(packet)}\n` +
    `THE BAR: a winner is defensible + vertical + has real demand + cheaply buildable by orchestration + OWNS THE OUTCOME. AI-native is a PLUS, not a gate.\n` +
    `Judge all 6 bars (PASS only if it clearly clears):\n` +
    `- not_frankenstein: a coherent single product, NOT a fragile duct-tape of unrelated APIs/features?\n` +
    `- not_horizontal_sprawl: a focused vertical wedge, NOT a generic horizontal tool?\n` +
    `- real_demand: real, evidenced market pull (use the ground-truth demand_evidence) with a specific ICP who'd PAY, NOT a solution in search of a problem?\n` +
    `- is_zero_to_one: genuinely new / defensibly differentiated vs the ground-truth competitors, NOT a crowded me-too?\n` +
    `- does_it_for_you (D19): does it OWN THE OUTCOME and close the loop — DO the work for the user and keep them in the loop (monitor → act → notify) — NOT a horizontal dashboard/tool the user still operates with AI bolted on? FAIL anything that just informs or hands the user another tool. This is the cool-vs-moat line.\n` +
    `- reuse_over_rebuild: can a real v1 be built MOSTLY by orchestrating proven components within a small budget (not a from-scratch heavy lift)? (the net-new cost bar — the common silent kill)\n` +
    `verdict = SURVIVE only if ALL 6 bars PASS. Give kill_reason if KILL, and a confidence 0-1.`,
    { agentType: 'code-reviewer', model: 'sonnet', phase: 'Kill', label: `skeptic${n}:${cand.candidate_id}`, schema: VERDICT })
      .then(v => ({ ...v, skeptic: n, candidate_id: cand.candidate_id }))
  ))).filter(Boolean);
  return { candidate_id: cand.candidate_id, ground_truth: packet, verdicts, rollup: { ...rollup(verdicts), ground_truth_ok: true } };
}))).filter(Boolean);

const survivors = candidates
  .filter(c => judged.find(j => j.candidate_id === c.candidate_id)?.rollup.verdict === 'SURVIVE')
  .sort((a, b) => (b.score_total || 0) - (a.score_total || 0));

// ── I4.5: durability (Thiel 7-Q ≥6/7) + first-principles per survivor — both must pass (fail-closed) ──
const durability = (await parallel(survivors.map(cand => () => {
  const packet = judged.find(j => j.candidate_id === cand.candidate_id)?.ground_truth || null;
  return agent(
    `Apply the factory's BUILD-DURABILITY gate to this kill-pass survivor — the bar a SKU must clear before we build it. Be a kill-first skeptic: default every question to FAIL unless clearly cleared. Judge monopoly/durability/timing against the LIVE ground-truth, never the idea's self-claims.\n` +
    `Candidate: ${JSON.stringify(cand)}\nLive ground-truth: ${JSON.stringify(packet)}\n` +
    `THIEL'S 7 QUESTIONS (seven_questions; pass only if clearly cleared): engineering (>=10x on a dimension customers care about), timing, monopoly (big share of a SMALL market, not 1% of huge / me-too), people, distribution (a concrete way to REACH customers), durability (defensible years, compounds), secret (a true contrarian insight).\n` +
    `ELON FIRST-PRINCIPLES (first_principles): reasoned_from_fundamentals (CORE — fail this and the gate fails; derived from fundamentals not analogy/"how everyone does it"), requirements_questioned, irreducible (scoped to the deleted/simplified minimum).`,
    { agentType: 'code-reviewer', model: 'sonnet', phase: 'Durability', label: `durability:${cand.candidate_id}`, schema: DURABILITY_SCHEMA })
    .then(d => {
      const sq = scoreSevenQuestions(d.seven_questions), fp = scoreFirstPrinciples(d.first_principles);
      return { candidate_id: cand.candidate_id, seven_questions: sq, first_principles: fp, durability_pass: sq.durability_pass, first_principles_pass: fp.first_principles_pass };
    })
    .catch(() => ({ candidate_id: cand.candidate_id, seven_questions: scoreSevenQuestions(null), first_principles: scoreFirstPrinciples(null), durability_pass: false, first_principles_pass: false }));
}))).filter(Boolean);
const buildEligible = new Set(durability.filter(d => d.durability_pass && d.first_principles_pass).map(d => d.candidate_id));
const durableSurvivors = survivors.filter(c => buildEligible.has(c.candidate_id));

// ── I5: durable survivors → net-new build-spec (build-from-scratch; empty extract_list; net_new:true) ──
let buildspecs = [];
if (durableSurvivors.length) {
  buildspecs = (await parallel(durableSurvivors.map((cand, i) => () => agent(
    `Produce a build-ready net-new BuildSpec for this greenlit idea (rank ${i + 1}). There is NO repo to lift from — this is build-from-scratch.\n` +
    `Candidate: ${JSON.stringify(cand)}\n` +
    `wrap_plan = the concrete build plan: which PROVEN components/libs/APIs to orchestrate (the reuse_over_rebuild discipline), the thin new layer to write, and the v1 scope. Give icp, wedge, rough_dev_effort. Return a BuildSpec.`,
    { agentType: 'code-architect', model: 'sonnet', phase: 'Synth', label: `spec:${cand.candidate_id}`, schema: BUILDSPEC })
    .then(s => ({
      ...s, spec_id: `ideate-${cand.candidate_id}`, candidate_id: cand.candidate_id,
      source_repo: null, net_new: true, extract_list: [], extracts_verified: true,
      rank: i + 1, license_human_confirmed: true, parts_bin_refs: [],
    }))
  ))).filter(Boolean);
}

const frozen = durableSurvivors.length ? [] : [{ repo: 'net-new/ideation', reason: survivors.length
  ? 'survivor(s) failed the durability/first-principles gate (Thiel <6/7 or analogy/me-too) — not build-durable this run'
  : 'all candidates killed in the adversarial pass; no build-ready zero-to-one this run' }];

return { inventory: [], capabilities: [], candidates, judged, durability, buildspecs, frozen };
