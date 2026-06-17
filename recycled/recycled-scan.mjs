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
const BARS = ['not_frankenstein', 'not_horizontal_sprawl', 'real_demand', 'is_zero_to_one', 'salvage_cheaper_than_rebuild'];
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

// ── Ground-truth gate (R16): the kill-skeptic's market-facing bars (is_zero_to_one, real_demand) MUST be
// judged against LIVE competitive ground-truth, never the candidate's own self-claims. A verdict reached
// without a fresh, sourced ground-truth packet is INADMISSIBLE. Fail-closed: missing / uncited / empty-
// without-attestation / stale / future-dated → not admissible. This permanently cures the competitive-
// blindness defect (2026-06-16: the stock scout false-SURVIVEd commodity — it re-derived a thesis we had
// already KILLED that week — because the skeptic had ZERO market awareness). Pure; clock is injected. ──
export const GROUND_TRUTH_MAX_AGE_DAYS = 30;
export const MARKET_BARS = ['is_zero_to_one', 'real_demand']; // the bars ground-truth informs
export function groundTruthAdmissible(packet, { now = Date.now(), maxAgeDays = GROUND_TRUTH_MAX_AGE_DAYS } = {}) {
  if (!packet || typeof packet !== 'object') return { ok: false, reason: 'no ground-truth packet — skeptic would be competitively blind' };
  const competitors = Array.isArray(packet.competitors) ? packet.competitors.filter(Boolean) : [];
  const sources = Array.isArray(packet.sources) ? packet.sources.filter(Boolean) : [];
  // No sources = uncited = indistinguishable from a guess → inadmissible.
  if (!sources.length) return { ok: false, reason: 'ground-truth has no sources (uncited is inadmissible)' };
  // An empty competitor set is allowed ONLY when the sweep explicitly attests it searched and the field is
  // genuinely empty — otherwise "no competitors" is indistinguishable from "never looked".
  if (!competitors.length && packet.searched_landscape !== true)
    return { ok: false, reason: 'empty ground-truth: no competitors and no attested landscape search' };
  const ts = packet.checked_at ? Date.parse(packet.checked_at) : NaN;
  if (!Number.isFinite(ts)) return { ok: false, reason: 'ground-truth missing a valid checked_at timestamp' };
  const ageDays = (now - ts) / 86_400_000;
  if (ageDays < -1) return { ok: false, reason: 'ground-truth checked_at is in the future (clock skew / forgery)' };
  if (ageDays > maxAgeDays) return { ok: false, reason: `ground-truth stale: ${Math.round(ageDays)}d > ${maxAgeDays}d` };
  return { ok: true, reason: `fresh ground-truth: ${competitors.length} competitor(s), ${sources.length} source(s), ${Math.round(ageDays)}d old` };
}

// ── Grounded kill-pass (R17): the kill-pass with the ground-truth precondition enforced — this is what the
// pipelines MUST call instead of bare rollupVerdict. Inadmissible ground-truth short-circuits to KILL
// *before* the skeptics are weighed, so a competitively-blind run can never surface a SURVIVE. ──
export function rollupVerdictGrounded(verdicts, packet, { minSkeptics = 3, now = Date.now() } = {}) {
  const gt = groundTruthAdmissible(packet, { now });
  if (!gt.ok) return { verdict: 'KILL', reason: `ground-truth gate: ${gt.reason}`, ground_truth_ok: false };
  return { ...rollupVerdict(verdicts, minSkeptics), ground_truth_ok: true };
}

