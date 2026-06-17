// recycled/scout.js — Tier-1 SCOUT pass: the cheap middle tier between triage (Tier-0, ultra-cheap
// builtness score) and the full deep-dive (workflow.js, Tier-2, 5 stages × 3 skeptics, ~2M tokens/repo).
//
// Why it exists: triage's `salvage_worthiness` is OPTIMISTIC — it rated Herday-AI 4/5, then the deep-dive
// killed it 8/8. The scout fixes that by doing the cheapest thing that actually predicts a deep-dive's
// outcome: extract the ONE best capability, map the ONE best product, and run ONE ruthless skeptic against
// the broadened bar (default-to-kill). A scout SURVIVE is the gate to escalate a repo to the full deep-dive.
//
// Cost: ~150-250K tokens/repo (vs ~2M for the deep-dive). Scaffold repos short-circuit BEFORE the costly
// map/judge stages, so a graveyard of stubs is nearly free to clear.
//
// Bar (broadened, LOCKED 2026-06-12): defensible + vertical + real demand + legally liftable; an AI-native
// angle is a STRONG PLUS, not a gate. Agents read source ONLY through the deterministic floor (no clone):
//   cd /Users/the-hive/factory-core && node recycled/recycled-scan.mjs manifest <repo> --json
//   cd /Users/the-hive/factory-core && node recycled/recycled-scan.mjs cat <repo> <path>
export const meta = {
  name: 'recycled-scout',
  description: 'Tier-1 scout: 1 capability + 1 candidate + 1 skeptic per repo → ranked deep-dive escalation list',
  phases: [
    { title: 'Scan', detail: 'manifest + read a few files → builtness + the ONE best capability' },
    { title: 'Map', detail: 'map that capability → the ONE best product candidate', model: 'sonnet' },
    { title: 'Ground-truth', detail: 'live competitive sweep — who already ships this (cures blindness)', model: 'sonnet' },
    { title: 'Judge', detail: 'one ruthless skeptic vs the broadened bar (default-to-kill), ground-truth-fed', model: 'sonnet' },
  ],
};

const FC = '/Users/the-hive/factory-core';

// The 19 dormant/dead targets from Stage 0 (runs/recycled/scan-latest/00-targets.jsonl), embedded as a
// robust fallback because the Workflow `args` binding did not propagate reliably in this environment.
// Pass args.repos to override (e.g. the triage shortlist, or a Tier-2 external license-gated list).
const DEFAULT_REPOS = [
  'Radix-Obsidian/mach', 'Radix-Obsidian/Creative-Agentcy-inc', 'Radix-Obsidian/Dot', 'Radix-Obsidian/Waiesl',
  'Radix-Obsidian/Outcome-AI-Waiesl-', 'Radix-Obsidian/Sheplang', 'Radix-Obsidian/6am-in-the-6', 'Radix-Obsidian/cold-case-crawler',
  'Radix-Obsidian/context-weaver', 'Radix-Obsidian/Herday-AI', 'Radix-Obsidian/Sheplang.', 'Radix-Obsidian/ShepVerify',
  'Radix-Obsidian/ShepScan', 'Radix-Obsidian/ShepLight', 'Radix-Obsidian/ShepGate', 'GoldenSheepAI/demo-repository',
  'GoldenSheepAI/NoLeakAi', 'GoldenSheepAI/Corect-ai', 'GoldenSheepAI/toknxr',
];
let _A = args;
if (typeof _A === 'string') { try { _A = JSON.parse(_A); } catch { _A = null; } }
const REPOS = (_A && Array.isArray(_A.repos) && _A.repos.length) ? _A.repos : DEFAULT_REPOS;
// Tier-1 OWN repos bypass the license gate. For Tier-2 external repos pass args.tier='2' so the skeptic
// applies the license gate (a REJECT license is an automatic salvage_cheaper_than_rebuild FAIL — never lift).
const TIER = (_A && (_A.tier === '2' || _A.tier === 2)) ? '2' : '1';

// ── inline schemas (Workflow DSL runs headless; mirror workflow.js shapes) ──
const SCAN = { type: 'object', required: ['builtness', 'has_real_capability', 'top_signal'], properties: {
  source_files: { type: 'integer' }, primary_language: { type: 'string' },
  builtness: { type: 'integer', minimum: 0, maximum: 5 },
  has_real_capability: { type: 'boolean' },
  capability: { type: 'object', properties: {
    capability_name: { type: 'string' }, description: { type: 'string' },
    lift_files: { type: 'array', items: { type: 'string' } },
    self_containedness: { type: 'integer', minimum: 0, maximum: 5 },
    frankenstein_risk: { type: 'string', enum: ['low', 'med', 'high'] } } },
  top_signal: { type: 'string' } } };

