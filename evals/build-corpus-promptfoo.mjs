#!/usr/bin/env node
// (b) Generate a promptfoo config that grades the SAME labeled corpus with tier-2 g-eval,
// so we can measure whether the LLM judge catches the cases the regex gate missed (#13/#14/#15).
// Uses the `echo` provider so the corpus copy IS the graded output. Run: node evals/build-corpus-promptfoo.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { OFFER_FILE } from '../hooks/audit-core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const rows = readFileSync(join(HERE, 'corpus.jsonl'), 'utf8')
  .split('\n').filter(Boolean).map(l => JSON.parse(l))
  .filter(r => r.label !== 'ignore'); // grade only enforced copy

// Surface-aware rubric: risk-reversal is conditional on offer/checkout surfaces ({{surface}} is
// interpolated per-case by promptfoo from the test vars). This fixes the precision hit where the
// judge wrongly required a guarantee on landing/marketing copy.
const RUBRIC_VALUE = [
  'The copy targets a "{{surface}}" surface. Grade PASS only if all applicable criteria hold:',
  '- STATUS/TRIBE (Godin): speaks to a specific identity or in-group ("for those who…", "not for everyone", named insiders/members) — not generic appeals.',
  '- AUTHORITY (Enns): positions via application/invitation/scarcity or a confident stance, not "sign up today, it is easy".',
  '- NOT COMMODITIZED: avoids horizontal filler ("for everyone", "do more", "simple and easy", "trusted by thousands").',
  '- RISK-REVERSAL (Hormozi): an explicit guarantee/refund/risk-free is REQUIRED ONLY on offer/checkout/pricing/sales surfaces; on non-offer (landing/marketing) surfaces its absence must NOT fail the copy.',
  'Grade FAIL only if a required criterion is clearly missing.',
].join('\n');

const tests = rows.map(r => {
  const surface = OFFER_FILE.test(r.file) ? 'offer/checkout/pricing/sales' : 'non-offer (landing/marketing)';
  return `  - description: ${JSON.stringify(`#${r.id} (label=${r.label})`)}
    vars:
      copy: ${JSON.stringify(r.content)}
      surface: ${JSON.stringify(surface)}`;
}).join('\n');

const yaml = `# AUTO-GENERATED from corpus.jsonl by build-corpus-promptfoo.mjs — do not hand-edit.
# Tier-2 g-eval over the labeled corpus (echo provider returns the copy as the graded output).
# Grounded in promptfoo model-graded assertions + G-Eval (Liu et al., EMNLP 2023).
#
# RUN (external/gated like ECC — founder runs it; OPENROUTER_API_KEY in .env, $0 free model):
#   cd ~/factory-core && npx promptfoo@latest eval -c evals/promptfoo-corpus.yaml --output evals/tier2-results.json
#   node evals/score-tier2.mjs        # then compares tier-2 P/R/F1 to tier-1's 75%
# Verify the free model id is still live: https://openrouter.ai/models?max_price=0
description: Apex copywriter gate — tier-2 corpus grading
providers: [echo]
prompts: ["{{copy}}"]
defaultTest:
  options:
    # gpt-oss-20b:free is usable; popular models (llama-3.3-70b, qwen3) are throttled.
    provider: openrouter:openai/gpt-oss-20b:free
  assert:
    # llm-rubric = ONE judge call per case (g-eval fan-outs many calls and blows the free rate limit).
    - type: llm-rubric
      value: ${JSON.stringify(RUBRIC_VALUE)}
      threshold: 0.7
tests:
${tests}
`;

writeFileSync(join(HERE, 'promptfoo-corpus.yaml'), yaml);
console.log(`wrote promptfoo-corpus.yaml — ${rows.length} graded cases (${rows.filter(r=>r.label==='bad').length} bad / ${rows.filter(r=>r.label==='good').length} good)`);
