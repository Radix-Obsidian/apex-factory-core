// recycled/workflow.js — Recycled Phase A, the 5-stage salvage pipeline as a Workflow-tool script.
// Deep-dives one OR MORE dormant repos (sequentially) and returns an ARRAY of per-repo results. The
// script ONLY orchestrates agents — it cannot touch the filesystem. The orchestrating agent pipes each
// result into `node recycled/recycled-scan.mjs persist <run-id>` (deterministic Stage 5) which writes
// artifacts, verifies extract paths, and computes the honest greenlight.
//
// Agents read source ONLY through the deterministic floor (no clone):
//   cd /Users/the-hive/factory-core && node recycled/recycled-scan.mjs manifest <repo> --json
//   cd /Users/the-hive/factory-core && node recycled/recycled-scan.mjs cat <repo> <path>
export const meta = {
  name: 'recycled-deepdive',
  description: 'Recycled Phase A: drive dormant repo(s) through all 5 salvage stages → ranked build-specs or honest kills',
  phases: [
    { title: 'Inventory', detail: 'classify each system; salvage the well-built ones' },
    { title: 'Extract', detail: 'name the reusable capability per system' },
    { title: 'Map', detail: 'map capability → candidate products' },
    { title: 'Kill', detail: '3 adversarial skeptics per candidate, default-to-kill' },
    { title: 'Synth', detail: 'survivors → build-spec' },
  ],
};

const FC = '/Users/the-hive/factory-core';
// Repos to deep-dive this run. Workflow `args` did not propagate reliably here, so the fallback list
// IS the active target set — edit it to re-point. (Parse args defensively in case it works.)
let _A = args;
if (typeof _A === 'string') { try { _A = JSON.parse(_A); } catch { _A = null; } }
const REPOS = (_A && Array.isArray(_A.repos) && _A.repos.length) ? _A.repos
  : (_A && _A.repo) ? [_A.repo]
  : ['GoldenSheepAI/NoLeakAi', 'GoldenSheepAI/toknxr', 'Radix-Obsidian/ShepLight'];
const MAX_SYSTEMS = (_A && _A.maxSystems) || 5;
const MAX_CANDS_PER_CAP = (_A && _A.maxCandidates) || 2;

// ── inline output contracts (the sandbox can't read schemas/*.json) ──
const INVENTORY = { type: 'object', required: ['records'], properties: { records: { type: 'array', items: {
  type: 'object', required: ['system', 'status', 'has_real_capability', 'ai_native', 'what_it_does'], properties: {
    system: { type: 'string' }, status: { type: 'string', enum: ['LIVE', 'DORMANT', 'DEAD-LEGACY', 'TRULY-DEAD'] },
    has_real_capability: { type: 'boolean' },
    ai_native: { type: 'string', enum: ['CRITICAL', 'MEDIUM', 'LOW', 'NONE'] },
    file_count: { type: 'integer' }, primary_language: { type: 'string' }, entrypoints: { type: 'array', items: { type: 'string' } },
    deps_external: { type: 'array', items: { type: 'string' } }, what_it_does: { type: 'string' }, ai_native_signal: { type: 'string' },
    evidence: { type: 'array', items: { type: 'string' } } } } } } };
const CAPABILITY = { type: 'object', required: ['capability_id', 'capability_name', 'description', 'self_containedness', 'frankenstein_risk'], properties: {
  capability_id: { type: 'string' }, capability_name: { type: 'string' }, description: { type: 'string' }, stripped_of: { type: 'string' },
  lift_files: { type: 'array', items: { type: 'string' } }, lift_functions: { type: 'array', items: { type: 'string' } },
  hard_deps: { type: 'array', items: { type: 'string' } }, soft_deps_removable: { type: 'array', items: { type: 'string' } },
  self_containedness: { type: 'integer', minimum: 0, maximum: 5 }, extraction_notes: { type: 'string' },
  frankenstein_risk: { type: 'string', enum: ['low', 'med', 'high'] } } };
const OPPORTUNITIES = { type: 'object', required: ['candidates'], properties: { candidates: { type: 'array', items: {
  type: 'object', required: ['candidate_id', 'lane', 'product', 'ai_native_test', 'zero_to_one_rank', 'scores'], properties: {
    candidate_id: { type: 'string' }, lane: { type: 'string', enum: ['consumer', 'SMB', 'AI-native-service'] }, product: { type: 'string' },
    vertical: { type: 'string' }, icp: { type: 'string' }, wedge: { type: 'string' },
    ai_native_test: { type: 'string', enum: ['PASS', 'FAIL'] }, zero_to_one_rank: { type: 'string', enum: ['true-zero-to-one', 'incremental', 'me-too'] },
    scores: { type: 'object', required: ['self_containedness', 'dependency_cost_inverted', 'capability_novelty', 'hours_saved_vs_rebuild', 'market_pull'], properties: {
      self_containedness: { type: 'integer' }, dependency_cost_inverted: { type: 'integer' }, capability_novelty: { type: 'integer' },
      hours_saved_vs_rebuild: { type: 'integer' }, market_pull: { type: 'integer' } } } } } } } };