const CAND = { type: 'object', required: ['product', 'ai_native_test', 'zero_to_one_rank', 'scores'], properties: {
  product: { type: 'string' }, lane: { type: 'string', enum: ['consumer', 'SMB', 'AI-native-service'] },
  vertical: { type: 'string' }, icp: { type: 'string' }, wedge: { type: 'string' },
  ai_native_test: { type: 'string', enum: ['PASS', 'FAIL'] },
  zero_to_one_rank: { type: 'string', enum: ['true-zero-to-one', 'incremental', 'me-too'] },
  scores: { type: 'object', required: ['self_containedness', 'dependency_cost_inverted', 'capability_novelty', 'hours_saved_vs_rebuild', 'market_pull'], properties: {
    self_containedness: { type: 'integer' }, dependency_cost_inverted: { type: 'integer' }, capability_novelty: { type: 'integer' },
    hours_saved_vs_rebuild: { type: 'integer' }, market_pull: { type: 'integer' } } } } };

const VERDICT = { type: 'object', required: ['bars', 'verdict', 'confidence'], properties: {
  bars: { type: 'object', required: ['not_frankenstein', 'not_horizontal_sprawl', 'real_demand', 'is_zero_to_one', 'salvage_cheaper_than_rebuild'], properties: {
    not_frankenstein: { type: 'string', enum: ['PASS', 'FAIL'] }, not_horizontal_sprawl: { type: 'string', enum: ['PASS', 'FAIL'] },
    real_demand: { type: 'string', enum: ['PASS', 'FAIL'] }, is_zero_to_one: { type: 'string', enum: ['PASS', 'FAIL'] },
    salvage_cheaper_than_rebuild: { type: 'string', enum: ['PASS', 'FAIL'] } } },
  verdict: { type: 'string', enum: ['SURVIVE', 'KILL'] }, kill_reason: { type: 'string' }, confidence: { type: 'number' } } };

// Ground-truth packet (S1 Market-Intelligence): the live competitive landscape the skeptic judges against.
const GROUNDTRUTH = { type: 'object', required: ['searched_landscape', 'competitors', 'sources', 'checked_at', 'novelty_read', 'demand_read'], properties: {
  searched_landscape: { type: 'boolean' },
  competitors: { type: 'array', items: { type: 'object', required: ['name', 'what_they_ship', 'overlap'], properties: {
    name: { type: 'string' }, what_they_ship: { type: 'string' }, overlap: { type: 'string', enum: ['direct', 'adjacent', 'weak'] } } } },
  demand_evidence: { type: 'array', items: { type: 'string' } },
  sources: { type: 'array', items: { type: 'string' } },
  checked_at: { type: 'string' }, // ISO date the sweep ran
  novelty_read: { type: 'string', enum: ['genuinely-novel', 'differentiated', 'crowded-me-too'] },
  demand_read: { type: 'string', enum: ['evidenced-demand', 'plausible', 'no-evidence'] } } };

// Inline STRUCTURAL mirror of recycled-scan.mjs groundTruthAdmissible (the tested source of truth, R16).
// The sweep just ran so freshness is given; this enforces packet-present + sourced + competitors-or-
// attested-empty. Fail-closed: a blind/uncited packet can NEVER reach a SURVIVE. Staleness AND future-date
// checks are intentionally omitted (no Date in the DSL); the sweep just ran, and the structural checks hold.
function groundTruthOk(p) {
  if (!p || typeof p !== 'object') return { ok: false, reason: 'no ground-truth packet — skeptic would be blind' };
  const competitors = Array.isArray(p.competitors) ? p.competitors.filter(Boolean) : [];
  const sources = Array.isArray(p.sources) ? p.sources.filter(Boolean) : [];
  if (!sources.length) return { ok: false, reason: 'uncited ground-truth (no sources)' };
  if (!competitors.length && p.searched_landscape !== true) return { ok: false, reason: 'empty ground-truth with no attested search' };
  return { ok: true, reason: `${competitors.length} competitor(s), ${sources.length} source(s)` };
}

const CONFIDENCE_FLOOR = 0.6;
// A scout SURVIVE requires the single skeptic to SURVIVE on ALL bars at confidence >= floor. Default-to-kill.
function scoutVerdict(v) {
  if (!v || v.verdict !== 'SURVIVE') return { verdict: 'KILL', reason: v?.kill_reason || 'skeptic returned KILL/abstained' };
  if (typeof v.confidence === 'number' && v.confidence < CONFIDENCE_FLOOR) return { verdict: 'KILL', reason: `confidence ${v.confidence} < ${CONFIDENCE_FLOOR}` };
  for (const bar of ['not_frankenstein', 'not_horizontal_sprawl', 'real_demand', 'is_zero_to_one', 'salvage_cheaper_than_rebuild'])
    if (v?.bars?.[bar] !== 'PASS') return { verdict: 'KILL', reason: `failed bar ${bar}` };
  return { verdict: 'SURVIVE', reason: 'scout skeptic SURVIVE on all bars' };
}

