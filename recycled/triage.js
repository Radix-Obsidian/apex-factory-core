// recycled/triage.js — Slice 2 pre-triage: a CHEAP Haiku pass over the whole dormant corpus that
// scores each repo's salvage-worthiness, so the expensive deep-dive (workflow.js) only runs on repos
// that actually contain real built capability. This is the fix for Slice 1's lesson: Herday-AI burned
// 1.4M tokens to conclude "it's mostly stubs" — a ~10K-token triage would have flagged that for skip.
//
// Pass the repo list via args.repos (read from runs/recycled/<run>/00-targets.jsonl). Agents read
// source ONLY through the deterministic floor (no clone):
//   cd /Users/the-hive/factory-core && node recycled/recycled-scan.mjs manifest <repo> --json
//   cd /Users/the-hive/factory-core && node recycled/recycled-scan.mjs cat <repo> <path>
export const meta = {
  name: 'recycled-triage',
  description: 'Cheap Haiku salvage-worthiness triage across the dormant corpus → ranked deep-dive shortlist',
  phases: [{ title: 'Triage', detail: 'one cheap pass per repo: real capability or scaffold?' }],
};

const FC = '/Users/the-hive/factory-core';
// The 19 dormant/dead targets from Stage 0 (runs/recycled/scan-latest/00-targets.jsonl), embedded as a
// robust fallback because the Workflow `args` binding did not propagate reliably in this environment.
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

const TRIAGE = { type: 'object', required: ['repo', 'builtness', 'salvage_worthiness', 'has_real_capability', 'top_signal', 'recommend_deep_dive'], properties: {
  repo: { type: 'string' },
  source_files: { type: 'integer' },
  primary_language: { type: 'string' },
  builtness: { type: 'integer', minimum: 0, maximum: 5 },          // real implemented code vs stubs/scaffold
  salvage_worthiness: { type: 'integer', minimum: 0, maximum: 5 }, // likelihood of a genuinely reusable capability
  has_real_capability: { type: 'boolean' },
  top_signal: { type: 'string' },                                  // one line: the most promising thing, or "scaffold only"
  recommend_deep_dive: { type: 'boolean' },
  reason: { type: 'string' } } };

phase('Triage');
const triage = (await parallel(REPOS.map(repo => () => agent(
  `Quickly triage the dormant repo ${repo} for SALVAGE-WORTHINESS. Be fast and cheap — this is a pre-filter, not a deep analysis.\n` +
  `Steps:\n` +
  `  1. cd ${FC} && node recycled/recycled-scan.mjs manifest ${repo} --json   (get the source file list)\n` +
  `  2. Read 3-6 of the most substantial-looking source files via: cd ${FC} && node recycled/recycled-scan.mjs cat ${repo} <path>\n` +
  `Judge, from REAL code only (NEVER from TODO comments, stubs, placeholder files, or README promises):\n` +
  `  - builtness 0-5: how much is genuinely IMPLEMENTED vs scaffold/boilerplate/stubs (0 = empty starter, 5 = a real working system).\n` +
  `  - has_real_capability: is there a non-trivial, reusable capability actually built here (an engine, pipeline, integration, algorithm)? Boilerplate (auth/CRUD/CDK scaffolds) does NOT count.\n` +
  `  - salvage_worthiness 0-5: combined likelihood this repo yields a real build-ready opportunity worth a deep dive.\n` +
  `  - top_signal: ONE line naming the single most promising thing (or "scaffold only — nothing to salvage").\n` +
  `  - recommend_deep_dive: true only if salvage_worthiness >= 3 AND has_real_capability.\n` +
  `Return a TRIAGE record. Default to recommend_deep_dive=false on doubt.`,
  { agentType: 'code-explorer', model: 'haiku', label: `triage:${repo}`, schema: TRIAGE })
    .then(r => ({ ...r, repo })))
)).filter(Boolean);

triage.sort((a, b) => (b.salvage_worthiness || 0) - (a.salvage_worthiness || 0) || (b.builtness || 0) - (a.builtness || 0));
const shortlist = triage.filter(t => t.recommend_deep_dive).map(t => t.repo);

return { triage, shortlist, scanned: triage.length };