const VERDICT = { type: 'object', required: ['bars', 'verdict', 'confidence'], properties: {
  bars: { type: 'object', required: ['not_frankenstein', 'not_horizontal_sprawl', 'real_demand', 'is_zero_to_one', 'salvage_cheaper_than_rebuild'], properties: {
    not_frankenstein: { type: 'string', enum: ['PASS', 'FAIL'] }, not_horizontal_sprawl: { type: 'string', enum: ['PASS', 'FAIL'] },
    real_demand: { type: 'string', enum: ['PASS', 'FAIL'] }, is_zero_to_one: { type: 'string', enum: ['PASS', 'FAIL'] },
    salvage_cheaper_than_rebuild: { type: 'string', enum: ['PASS', 'FAIL'] } } },
  verdict: { type: 'string', enum: ['SURVIVE', 'KILL'] }, kill_reason: { type: 'string' }, confidence: { type: 'number' } } };
const BUILDSPEC = { type: 'object', required: ['product', 'extract_list', 'wrap_plan', 'ai_native_test'], properties: {
  product: { type: 'string' }, icp: { type: 'string' }, wedge: { type: 'string' },
  extract_list: { type: 'array', items: { type: 'object', required: ['from', 'symbols', 'status'], properties: {
    from: { type: 'string' }, symbols: { type: 'array', items: { type: 'string' } },
    status: { type: 'string', enum: ['lift-as-is', 'lift-with-refactor'] }, refactor: { type: 'string' } } } },
  wrap_plan: { type: 'string' }, rough_dev_effort: { type: 'string' }, ai_native_test: { type: 'string', enum: ['PASS', 'FAIL'] } } };

// ── inline kill-pass rollup, mirroring recycled-scan.mjs rollupVerdict (default-to-kill) ──
const BARS = ['not_frankenstein', 'not_horizontal_sprawl', 'real_demand', 'is_zero_to_one', 'salvage_cheaper_than_rebuild'];
function rollup(list, min = 3) {
  const l = (list || []).filter(Boolean);
  if (l.length < min) return { verdict: 'KILL', reason: `abstain: ${l.length}/${min} skeptics` };
  for (const v of l) {
    if (v.verdict !== 'SURVIVE') return { verdict: 'KILL', reason: v.kill_reason || `skeptic ${v.skeptic} ${v.verdict}` };
    if (typeof v.confidence === 'number' && v.confidence < 0.6) return { verdict: 'KILL', reason: `skeptic ${v.skeptic} low confidence ${v.confidence}` };
    for (const b of BARS) if (v?.bars?.[b] !== 'PASS') return { verdict: 'KILL', reason: `skeptic ${v.skeptic} failed ${b}` };
  }
  return { verdict: 'SURVIVE', reason: `unanimous ${l.length} skeptics` };
}

function readInstr(REPO) {
  return `Read source ONLY via (no clone):\n  cd ${FC} && node recycled/recycled-scan.mjs manifest ${REPO} --json   # file list\n  cd ${FC} && node recycled/recycled-scan.mjs cat ${REPO} <path>          # one file\nPrefer .ts/.tsx/.py source; ignore compiled .d.ts/.js duplicates.`;
}
const AI_RANK = { CRITICAL: 3, MEDIUM: 2, LOW: 1, NONE: 0 };