// ── Durability gate (R18) — Thiel's 7 questions (Zero to One, Ch.13): "is the BUSINESS durable?". Layers
// ABOVE the 5 kill-pass bars (which ask "is the code good?"). A build greenlight requires >=6 of 7. Each
// answer is { pass, why }; a missing/malformed answer defaults to FAIL (kill-first). Pure. ──
export const SEVEN_QUESTIONS = ['engineering', 'timing', 'monopoly', 'people', 'distribution', 'durability', 'secret'];
export const DURABILITY_MIN_PASS = 6;
export function scoreSevenQuestions(answers) {
  const by_question = {}; let passed = 0;
  for (const q of SEVEN_QUESTIONS) { const ok = answers?.[q]?.pass === true; by_question[q] = ok; if (ok) passed++; }
  return { passed, total: SEVEN_QUESTIONS.length, by_question, durability_pass: passed >= DURABILITY_MIN_PASS };
}

// ── First-principles gate (R19) — Elon's reasoning test: is the thesis reduced to FUNDAMENTAL TRUTHS, or
// reasoned by analogy / "how everyone does it" (cargo-cult, me-too)? The core check `reasoned_from_fundamentals`
// is NON-NEGOTIABLE (an analogy-only thesis fails outright); `requirements_questioned` + `irreducible`
// (deleted/simplified to the minimum, not bloat) are quality. Pass = core true AND >=2 of 3. Pure. ──
export const FIRST_PRINCIPLES_CHECKS = ['reasoned_from_fundamentals', 'requirements_questioned', 'irreducible'];
export const FIRST_PRINCIPLES_MIN_PASS = 2; // core (reasoned_from_fundamentals) + this many total
export function scoreFirstPrinciples(fp) {
  const by_check = {}; let passed = 0;
  for (const c of FIRST_PRINCIPLES_CHECKS) { const ok = fp?.[c]?.pass === true; by_check[c] = ok; if (ok) passed++; }
  const first_principles_pass = by_check.reasoned_from_fundamentals === true && passed >= FIRST_PRINCIPLES_MIN_PASS;
  return { passed, total: FIRST_PRINCIPLES_CHECKS.length, by_check, first_principles_pass };
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

// ── Source manifest (R2/R3): trees API, exclude build artifacts, .truncated fallback. ──
// Pure core takes injected tree fetchers so the fallback is unit-testable without the network.
export function buildManifest(rootSha, fetchRecursive, fetchShallow) {
  const r = fetchRecursive(rootSha);
  if (!r.truncated) {
    const paths = r.entries.filter(e => e.type === 'blob').map(e => e.path);
    return { paths: filterSourcePaths(paths), truncated: false, fallback_used: false };
  }
  // truncated → descend per subtree sha so we never return a silently partial manifest
  const paths = [];
  const walk = (sha, prefix) => {
    for (const e of fetchShallow(sha).entries) {
      const full = prefix ? `${prefix}/${e.path}` : e.path;
      if (e.type === 'tree') { if (!EXCLUDE_DIR.test(full + '/')) walk(e.sha, full); }
      else if (e.type === 'blob') paths.push(full);
    }
  };
  walk(rootSha, '');
  return { paths: filterSourcePaths(paths), truncated: true, fallback_used: true };
}

// ── Stage 5 (deterministic): dedupe (R5), extract-path verify (R6), honest greenlight, persist. ──
export function dedupeBuildSpecs(specs) {
  const best = new Map(); // ≤1 per source_repo, keep lowest rank number (best)
  for (const s of specs || []) {
    const cur = best.get(s.source_repo);
    if (!cur || (s.rank ?? 1e9) < (cur.rank ?? 1e9)) best.set(s.source_repo, s);
  }
  return [...best.values()];
}
// Normalize an agent-supplied path to repo-relative: strip leading slashes and a redundant
// "owner/name/" or "name/" prefix the agent sometimes prepends (which 404s the contents API).
export function normalizeRepoPath(repo, p) {
  let x = String(p || '').trim().replace(/^\/+/, '');
  const name = String(repo || '').split('/')[1];
  for (const prefix of [repo ? `${repo}/` : null, name ? `${name}/` : null].filter(Boolean)) {
    if (x.startsWith(prefix)) { x = x.slice(prefix.length); break; }
  }
  return x;
}
export function verifyExtractPaths(specs, pathExists) {
  return (specs || []).map(s => {
    const extract_list = (s.extract_list || []).map(e => ({ ...e, from: normalizeRepoPath(s.source_repo, e.from) }));
    const checks = extract_list.map(e => ({ from: e.from, exists: !!pathExists(s.source_repo, e.from) }));
    return { ...s, extract_list, extracts_verified: checks.length > 0 && checks.every(c => c.exists), path_checks: checks };
  });
}
export const MIN_HOURS_SAVED = 3;
export function evaluateGreenlight(result) {
  const candById = new Map((result.candidates || []).map(c => [c.candidate_id, c]));
  const survived = new Set((result.judged || []).filter(j => j.rollup?.verdict === 'SURVIVE').map(j => j.candidate_id));
  // Durability + first-principles scorecards, keyed by candidate (R18/R19). A build greenlight requires BOTH.
  const durabilityById = new Map((result.durability || []).map(d => [d.candidate_id, d]));
  const greenlights = [], rejected = [];
  for (const s of result.buildspecs || []) {
    const c = candById.get(s.candidate_id); const why = [];
    if (!survived.has(s.candidate_id)) why.push('did not survive kill-pass');
    if (!c) why.push('no candidate record');
    else {
      if ((c.scores?.hours_saved_vs_rebuild ?? 0) < MIN_HOURS_SAVED) why.push(`hours_saved ${c.scores?.hours_saved_vs_rebuild} < ${MIN_HOURS_SAVED}`);
      // AI-native is a scored plus, NOT a gate — broadened bar: defensible + vertical + real demand + legally liftable.
      if (c.zero_to_one_rank !== 'true-zero-to-one') why.push('not true-zero-to-one');
    }
    if (s.extracts_verified !== true) why.push('extract paths unverified');
    const dur = durabilityById.get(s.candidate_id);
    if (dur?.durability_pass !== true) why.push('failed Thiel 7-questions durability gate (<6/7)');
    if (dur?.first_principles_pass !== true) why.push('failed first-principles gate (analogy/me-too or not reduced to fundamentals)');
    (why.length ? rejected : greenlights).push({ spec_id: s.spec_id, product: s.product, why });
  }
  return { count: greenlights.length, greenlights, rejected };
}
export function persistRun(runId, result, { pathExists } = {}) {
  const dir = runDir(runId), f = n => path.join(dir, n);
  writeJsonl(f('01-inventory.jsonl'), result.inventory || []);
  writeJsonl(f('02-capabilities.jsonl'), result.capabilities || []);
  writeJsonl(f('03-opportunities.jsonl'), result.candidates || []);
  const verdicts = [];
  for (const j of result.judged || []) {
    for (const v of j.verdicts || []) verdicts.push(v);
    verdicts.push({ candidate_id: j.candidate_id, skeptic: 'rollup', verdict: j.rollup?.verdict, kill_reason: j.rollup?.reason, ground_truth_ok: j.rollup?.ground_truth_ok });
  }
  writeJsonl(f('04-verdicts.jsonl'), verdicts);
  // Seed of the dated-verdict corpus (S1 Market-Intelligence organ): one row per candidate that was swept,
  // pairing the competitive ground-truth with the verdict it produced. Compounds across runs into the moat.
  // Include gate-kill rows (ground_truth === null) too: spreading null is a no-op, so the row records the
  // candidate + verdict + ground_truth_ok:false — an honest "the sweep failed for this one" audit trail.
  const groundTruth = (result.judged || [])
    .filter(j => j.ground_truth !== undefined)
    .map(j => ({ candidate_id: j.candidate_id, ...j.ground_truth, verdict: j.rollup?.verdict, ground_truth_ok: j.rollup?.ground_truth_ok }));
  writeJsonl(f('07-ground-truth.jsonl'), groundTruth);
  // Durability + first-principles scorecards (R18/R19) — the build-eligibility gate above the 5 bars.
  writeJsonl(f('08-durability.jsonl'), result.durability || []);
  let specs = dedupeBuildSpecs(result.buildspecs || []);
  if (pathExists) specs = verifyExtractPaths(specs, pathExists);
  writeJsonl(f('05-buildspecs.jsonl'), specs);
  writeJsonl(f('06-frozen-archive.jsonl'), (result.frozen || []).map(x => frozenArchiveNote(x.repo, x.reason, { runId })));
  const greenlight = evaluateGreenlight({ ...result, buildspecs: specs });
  fs.writeFileSync(f('greenlight.json'), JSON.stringify(greenlight, null, 2));
  return { dir, greenlight, buildspecs: specs };
}

// ── Phase B: factory consumption — project honest-greenlit BuildSpecs into a thin ranked queue the
// build loop reads. The factory's PRD Phase-1 pre-step calls `candidates next`; if a candidate comes
// back it becomes the SKU thesis (skipping blind trend-discovery), then `candidates consume <spec_id>`
// marks it spent. Pure functions; never un-consumes; never builds; never charges. ──
export const CANDIDATES_FILE = path.join(HERE, '..', 'recycled-candidates.jsonl');
const CANDIDATE_THIN_FIELDS = ['vertical', 'icp', 'wedge', 'rough_dev_effort', 'ai_native_test', 'parts_bin_refs'];
// BuildSpec[] → thin ranked candidate records. Tier-1 OWN repos are license-confirmed (we own the code);
// Tier-2 external specs default to license_human_confirmed:false until a human clears the gate.
export function projectCandidates(buildspecs, { runId = null } = {}) {
  return (buildspecs || []).map((s, i) => {
    const thin = {
      rank: s.rank ?? (i + 1), spec_id: s.spec_id, candidate_id: s.candidate_id || null,
      product: s.product, source_repo: s.source_repo || null, extract_list: s.extract_list || [],
      license_human_confirmed: s.license_human_confirmed ?? (String(s.source_tier) === '2' ? false : true),
      consumed: false, created_by_run: runId,
    };
    for (const k of CANDIDATE_THIN_FIELDS) if (s[k] !== undefined) thin[k] = s[k];
    return thin;
  });
}
// NaN-/missing-safe rank for sorting (`??` would let NaN through and corrupt the comparator).
const rankOf = c => (Number.isFinite(c?.rank) ? c.rank : 1e9);
// Merge a fresh projection into the existing queue: dedupe by spec_id; a re-projection refreshes fields
// but durable decisions are STICKY — NEVER un-consume a spent candidate, NEVER revert a human license
// confirmation. Returns a new array; inputs are not mutated.
export function mergeCandidates(existing, incoming) {
  const out = (existing || []).map(c => ({ ...c }));
  const byId = new Map(out.map(c => [c.spec_id, c]));
  // Collapse the incoming batch by spec_id first (keep the best/lowest rank) so a duplicated spec_id
  // in one projection can't invert ranks via last-wins.
  const incById = new Map();
  for (const inc of incoming || []) {
    const seen = incById.get(inc.spec_id);
    if (!seen || rankOf(inc) < rankOf(seen)) incById.set(inc.spec_id, inc);
  }
  for (const inc of incById.values()) {
    const prev = byId.get(inc.spec_id);
    if (!prev) { const c = { ...inc }; byId.set(inc.spec_id, c); out.push(c); }
    else Object.assign(prev, {
      ...inc,
      consumed: prev.consumed || inc.consumed,
      license_human_confirmed: prev.license_human_confirmed || inc.license_human_confirmed,
    });
  }
  return out;
}
// The build loop's pick: lowest rank among unconsumed + license-confirmed candidates. null if the queue is dry.
export function eligibleTopCandidate(candidates) {
  const eligible = (candidates || []).filter(c => c && !c.consumed && c.license_human_confirmed === true);
  if (!eligible.length) return null;
  return eligible.slice().sort((a, b) => rankOf(a) - rankOf(b))[0];
}
export function markConsumed(candidates, specId) {
  return (candidates || []).map(c => (c.spec_id === specId ? { ...c, consumed: true } : { ...c }));
}

// ── Outcome-capture (D15): the learning-loop moat SEED. A verdict is an in-the-moment judgment; an
// OUTCOME is what actually happened, observed later. Kept as a SEPARATE append-only artifact — NOT bolted
// onto the skeptic's kill-pass verdict, which cannot know the future — keyed by candidate_id so it joins
// back to ANY candidate we judged, crucially the KILLS (did someone else ship it and win? = a false kill).
// This is the only non-re-scrapable layer: our private judgment→outcome pairs. It only SEEDS capture; the
// accuracy bake-off needs labeled volume that does not exist yet, so this claims NO moat — it earns one.
export const OUTCOMES_FILE = path.join(HERE, '..', 'recycled-outcomes.jsonl');
export const OUTCOME_LABELS = ['made_money', 'failed', 'unknown'];
// Pure, fail-fast at the boundary: build one validated outcome event. Throws on bad input (never logs garbage).
export function makeOutcome(candidate_id, outcome_label, { revenue = null, checked_at = new Date().toISOString(), note = null } = {}) {
  const id = typeof candidate_id === 'string' ? candidate_id.trim() : '';
  if (!id) throw new Error('outcome: candidate_id is required');
  if (!OUTCOME_LABELS.includes(outcome_label)) throw new Error(`outcome: label must be one of ${OUTCOME_LABELS.join('|')} (got ${JSON.stringify(outcome_label)})`);
  let rev = null;
  if (revenue != null && revenue !== '') {
    // reject boolean/array/object BEFORE coercion — Number(true)===1 would otherwise slip past as valid revenue
    if (typeof revenue === 'boolean' || typeof revenue === 'object') throw new Error(`outcome: revenue must be a number >= 0 (got ${JSON.stringify(revenue)})`);
    rev = typeof revenue === 'number' ? revenue : Number(revenue);
    if (!Number.isFinite(rev) || rev < 0) throw new Error(`outcome: revenue must be a number >= 0 (got ${JSON.stringify(revenue)})`);
  }
  if (typeof checked_at !== 'string' || Number.isNaN(Date.parse(checked_at))) throw new Error(`outcome: checked_at must be an ISO timestamp (got ${JSON.stringify(checked_at)})`);
  return { candidate_id: id, outcome_label, revenue: rev, checked_at, ...(note ? { note: String(note) } : {}) };
}
// Pure reducer: the append-only log → current state, one record per candidate_id (latest checked_at wins;
// a tie keeps the later-appended = observation order). New array; input never mutated.
export function latestByCandidate(records) {
  const byId = new Map();
  for (const r of records || []) {
    if (!r || typeof r.candidate_id !== 'string') continue;
    if (typeof r.checked_at !== 'string' || Number.isNaN(Date.parse(r.checked_at))) continue; // skip corrupt/hand-edited rows (no valid timestamp)
    const prev = byId.get(r.candidate_id);
    if (!prev || Date.parse(r.checked_at) >= Date.parse(prev.checked_at)) byId.set(r.candidate_id, { ...r });
  }
  return [...byId.values()];
}
// Pure: honest DESCRIPTIVE counts of the captured corpus — explicitly NOT a calibration/accuracy claim
// (the kill-accuracy bake-off needs a verdict↔outcome join at volume we do not have yet).
export function summarizeOutcomes(records) {
  const latest = latestByCandidate(records);
  const by_label = Object.fromEntries(OUTCOME_LABELS.map(l => [l, 0]));
  let revenue_total = 0;
  for (const r of latest) {
    if (r.outcome_label in by_label) by_label[r.outcome_label]++;
    if (Number.isFinite(r.revenue)) revenue_total += r.revenue;
  }
  return { candidates: latest.length, observations: (records || []).length, by_label, revenue_total };
}

// ── gh-backed I/O for the source read (agents call these via `node recycled/recycled-scan.mjs ...`). ──
function sh(cmd) { return execSync(cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim(); }
// Input guards (defense-in-depth): repo/path/ref are interpolated into shell `gh` calls and originate from
// agent output, so reject anything with shell metacharacters BEFORE it can reach execSync.
const REPO_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;       // owner/name
const PATHREF_RE = /^[A-Za-z0-9._/-]+$/;                     // content path / git ref — no spaces or metachars
function safeRepo(r) { if (!REPO_RE.test(r || '')) throw new Error(`unsafe repo argument: ${JSON.stringify(r)}`); return r; }
function safePath(p) { if (!PATHREF_RE.test(p || '')) throw new Error(`unsafe path argument: ${JSON.stringify(p)}`); return p; }
function safeRef(r) { if (r == null || r === '') return r; if (!PATHREF_RE.test(r)) throw new Error(`unsafe ref argument: ${JSON.stringify(r)}`); return r; }
function ghApiJson(p) { try { return JSON.parse(sh(`gh api "${p}"`)); } catch { return null; } }
function defaultSha(repo) {
  safeRepo(repo);
  const br = sh(`gh api repos/${repo} --jq .default_branch`);
  return sh(`gh api repos/${repo}/git/refs/heads/${br} --jq .object.sha`);
}
function ghManifest(repo) {
  safeRepo(repo);
  const sha = defaultSha(repo);
  const fetchRecursive = s => { const j = ghApiJson(`repos/${repo}/git/trees/${s}?recursive=1`); return { entries: j?.tree || [], truncated: !!j?.truncated }; };
  const fetchShallow = s => { const j = ghApiJson(`repos/${repo}/git/trees/${s}`); return { entries: j?.tree || [], truncated: !!j?.truncated }; };
  return { repo, sha, ...buildManifest(sha, fetchRecursive, fetchShallow) };
}
function ghPathExists(repo, p) { safeRepo(repo); const x = safePath(normalizeRepoPath(repo, p)); try { sh(`gh api "repos/${repo}/contents/${x}" --jq .sha`); return true; } catch { return false; } }
function ghCat(repo, p, ref) { safeRepo(repo); safePath(p); safeRef(ref); const q = ref ? `?ref=${ref}` : ''; return Buffer.from(sh(`gh api "repos/${repo}/contents/${p}${q}" --jq .content`), 'base64').toString('utf8'); }

// ── CLI: subcommands. Default = Stage 0 scan. manifest/cat/pathcheck = source read. persist = Stage 5. ──
function stage0Scan(json) {
  const owners = (process.env.RECYCLED_ORGS || 'GoldenSheepAI').split(',').map(s => s.trim()).filter(Boolean);
  const all = enumerateOwnRepos({ owners });
  const targets = all.filter(r => !r.is_fork && (r.repo_age === 'DORMANT' || r.repo_age === 'DEAD'));
  if (!all.length) { console.error('✗ no repos enumerated (is `gh` authed?)'); process.exit(1); }
  const file = path.join(runDir(process.env.RECYCLED_RUN_ID || 'scan-latest'), '00-targets.jsonl');
  writeJsonl(file, targets);
  if (json) { console.log(JSON.stringify({ total: all.length, targets: targets.length, file, targets_list: targets }, null, 2)); return; }
  console.log(`Recycled Stage 0 — ${all.length} repos, ${targets.length} dormant/dead targets`);
  for (const t of targets) console.log(`  ${t.repo_age.padEnd(8)} ${t.repo} (${t.primary_language || '?'}, pushed ${String(t.last_push).slice(0, 10)})`);
  console.log(`→ ${file}`);
}
function main() {
  const json = process.argv.includes('--json');
  const [, , cmd, ...rest] = process.argv;
  if (cmd === 'manifest') {
    const repo = rest[0]; if (!repo) { console.error('usage: manifest <owner/name>'); process.exit(1); }
    const m = ghManifest(repo);
    if (json) { console.log(JSON.stringify(m)); return; }
    console.log(`${repo} @ ${m.sha.slice(0, 7)} — ${m.paths.length} source files${m.fallback_used ? ' (truncated→fallback)' : ''}`);
    m.paths.forEach(p => console.log('  ' + p));
    return;
  }
  if (cmd === 'cat') { const [repo, p, ref] = rest; if (!repo || !p) { console.error('usage: cat <repo> <path> [ref]'); process.exit(1); } process.stdout.write(ghCat(repo, p, ref)); return; }
  if (cmd === 'pathcheck') { const [repo, p] = rest; console.log(ghPathExists(repo, p) ? 'EXISTS' : 'MISSING'); return; }
  if (cmd === 'candidates') {
    const sub = rest[0];
    if (sub === 'project') {                     // read a run's honest greenlights → merge into the factory queue
      const runId = rest[1] || 'run-latest';
      // Don't use runDir() here — it creates the dir as a side effect; a bad run-id must fail, not spawn an empty dir.
      const dir = path.join(HERE, '..', 'runs', 'recycled', runId);
      const specsFile = path.join(dir, '05-buildspecs.jsonl');
      if (!fs.existsSync(specsFile)) { console.error(`✗ no run '${runId}' (missing ${specsFile}) — run a deep-dive + persist first`); process.exit(1); }
      const specs = readJsonl(specsFile);
      // Projection targets ONLY honest greenlights → greenlight.json is REQUIRED and must parse. Absent or
      // corrupt (e.g. an interrupted persist) → abort, never silently project un-evaluated specs into the queue.
      const glPath = path.join(dir, 'greenlight.json');
      if (!fs.existsSync(glPath)) { console.error(`✗ ${glPath} missing — the run was not evaluated; refusing to project un-vetted specs`); process.exit(1); }
      let greenIds;
      try { const g = JSON.parse(fs.readFileSync(glPath, 'utf8')); greenIds = new Set((g.greenlights || []).map(x => x.spec_id)); }
      catch (e) { console.error(`✗ ${glPath} is unreadable/corrupt (${e.message}) — refusing to project; re-run persist`); process.exit(1); }
      const incoming = projectCandidates(specs.filter(s => greenIds.has(s.spec_id)), { runId });
      const merged = mergeCandidates(readJsonl(CANDIDATES_FILE), incoming);
      writeJsonl(CANDIDATES_FILE, merged);
      console.log(`Recycled candidates ← ${incoming.length} greenlit from ${runId} (${merged.length} total) → ${CANDIDATES_FILE}`);
      for (const c of incoming) console.log(`  +rank${c.rank} ${c.product} (${c.spec_id}) license_confirmed=${c.license_human_confirmed}`);
      return;
    }
    if (sub === 'next') {                          // the build loop's Phase-1 pre-step: empty stdout = queue dry → fall through
      const top = eligibleTopCandidate(readJsonl(CANDIDATES_FILE));
      process.stdout.write(top ? JSON.stringify(top, null, 2) : '');
      return;
    }
    if (sub === 'consume') {                        // mark a candidate spent after the factory adopts it
      const specId = rest[1]; if (!specId) { console.error('usage: candidates consume <spec_id>'); process.exit(1); }
      const cur = readJsonl(CANDIDATES_FILE);
      if (!cur.some(c => c.spec_id === specId)) { console.error(`✗ no candidate ${specId} in queue`); process.exit(1); }
      writeJsonl(CANDIDATES_FILE, markConsumed(cur, specId));
      console.log(`✓ consumed ${specId}`);
      return;
    }
    if (sub === 'confirm-license') {                 // human clears a Tier-2 license gate (durable, sticky across re-projection)
      const specId = rest[1]; if (!specId) { console.error('usage: candidates confirm-license <spec_id>'); process.exit(1); }
      const cur = readJsonl(CANDIDATES_FILE);
      if (!cur.some(c => c.spec_id === specId)) { console.error(`✗ no candidate ${specId} in queue`); process.exit(1); }
      writeJsonl(CANDIDATES_FILE, cur.map(c => (c.spec_id === specId ? { ...c, license_human_confirmed: true } : { ...c })));
      console.log(`✓ license confirmed for ${specId} (now eligible; sticky across re-projection)`);
      return;
    }
    if (sub === 'list') {
      const cur = readJsonl(CANDIDATES_FILE).slice().sort((a, b) => (rankOf(a)) - (rankOf(b)));
      if (!cur.length) { console.log('(candidates queue empty)'); return; }
      for (const c of cur) console.log(`  ${c.consumed ? '✓' : ' '} rank ${c.rank} ${c.product} (${c.spec_id})${c.license_human_confirmed ? '' : ' [needs license confirm]'}${c.consumed ? ' [consumed]' : ''}`);
      return;
    }
    console.error('usage: candidates <project <run-id> | next | consume <spec_id> | confirm-license <spec_id> | list>'); process.exit(1);
  }
  if (cmd === 'outcome') {                          // the learning-loop moat seed: log what actually happened (D15)
    const sub = rest[0];
    if (sub === 'list' || sub === 'stats') {
      const recs = readJsonl(OUTCOMES_FILE);
      if (sub === 'stats') {
        const s = summarizeOutcomes(recs);
        console.log(`Recycled outcomes — ${s.candidates} candidate(s) tracked over ${s.observations} observation(s)`);
        for (const l of OUTCOME_LABELS) console.log(`  ${l.padEnd(11)} ${s.by_label[l]}`);
        console.log(`  revenue_total $${s.revenue_total}`);
        console.log('  (descriptive counts only — NOT a calibration/accuracy claim; the kill-accuracy bake-off needs labeled volume we do not have yet)');
        return;
      }
      const latest = latestByCandidate(recs).sort((a, b) => Date.parse(b.checked_at) - Date.parse(a.checked_at));
      if (!latest.length) { console.log('(no outcomes captured yet — log one: outcome <candidate_id> <made_money|failed|unknown> [revenue])'); return; }
      for (const r of latest) console.log(`  ${r.checked_at.slice(0, 10)}  ${r.outcome_label.padEnd(11)} ${(r.revenue != null ? '$' + r.revenue : '').padStart(8)}  ${r.candidate_id}`);
      return;
    }
    const [candidateId, label, revenue] = rest; // accepts ANY judged candidate_id (esp. KILLS), not just queued greenlights
    if (!candidateId || !label) { console.error(`usage: outcome <candidate_id> <${OUTCOME_LABELS.join('|')}> [revenue]  |  outcome list  |  outcome stats`); process.exit(1); }
    let rec;
    try { rec = makeOutcome(candidateId, label, { revenue }); }
    catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
    appendJsonl(OUTCOMES_FILE, rec);
    console.log(`✓ outcome logged: ${rec.candidate_id} → ${rec.outcome_label}${rec.revenue != null ? ` ($${rec.revenue})` : ''} @ ${rec.checked_at.slice(0, 10)} → ${OUTCOMES_FILE}`);
    return;
  }
  if (cmd === 'persist') {
    const runId = rest[0] || 'run-latest';
    const result = JSON.parse(fs.readFileSync(0, 'utf8')); // workflow result on stdin
    const { dir, greenlight } = persistRun(runId, result, { pathExists: ghPathExists });
    console.log(`Recycled persisted → ${dir}`);
    console.log(`honest greenlights: ${greenlight.count}`);
    for (const g of greenlight.greenlights) console.log(`  ✅ ${g.product} (${g.spec_id})`);
    for (const r of greenlight.rejected) console.log(`  ✗ ${r.product || r.spec_id}: ${r.why.join('; ')}`);
    if (greenlight.count === 0) console.log('  → corpus yielded no build-ready opportunity this pass (honest result).');
    return;
  }
  stage0Scan(json); // default
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
