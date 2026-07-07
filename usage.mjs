#!/usr/bin/env node
// usage.mjs — Apex HEARTBEAT resource analyzer. READS + ANALYZES both constrained pools:
//   1) Claude SUBSCRIPTION plan usage (from local Claude Code transcripts). Auth is your Max OAuth,
//      so builds are covered by the plan and bill $0 per-token — the constraint is the plan's rate
//      limits (5h rolling + weekly), NOT a cash balance. We report an API-equivalent $ as a
//      consumption PROXY, with the Opus share called out (Opus burns the allowance fastest).
//   2) Higgsfield GENERATION credits (live, via `higgsfield account status`) — a real shared pool.
// Emits a survival verdict per HEARTBEAT.md §1 (halt media FIRST when either is low). Never hangs.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { execSync } from 'node:child_process';

const JSON_OUT = process.argv.includes('--json');
const PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

// Thresholds. Claude caps are plan-equiv $ (consumption proxy) and default to UNSET — we can't
// calibrate the Max rate limit from local data, so we only hard-flag Claude against a budget you
// explicitly set in .env; otherwise we report + give a calibration-free Opus advisory. Higgsfield
// is a real readable pool, so its credit floor is always enforced.
const envNum = k => (process.env[k] != null && process.env[k] !== '') ? Number(process.env[k]) : null;
const CLAUDE_5H_BUDGET   = envNum('CLAUDE_5H_BUDGET');    // null = report only
const CLAUDE_WEEK_BUDGET = envNum('CLAUDE_WEEK_BUDGET');  // null = report only
// D23 — default fail-closed Opus ceiling (no budget env required). Gates on the RECENT 5h window (active
// burst), NOT 7d: a rolling-weekly gate would let stale interactive-Opus history permanently cool-down the
// (cheap, Sonnet) loop — the exact infra deadlock to avoid. Trips only on an ACTIVE runaway: Opus over
// CLAUDE_OPUS_PCT of the 5h proxy AND real volume past CLAUDE_OPUS_MIN_PROXY (the floor stops a single early
// call pinning share at 100%). Self-corrects as the 5h window rolls / cheaper calls dilute the share.
// Disable entirely with CLAUDE_OPUS_PCT>=1.
const CLAUDE_OPUS_PCT = num(process.env.CLAUDE_OPUS_PCT, 0.90);
const CLAUDE_OPUS_MIN = num(process.env.CLAUDE_OPUS_MIN_PROXY, 5);
const HIGGS_MIN_CREDITS  = num(process.env.HIGGSFIELD_MIN_CREDITS, 5);

// Official rates per MTok (audited live from platform.claude.com 2026-06-11). Opus 4.8 is $5/$25 —
// NOT the old $15/$75; correcting this dropped the consumption proxy ~3x.
const RATES = { fable:{in:10,out:50}, opus:{in:5,out:25}, sonnet:{in:3,out:15}, haiku:{in:1,out:5} };
const rateFor = m => { m=(m||'').toLowerCase(); return m.includes('fable')?RATES.fable:m.includes('opus')?RATES.opus:m.includes('sonnet')?RATES.sonnet:m.includes('haiku')?RATES.haiku:null; };

function walk(dir){ let out=[]; let ents; try{ents=fs.readdirSync(dir,{withFileTypes:true});}catch{return out;}
  for(const e of ents){ const p=path.join(dir,e.name); if(e.isDirectory()) out=out.concat(walk(p)); else if(e.name.endsWith('.jsonl')) out.push(p); } return out; }