// ── the 5-stage salvage pipeline for ONE repo ──
async function salvage(REPO) {
  const RN = REPO.split('/')[1] || REPO;
  const READ = readInstr(REPO);

  // Stage 1: inventory + classify
  const inv = await agent(
    `Inventory the DORMANT repo ${REPO} for salvageable capability (read-only).\n${READ}\n` +
    `The WHOLE repo is dormant (not running anywhere) — so a well-built system here is a PRIME salvage target, not something to skip.\n` +
    `Identify the top-level systems/modules. For each give:\n` +
    `  - status: LIVE = fully implemented working capability (the BEST salvage targets); DORMANT = partially built; DEAD-LEGACY = from an old pivot; TRULY-DEAD = stub/placeholder/empty (nothing real).\n` +
    `  - has_real_capability: true ONLY if there is real implemented reusable code (an engine/pipeline/integration/algorithm) — NOT stubs, TODOs, or generic boilerplate (auth/CRUD/IaC scaffolds = false).\n` +
    `  - ai_native: CRITICAL/MEDIUM/LOW/NONE — how much the system collapses without the LLM.\n` +
    `  - what it does, entrypoints, external deps, file_count, ai_native_signal (why), and file:line evidence.\n` +
    `Return {records:[...]}.`,
    { agentType: 'code-explorer', model: 'haiku', phase: 'Inventory', label: `inventory:${RN}`, schema: INVENTORY });

  const targets = (inv.records || [])
    .filter(r => r.has_real_capability && r.status !== 'TRULY-DEAD')
    .sort((a, b) => (AI_RANK[b.ai_native] || 0) - (AI_RANK[a.ai_native] || 0))
    .slice(0, MAX_SYSTEMS);
  if (!targets.length) {
    return { repo: REPO, inventory: inv.records || [], capabilities: [], candidates: [], judged: [], buildspecs: [],
      frozen: [{ repo: REPO, reason: 'no systems with real salvageable capability surfaced in inventory' }] };
  }

  // Stage 2: capability extraction
  const capabilities = (await parallel(targets.map(sys => () => agent(
    `Extract the reusable CAPABILITY embodied by system "${sys.system}" in ${REPO}, STRIPPED of the dead product shell.\n${READ}\n` +
    `System summary: ${JSON.stringify(sys)}.\n` +
    `CRITICAL — evidence rule: only claim a capability backed by REAL implemented code you have actually read. ` +
    `NEVER infer capability from TODO comments, stubs, placeholder files, README promises, or planned features. ` +
    `If the system is mostly stubs/scaffold, say so plainly: set self_containedness 0-1, frankenstein_risk "high", and put "scaffold only — no real implementation" in extraction_notes.\n` +
    `Give a stable capability_id (slug), the exact lift_files + lift_functions, hard_deps vs soft_deps_removable, ` +
    `a self_containedness score 0-5, and frankenstein_risk (high = only works re-stitched to the dead product). Return a CapabilityRecord.`,
    { agentType: 'refactor-cleaner', model: 'sonnet', phase: 'Extract', label: `extract:${RN}:${sys.system}`, schema: CAPABILITY })
  ))).filter(Boolean).map((c, i) => ({ ...c, source_repo: REPO, source_system: targets[i]?.system, capability_id: `${RN}-${c.capability_id || 'cap-' + (i + 1)}` }));
  if (!capabilities.length) {
    return { repo: REPO, inventory: inv.records, capabilities: [], candidates: [], judged: [], buildspecs: [],
      frozen: [{ repo: REPO, reason: 'no capability cleanly extractable' }] };
  }

  // Stage 3: opportunity mapping
  const mapped = (await parallel(capabilities.map(cap => () => agent(
    `Map this proven capability to candidate PRODUCTS across consumer / SMB / AI-native-service lanes.\n` +
    `Capability: ${JSON.stringify(cap)}.\n` +
    `BAR (broadened): a winner is defensible + vertical + has real demand + is legally liftable. An AI-native angle is a STRONG PLUS, NOT a requirement — a great non-AI vertical tool can still win.\n` +
    `For each candidate record: ai_native_test (remove the AI — does it collapse? collapse = PASS; this is INFORMATIONAL/a scored plus, not a gate), ` +
    `zero_to_one_rank, and the 5-axis rubric 0-5 (self_containedness, dependency_cost_inverted, capability_novelty, ` +
    `hours_saved_vs_rebuild [the silent killer — be ruthless], market_pull [real, evidenced demand — be honest]). Give vertical, icp, wedge. ` +
    `Return {candidates:[...]} — up to ${MAX_CANDS_PER_CAP} best, vertical not horizontal.`,
    { agentType: 'code-architect', model: 'sonnet', phase: 'Map', label: `map:${RN}:${cap.capability_id}`, schema: OPPORTUNITIES })
      .then(r => ({ cap, candidates: (r.candidates || []).slice(0, MAX_CANDS_PER_CAP) })))
  )).filter(Boolean);

  const candidates = mapped.flatMap(m => m.candidates.map((c, i) => ({
    ...c, capability_id: m.cap.capability_id,
    candidate_id: `${m.cap.capability_id}-opp${i + 1}`,
    score_total: Object.values(c.scores || {}).reduce((a, b) => a + (Number(b) || 0), 0),
  })));
  if (!candidates.length) {
    return { repo: REPO, inventory: inv.records, capabilities, candidates: [], judged: [], buildspecs: [],
      frozen: [{ repo: REPO, reason: 'capabilities extracted but no viable product mapping' }] };
  }

  // Stage 4: adversarial kill-pass (3 skeptics per candidate, default-to-kill)
  const judged = (await parallel(candidates.map(cand => () =>
    parallel([1, 2, 3].map(n => () => agent(
      `You are a RUTHLESS skeptic. Try to REFUTE this salvage candidate. Default to FAIL on doubt.\n` +
      `Candidate: ${JSON.stringify(cand)}\nSource repo: ${REPO}. You may verify code via:\n  cd ${FC} && node recycled/recycled-scan.mjs cat ${REPO} <path>\n` +
      `NOTE: ${REPO} is an OWN (Tier-1) repo — we own the code, so LICENSE is NEVER a kill reason here; do not apply any license gate.\n` +
      `THE BAR (broadened): a winner is defensible + vertical + has real demand + legally liftable. An AI-native angle is a STRONG PLUS, NOT a gate — do NOT kill a candidate merely for being non-AI. A great non-AI vertical tool can SURVIVE.\n` +
      `Verify claims against REAL code: if the candidate rests on features/files that don't actually exist in the repo, that is an automatic not_frankenstein FAIL.\n` +
      `Judge all 5 bars (PASS only if it clearly clears):\n` +
      `- not_frankenstein: a clean capability lift, NOT a forced re-stitch of the dead product?\n` +
      `- not_horizontal_sprawl: a focused vertical, NOT a generic horizontal tool?\n` +
      `- real_demand: is there real, evidenced market pull for this — a specific ICP who'd pay — NOT a solution in search of a problem?\n` +
      `- is_zero_to_one: genuinely new / defensibly differentiated, NOT a crowded me-too?\n` +
      `- salvage_cheaper_than_rebuild: would salvaging actually beat rebuilding clean? (the most common silent kill)\n` +
      `verdict = SURVIVE only if ALL bars PASS. Give kill_reason if KILL, and a confidence 0-1.`,
      { agentType: 'code-reviewer', model: 'sonnet', phase: 'Kill', label: `skeptic${n}:${RN}:${cand.candidate_id}`, schema: VERDICT })
        .then(v => ({ ...v, skeptic: n, candidate_id: cand.candidate_id }))
    )).then(vs => { const verdicts = vs.filter(Boolean); return { candidate_id: cand.candidate_id, verdicts, rollup: rollup(verdicts) }; })
  ))).filter(Boolean);

  const survivors = candidates
    .filter(c => judged.find(j => j.candidate_id === c.candidate_id)?.rollup.verdict === 'SURVIVE')
    .sort((a, b) => (b.score_total || 0) - (a.score_total || 0));

  // Stage 5: survivors → build-spec
  let buildspecs = [];
  if (survivors.length) {
    const synthed = await parallel(survivors.map((cand, i) => () => {
      const cap = capabilities.find(c => c.capability_id === cand.capability_id);
      return agent(
        `Produce a build-ready BuildSpec for this greenlit salvage candidate (rank ${i + 1}).\n` +
        `Candidate: ${JSON.stringify(cand)}\nCapability (lift source): ${JSON.stringify(cap)}\n` +
        `extract_list MUST use REAL repo-relative paths from the capability's lift_files (no repo prefix, no leading slash; verify via: cd ${FC} && node recycled/recycled-scan.mjs cat ${REPO} <path>). ` +
        `wrap_plan = the thin NEW layer to add around the lifted core. Give icp, wedge, rough_dev_effort. Return a BuildSpec.`,
        { agentType: 'code-architect', model: 'sonnet', phase: 'Synth', label: `spec:${RN}:${cand.candidate_id}`, schema: BUILDSPEC })
        .then(s => ({ ...s, spec_id: `spec-${RN}-${i + 1}`, candidate_id: cand.candidate_id, source_repo: REPO, rank: i + 1, parts_bin_refs: [] }));
    }));
    buildspecs = synthed.filter(Boolean);
  }

  const frozen = survivors.length ? [] : [{ repo: REPO, reason: 'all candidates killed in the adversarial pass; no build-ready zero-to-one this run' }];
  return { repo: REPO, inventory: inv.records, capabilities, candidates, judged, buildspecs, frozen };
}

// ── run each repo sequentially (bounds concurrency + keeps the log readable) ──
const results = [];
for (const r of REPOS) {
  log(`Recycled deep-dive → ${r}`);
  results.push(await salvage(r));
}
return results;