const killed = (repo, prev, reason) => ({ repo, ...prev, candidate: null, scout: { verdict: 'KILL', reason }, score_total: 0 });

const results = (await pipeline(
  REPOS,
  // ── Stage Scan (Haiku): builtness + the ONE best capability ──
  (repo) => agent(
    `SCOUT scan of dormant repo ${repo} (tier ${TIER}). Fast + cheap — find the SINGLE best reusable capability, if any.\n` +
    `  1. cd ${FC} && node recycled/recycled-scan.mjs manifest ${repo} --json\n` +
    `  2. Read 3-6 of the most substantial source files: cd ${FC} && node recycled/recycled-scan.mjs cat ${repo} <path>\n` +
    `Judge from REAL code ONLY (never TODOs, stubs, placeholders, or README promises):\n` +
    `  - builtness 0-5: genuinely IMPLEMENTED vs scaffold/boilerplate (0 = empty starter, 5 = real working system).\n` +
    `  - has_real_capability: is there ONE non-trivial reusable capability actually built (an engine/pipeline/integration/algorithm)? Boilerplate (auth/CRUD/CDK scaffold) does NOT count. CRITICAL: if a "capability" is faked (e.g. confidence = a random number, regex masquerading as detection), set has_real_capability=false.\n` +
    `  - capability: if has_real_capability, the ONE best one (capability_name, description, lift_files[], self_containedness 0-5, frankenstein_risk). Omit if none.\n` +
    `  - top_signal: ONE line naming the most promising thing, or "scaffold only — nothing to salvage".\n` +
    `Default to has_real_capability=false on doubt.`,
    { agentType: 'code-explorer', model: 'haiku', phase: 'Scan', label: `scan:${repo}`, schema: SCAN })
    .then(s => ({ repo, ...s })),
  // ── Stage Map (Sonnet): the ONE best product candidate — skipped for scaffold repos ──
  (scan, repo) => {
    if (!scan) return killed(repo, {}, 'scan failed');
    if (!scan.has_real_capability || (scan.builtness ?? 0) < 2 || !scan.capability) return killed(repo, scan, scan.top_signal || 'no real capability (scaffold only)');
    return agent(
      `Map this proven capability from ${repo} to its SINGLE best product candidate.\n` +
      `Capability: ${JSON.stringify(scan.capability)}\n` +
      `BAR (broadened): a winner is defensible + vertical + has real demand + legally liftable. An AI-native angle is a STRONG PLUS, NOT required — a great non-AI vertical tool can win.\n` +
      `Pick the ONE best vertical product (not a horizontal tool). Record: product, lane, vertical, icp, wedge; ai_native_test (remove the AI — collapse=PASS; INFORMATIONAL plus, not a gate); zero_to_one_rank; and the 5-axis rubric 0-5 ` +
      `(self_containedness, dependency_cost_inverted, capability_novelty, hours_saved_vs_rebuild [the silent killer — be ruthless], market_pull [real evidenced demand — be honest]).`,
      { agentType: 'code-architect', model: 'sonnet', phase: 'Map', label: `map:${repo}`, schema: CAND })
      .then(c => ({ repo, ...scan, candidate: c, score_total: Object.values(c.scores || {}).reduce((a, b) => a + (Number(b) || 0), 0) }));
  },
  // ── Stage Ground-truth (Sonnet + web): live competitive sweep — skipped for already-killed repos ──
  (mapped, repo) => {
    if (!mapped) return killed(repo, {}, 'map failed');
    if (mapped.scout) return mapped; // already killed at scan/map
    return agent(
      `GROUND-TRUTH sweep for a salvage candidate from ${repo}. Establish the LIVE 2026 competitive landscape so the next skeptic judges novelty + demand against REALITY, not the candidate's self-claims. (This line once false-SURVIVEd commodity for lack of exactly this step.)\n` +
      `Candidate: ${JSON.stringify(mapped.candidate)}\n` +
      `FIRST load web tools: ToolSearch with query "select:WebSearch,WebFetch". Then search hard for who ALREADY ships this product/capability in this vertical (named companies + OSS projects, with their CURRENT behavior), and for real evidence of demand.\n` +
      `Return: competitors[] (name, what_they_ship, overlap=direct|adjacent|weak), demand_evidence[], sources[] (REAL urls you actually consulted), searched_landscape=true, checked_at=today's date in ISO, novelty_read, demand_read.\n` +
      `If after a genuine search the field is truly empty, return competitors:[] with searched_landscape:true and explain in demand_read — but NEVER fabricate a competitor and NEVER return an unsourced packet.`,
      { model: 'sonnet', phase: 'Ground-truth', label: `ground:${repo}`, schema: GROUNDTRUTH })
      .then(gt => ({ repo, ...mapped, ground_truth: gt }))
      .catch(() => ({ repo, ...mapped, ground_truth: null })); // sweep threw → null packet → gate KILLs (fail-closed)
  },
  // ── Stage Judge (Sonnet): ground-truth gate, then ONE ruthless skeptic — skipped for already-killed repos ──
  (graded, repo) => {
    if (!graded) return killed(repo, {}, 'ground-truth failed');
    if (graded.scout) return graded; // already killed at scan/map
    const gt = groundTruthOk(graded.ground_truth);
    if (!gt.ok) return { repo, ...graded, candidate: null, skeptic: null, scout: { verdict: 'KILL', reason: `ground-truth gate: ${gt.reason}` }, score_total: 0 };
    const licenseNote = TIER === '2'
      ? `${repo} is a Tier-2 EXTERNAL repo: apply the license gate. If its license is not permissive (MIT/Apache-2.0/BSD/ISC/Unlicense/CC0/0BSD), salvage_cheaper_than_rebuild is an automatic FAIL — we cannot legally lift it. Confirm via: cd ${FC} && node recycled/recycled-scan.mjs cat ${repo} LICENSE`
      : `${repo} is an OWN (Tier-1) repo — we own the code, so LICENSE is NEVER a kill reason here.`;
    return agent(
      `You are a RUTHLESS scout skeptic. Try to REFUTE this single salvage candidate. Default to FAIL on doubt — a scout SURVIVE escalates this repo to a ~2M-token deep-dive, so be stingy.\n` +
      `Candidate: ${JSON.stringify(graded.candidate)}\nCapability: ${JSON.stringify(graded.capability)}\nSource repo: ${repo}.\n` +
      `LIVE GROUND-TRUTH (judge is_zero_to_one and real_demand against THIS, never the candidate's self-claims — if a competitor already ships it, is_zero_to_one FAILs): ${JSON.stringify(graded.ground_truth)}\n` +
      `Verify against REAL code: cd ${FC} && node recycled/recycled-scan.mjs cat ${repo} <path>. If the candidate rests on files/features that don't actually exist, that is an automatic not_frankenstein FAIL.\n` +
      `${licenseNote}\n` +
      `BAR (broadened): defensible + vertical + real demand + legally liftable. An AI-native angle is a STRONG PLUS, NOT a gate — do NOT kill merely for being non-AI.\n` +
      `Judge all 5 bars (PASS only if it clearly clears):\n` +
      `- not_frankenstein: a clean capability lift, NOT a forced re-stitch of the dead product?\n` +
      `- not_horizontal_sprawl: a focused vertical, NOT a generic horizontal tool?\n` +
      `- real_demand: real, evidenced market pull (use the ground-truth demand_evidence) with a specific ICP who'd pay, NOT a solution in search of a problem?\n` +
      `- is_zero_to_one: genuinely new / defensibly differentiated vs the ground-truth competitors, NOT a crowded me-too?\n` +
      `- salvage_cheaper_than_rebuild: would salvaging actually beat rebuilding clean? (the most common silent kill)\n` +
      `verdict = SURVIVE only if ALL bars PASS. Give kill_reason if KILL, and confidence 0-1.`,
      { agentType: 'code-reviewer', model: 'sonnet', phase: 'Judge', label: `judge:${repo}`, schema: VERDICT })
      .then(v => ({ repo, ...graded, skeptic: v, scout: scoutVerdict(v) }));
  },
)).filter(Boolean);

results.sort((a, b) => {
  const av = a.scout?.verdict === 'SURVIVE' ? 1 : 0, bv = b.scout?.verdict === 'SURVIVE' ? 1 : 0;
  return bv - av || (b.score_total || 0) - (a.score_total || 0) || (b.builtness || 0) - (a.builtness || 0);
});
const survivors = results.filter(r => r.scout?.verdict === 'SURVIVE');
const escalate = survivors.map(r => r.repo); // → feed these to workflow.js (Tier-2 deep-dive)

log(`scout: ${results.length} scanned → ${survivors.length} SURVIVE → escalate to deep-dive: ${escalate.join(', ') || '(none)'}`);
return { tier: TIER, scanned: results.length, survivors: survivors.length, escalate, results };
