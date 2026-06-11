#!/usr/bin/env node
// recycled-scan.mjs — Recycled's deterministic floor (Stage 0 + pure guardrail functions).
// NO LLM. This is the trustworthy layer the harness stands on: the license gate, the kill-pass
// rollup, the frozen-archive note, the source-path filter, and the JSONL writers. Everything here
// is a pure function or a metadata-only `gh`/`git` read — never deletes, never charges, never builds.
// Stages 1–4 (LLM fan-out) live in the Workflow script; they consume the contracts in schemas/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ── Repo-age classification (Stage 0 repo bucket; module-level status is the Stage-1 agent's job) ──
const MONTH_MS = 30 * 24 * 3600e3;
export const DORMANT_MONTHS = 4;   // < 4mo = LIVE
export const DEAD_MONTHS = 9;      // > 9mo = DEAD; in-between = DORMANT
export function classifyRepoAge(pushedAt, now = Date.now()) {
  const ts = Date.parse(pushedAt);
  if (!Number.isFinite(ts)) return 'UNKNOWN';
  const months = (now - ts) / MONTH_MS;
  if (months < DORMANT_MONTHS) return 'LIVE';
  if (months > DEAD_MONTHS) return 'DEAD';
  return 'DORMANT';
}

// ── Source-path filter (R2): real source only, never build artifacts / deps ──
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|rb|swift|sql|vue|svelte|php|c|cc|cpp|h|hpp|scala|ex|exs)$/i;
const EXCLUDE_DIR = /(^|\/)(node_modules|dist|build|\.next|out|vendor|coverage|\.git|\.turbo|\.cache|target|__pycache__)\//i;
export function isSourcePath(p) {
  if (typeof p !== 'string' || !p) return false;
  if (EXCLUDE_DIR.test(p)) return false;
  return SOURCE_EXT.test(p);
}
export function filterSourcePaths(paths) { return (paths || []).filter(isSourcePath); }

// ── License gate (R1): fail-closed. Tier-1 (own) bypasses; Tier-2 must clear before Stage 1. ──
const LIFT_OK = new Set(['MIT', 'APACHE-2.0', 'BSD-2-CLAUSE', 'BSD-3-CLAUSE', 'ISC', 'UNLICENSE', 'CC0-1.0', '0BSD', 'BSD-3-CLAUSE-CLEAR', 'ZLIB']);
const IDEA_ONLY = new Set(['MPL-2.0']); // file-level / weak copyleft — read for approach, reimplement clean
// Decision: LIFT-OK = lift code into a SKU (preserve NOTICE for Apache/BSD). IDEA-ONLY = no lift,
// reimplement clean. REJECT = not even idea-reference into a commercial SKU. Unknown/absent → REJECT.
export function licenseGate(spdx, tier) {
  if (tier === 1) return 'OWN';            // you own it regardless of declared license
  const id = String(spdx ?? '').trim().toUpperCase();
  if (!id || id === 'NOASSERTION' || id === 'NULL') return 'REJECT'; // absence of license = all rights reserved
  if (LIFT_OK.has(id)) return 'LIFT-OK';
  if (IDEA_ONLY.has(id) || id.startsWith('LGPL')) return 'IDEA-ONLY';
  if (id.startsWith('GPL') || id.startsWith('AGPL') || id.startsWith('SSPL') ||
      id.startsWith('BUSL') || id.startsWith('BSL') || id.includes('COMMONS-CLAUSE')) return 'REJECT';
  return 'REJECT'; // fail-closed on anything unrecognized
}