function claudeUsage(){
  const now = Date.now();
  const windows = { '5h': 5*3600e3, '7d': 7*24*3600e3 };
  const agg = {}; for(const k of Object.keys(windows)) agg[k]={proxy:0,tokens:0,opusProxy:0,calls:0,rawInput:0,cacheWrite:0,cacheRead:0};
  const seen = new Set();
  for(const f of walk(PROJECTS)){
    let lines; try{ lines=fs.readFileSync(f,'utf8').split('\n'); }catch{ continue; }
    for(const line of lines){
      if(!line.trim()) continue; let j; try{ j=JSON.parse(line); }catch{ continue; }
      const u=j?.message?.usage; if(!u) continue;
      const ts=Date.parse(j.timestamp||''); if(!Number.isFinite(ts)) continue;
      const id=`${j?.message?.id||''}:${j?.requestId||''}`;
      if(id!==':'){ if(seen.has(id)) continue; seen.add(id); }
      const r=rateFor(j?.message?.model);
      const inp=u.input_tokens||0, cc=u.cache_creation_input_tokens||0, cr=u.cache_read_input_tokens||0, out=u.output_tokens||0;
      const proxy = r ? (inp*r.in + cc*r.in*1.25 + cr*r.in*0.1 + out*r.out)/1e6 : 0;
      const toks = inp+cc+cr+out;
      const isOpus = /opus/i.test(j?.message?.model||'');
      for(const [k,span] of Object.entries(windows)){
        if(now-ts<=span){ const a=agg[k]; a.proxy+=proxy; a.tokens+=toks; a.calls++; if(isOpus) a.opusProxy+=proxy;
          a.rawInput+=inp; a.cacheWrite+=cc; a.cacheRead+=cr; }
      }
    }
  }
  return agg;
}

function higgsUsage(){
  try{
    const raw=execSync('higgsfield account status --json',{timeout:20000,stdio:['ignore','pipe','ignore']}).toString();
    const j=JSON.parse(raw);
    return { ok:true, credits:num(j.credits, null), plan:j.subscription_plan_type ?? j.plan ?? null };
  }catch{ return { ok:false, credits:null, plan:null }; }
}

const claude = claudeUsage();

// --cache: surface the factory's PROMPT-CACHE hit-rate (D22, see CACHING.md). Caching is automatic
// in the loop/DSL; this makes it VISIBLE so a regressed prefix (a volatile token slipped ahead of the
// cacheable block) shows up as a falling read%. $0, transcript-only — no higgsfield shell-out.
if(process.argv.includes('--cache')){
  const P = n => (n*100).toFixed(1)+'%';
  const M = n => (n/1e6).toFixed(2)+'M';
  console.log('— PROMPT-CACHE HIT-RATE (factory subscription; D22, see CACHING.md) —');
  for(const k of ['5h','7d']){
    const a = claude[k];
    const inb = a.rawInput + a.cacheWrite + a.cacheRead; // total input tokens (after/at the breakpoint)
    const read = inb ? a.cacheRead/inb : 0, write = inb ? a.cacheWrite/inb : 0, fresh = inb ? a.rawInput/inb : 0;
    console.log(`  ${k.padEnd(3)} read ${P(read).padStart(6)}  write ${P(write).padStart(6)}  uncached ${P(fresh).padStart(6)}`
      + `  ·  in ${M(inb)} tok (read ${M(a.cacheRead)} / write ${M(a.cacheWrite)} / fresh ${M(a.rawInput)}) · ${a.calls} calls`);
  }
  console.log('read% = input tokens served from cache (billed 0.1×). High + stable = prefixes reused well;');
  console.log('a falling read% means a cacheable prefix regressed — a volatile token slipped ahead of it (CACHING.md).');
  process.exit(0);
}

const higgs = higgsUsage();

// ---- analysis / verdict (HEARTBEAT.md §1) ----
const actions=[], advisories=[];
const mediaLow = higgs.ok && higgs.credits!=null && higgs.credits < HIGGS_MIN_CREDITS;
if(mediaLow)  actions.push(`HALT non-essential media — Higgsfield ${higgs.credits} < ${HIGGS_MIN_CREDITS} credits. Reuse over regenerate.`);
if(!higgs.ok) actions.push('Higgsfield balance unreadable — put media on the graceful-skip path.');
if(CLAUDE_5H_BUDGET!=null && claude['5h'].proxy > CLAUDE_5H_BUDGET)
  actions.push(`Claude 5h over your budget ($${claude['5h'].proxy.toFixed(0)} > $${CLAUDE_5H_BUDGET}) — drop exploratory sub-agents, focus the funnel.`);
if(CLAUDE_WEEK_BUDGET!=null && claude['7d'].proxy > CLAUDE_WEEK_BUDGET)
  actions.push(`Claude weekly over your budget ($${claude['7d'].proxy.toFixed(0)} > $${CLAUDE_WEEK_BUDGET}) — defer non-critical builds.`);
// calibration-free advisory: Opus dominates plan consumption → cheaper routing stretches the Max allowance.
const wk=claude['7d'];
const opusShare = wk.proxy>0 ? wk.opusProxy/wk.proxy : 0;           // weekly — advisory/visibility only
const rc=claude['5h'];
const opusShare5h = rc.proxy>0 ? rc.opusProxy/rc.proxy : 0;         // recent burst — what the gate acts on
// D23 fail-closed ceiling: only an ACTIVE runaway (recent volume AND Opus over the ceiling) trips the gate.
const opusRunaway = rc.proxy>=CLAUDE_OPUS_MIN && opusShare5h>CLAUDE_OPUS_PCT;
if(wk.proxy>0 && opusShare>0.8)
  advisories.push(`Opus = ${Math.round(opusShare*100)}% of weekly plan consumption — route cheap steps (heartbeats, trend scans, tests) to Sonnet/Haiku to stretch the Max allowance.`);
if(opusRunaway)
  actions.push(`Opus RUNAWAY (recent) — ${Math.round(opusShare5h*100)}% of last-5h consumption (> ${Math.round(CLAUDE_OPUS_PCT*100)}% ceiling, $${rc.proxy.toFixed(0)} vol). --claude-gate fails closed; route non-code to Sonnet/Haiku (D23) or raise CLAUDE_OPUS_PCT.`);
const verdict = actions.length ? 'ACTION NEEDED' : 'HEALTHY';

// --claude-gate: exit non-zero when a SET budget is exceeded OR (D23) on a default Opus runaway. Ignores
// Higgsfield (media depletion must not block the code build). loop.sh calls this each iteration → 300s cooldown.
if(process.argv.includes('--claude-gate')){
  const over = (CLAUDE_5H_BUDGET!=null && claude['5h'].proxy > CLAUDE_5H_BUDGET)
            || (CLAUDE_WEEK_BUDGET!=null && claude['7d'].proxy > CLAUDE_WEEK_BUDGET)
            || opusRunaway;  // D23: default fail-closed on an Opus runaway, no budget env required
  if(over) console.error(`CLAUDE allowance gate tripped — 5h $${claude['5h'].proxy.toFixed(0)} (Opus ${Math.round(opusShare5h*100)}%), 7d $${claude['7d'].proxy.toFixed(0)} (Opus ${Math.round(opusShare*100)}%)${opusRunaway?' — Opus RUNAWAY ceiling (D23)':''}`);
  process.exit(over ? 1 : 0);
}

if(JSON_OUT){ console.log(JSON.stringify({claude,higgs,verdict,actions,advisories,opusShare,opusShare5h,opusRunaway,thresholds:{CLAUDE_5H_BUDGET,CLAUDE_WEEK_BUDGET,CLAUDE_OPUS_PCT,CLAUDE_OPUS_MIN,HIGGS_MIN_CREDITS}},null,2)); process.exit(0); }

const D=n=>'$'+n.toFixed(2); const M=n=>(n/1e6).toFixed(1)+'M'; const pct=(a,b)=>b?Math.round(a/b*100)+'%':'—';
console.log('— RESOURCE ANALYSIS (both pools) —');
console.log('CLAUDE (subscription — covered by your plan, $0 billed; $ = API-equiv consumption proxy):');
for(const k of ['5h','7d']){ const a=claude[k]; const cap=k==='5h'?CLAUDE_5H_BUDGET:CLAUDE_WEEK_BUDGET;
  const capStr = cap!=null ? ` of ~${D(cap)} budget (${pct(a.proxy,cap)})` : ' (no budget set)';
  console.log(`  ${k.padEnd(3)} ${D(a.proxy).padStart(9)}${capStr} · ${a.calls} calls · ${M(a.tokens)} tok · Opus ${pct(a.opusProxy,a.proxy)}`); }
console.log('HIGGSFIELD (generation credits — real shared pool):');
console.log(higgs.ok ? `  ${higgs.credits} credits${higgs.plan?` · plan ${higgs.plan}`:''} (floor ${HIGGS_MIN_CREDITS})` : '  balance unreadable (CLI/token) — graceful-skip media');
console.log(`VERDICT: ${verdict}`);
for(const a of actions) console.log(`  → ${a}`);
for(const a of advisories) console.log(`  ~ ${a}`);