// ── Kill-pass rollup (R4): SURVIVE iff EVERY skeptic SURVIVEs on ALL bars with confidence >= floor.
// Any KILL, any failed bar, any abstain (missing skeptic), or any low-confidence SURVIVE → KILL. ──
export const CONFIDENCE_FLOOR = 0.6;
const BARS = ['not_frankenstein', 'not_horizontal_sprawl', 'ai_native_not_feature', 'is_zero_to_one', 'salvage_cheaper_than_rebuild'];
export function rollupVerdict(verdicts, minSkeptics = 3) {
  const list = Array.isArray(verdicts) ? verdicts.filter(Boolean) : [];
  if (list.length < minSkeptics) return { verdict: 'KILL', reason: `abstain: ${list.length}/${minSkeptics} skeptics returned` };
  for (const v of list) {
    if (v.verdict !== 'SURVIVE') return { verdict: 'KILL', reason: v.kill_reason || `skeptic ${v.skeptic} returned ${v.verdict}` };
    if (typeof v.confidence === 'number' && v.confidence < CONFIDENCE_FLOOR) return { verdict: 'KILL', reason: `skeptic ${v.skeptic} confidence ${v.confidence} < ${CONFIDENCE_FLOOR}` };
    for (const bar of BARS) if (v?.bars?.[bar] !== 'PASS') return { verdict: 'KILL', reason: `skeptic ${v.skeptic} failed bar ${bar}` };
  }
  return { verdict: 'SURVIVE', reason: `unanimous: ${list.length} skeptics, all bars PASS` };
}

// ── Frozen-archive note (R7): advisory ONLY. Never deletes, never archives. ──
export function frozenArchiveNote(repo, reason, { runId = 'manual', label = 'archived:recycled-frozen' } = {}) {
  return {
    repo,
    verdict: 'TRULY-DEAD',
    reason,
    archive_action: 'label-only',
    recommended_label: label,
    note: `Frozen by Recycled run ${runId}. No salvageable capability. Do not resurrect.`,
    reversible: true,
  };
}

// ── JSONL I/O ──
export function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
export function writeJsonl(file, records) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, (records || []).map(r => JSON.stringify(r)).join('\n') + (records?.length ? '\n' : ''));
  return file;
}
export function appendJsonl(file, record) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, JSON.stringify(record) + '\n');
  return file;
}
export function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}
export function runDir(runId) {
  const dir = path.join(HERE, '..', 'runs', 'recycled', runId);
  ensureDir(dir);
  return dir;
}

// ── Stage 0: enumerate own repos (Tier 1), classify by age, gate. Metadata only, no clone. ──
function ghJson(args) {
  try { return JSON.parse(execSync(`gh ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); }
  catch { return null; }
}
export function enumerateOwnRepos({ owners = [], limit = 100, now = Date.now() } = {}) {
  const fields = 'name,owner,pushedAt,diskUsage,primaryLanguage,licenseInfo,isArchived,isFork';
  const scopes = ['', ...owners]; // '' = the authed user's repos
  const out = [];
  for (const scope of scopes) {
    const rows = ghJson(`repo list ${scope} --limit ${limit} --json ${fields}`);
    if (!rows) continue;
    for (const r of rows) {
      const repo = `${r.owner?.login || r.owner?.name || ''}/${r.name}`;
      out.push({
        repo,
        tier: 1,
        repo_age: classifyRepoAge(r.pushedAt, now),
        last_push: r.pushedAt,
        primary_language: r.primaryLanguage?.name || null,
        disk_kb: r.diskUsage ?? null,
        is_archived: !!r.isArchived,
        is_fork: !!r.isFork,
        license: licenseGate(r.licenseInfo?.spdxId, 1), // OWN
      });
    }
  }
  return out;
}

// ── CLI: Stage 0 scan → 00-targets.jsonl (dormant + dead, non-fork). ──
function main() {
  const json = process.argv.includes('--json');
  const owners = (process.env.RECYCLED_ORGS || 'GoldenSheepAI').split(',').map(s => s.trim()).filter(Boolean);
  const all = enumerateOwnRepos({ owners });
  const targets = all.filter(r => !r.is_fork && (r.repo_age === 'DORMANT' || r.repo_age === 'DEAD'));
  if (!all.length) { console.error('✗ no repos enumerated (is `gh` authed?)'); process.exit(1); }
  const runId = process.env.RECYCLED_RUN_ID || 'scan-latest';
  const file = path.join(runDir(runId), '00-targets.jsonl');
  writeJsonl(file, targets);
  if (json) { console.log(JSON.stringify({ total: all.length, targets: targets.length, file, targets_list: targets }, null, 2)); return; }
  console.log(`Recycled Stage 0 — ${all.length} repos, ${targets.length} dormant/dead targets`);
  for (const t of targets) console.log(`  ${t.repo_age.padEnd(8)} ${t.repo} (${t.primary_language || '?'}, pushed ${String(t.last_push).slice(0, 10)})`);
  console.log(`→ ${file}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
