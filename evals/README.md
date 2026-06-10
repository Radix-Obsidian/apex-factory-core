# Apex factory evals

Grounded in published methodology — **not** a hallucinated framework:

- **Anthropic — Define success criteria & build evaluations** ([platform.claude.com](https://platform.claude.com/docs/en/docs/test-and-evaluate/develop-tests)) — the 3-tier grading hierarchy (code-based → human → LLM-based), measurable criteria (precision/recall/F1), task-specific corpora *with edge cases*, "reason then score", and judging with a *different* model.
- **promptfoo — model-graded assertions** ([docs](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/)) — `g-eval` + `llm-rubric`, YAML corpora, thresholds, swappable grader provider.
- **G-Eval — Liu et al., EMNLP 2023** — LLM-as-judge with chain-of-thought + form-filling (implemented by promptfoo and DeepEval).
- **DeepEval** ([deepeval.com](https://deepeval.com/docs/metrics-llm-evals)) — pytest-style alternative if we want CI-native G-Eval later.

We use Anthropic's hierarchy directly: a fast **code-based** gate (tier 1) plus an **LLM-judge** for the quality dimension regex can't see (tier 2).

## Tier 1 — code-based gate eval (runnable now, no external installs)

Measures the live regex hook (`hooks/audit-core.mjs`, the *same* code the PreToolUse hook runs) against a labeled corpus with adversarial edge cases.

```bash
node evals/eval-regex-gate.mjs     # exits nonzero if F1 < TARGET_F1 (default 0.85) — usable as a CI gate
```

**Measured result (22 cases):** precision **85.7%**, recall **66.7%**, F1 **75.0%**, ignore-correctness 5/5.
It catches banned-word copy but **misses generic-but-clean copy** (corpus #13–15) and **false-positives** on the substring `robust` (#17). That F1 gap is the documented reason to run tier 2 — it is not a passing grade.

## Tier 2 — LLM-as-judge (promptfoo G-Eval, OpenRouter-free, $0)

```bash
# external/gated like ECC — founder runs it:
cd ~/factory-core && npx promptfoo@latest eval -c evals/promptfooconfig.yaml
```

Generator + judge both run on **OpenRouter free** models (different models, per Anthropic). The g-eval rubric encodes the exact dimensions the regex missed ("for everyone", "do more", "trusted by thousands").

**Corpus-grading recipe (confirm tier-2 catches tier-1's misses):** export the `label:"bad"` rows of `corpus.jsonl` as promptfoo test cases whose `output` is the copy string, and assert the same `g-eval` block. If g-eval flags #13/#14/#15, that's the quantified upgrade over the regex gate.

## Security eval — AgentShield with a planted-secret fixture

AgentShield (tier-1 security, code-based) needs a *known true positive* to prove it actually catches leaks. Create `evals/fixtures/planted-secrets.txt` yourself (kept out of the secret scanners' allowlist) with clearly-FAKE but pattern-matching values, e.g.:

```
# FAKE TEST FIXTURE — not real credentials
STRIPE_SECRET_KEY=sk_live_FAKE0000000000000000000000
AWS_ACCESS_KEY_ID=AKIAFAKEEXAMPLE0001
GITHUB_TOKEN=ghp_FAKE0000000000000000000000000000
```

Then `npx ecc-agentshield scan` must report ≥3 secret findings on that file. (I didn't write the fixture myself — generating credential-shaped strings trips the harness's own secret guard, which is the point.)

## Loop dry-run

`dryrun-PRD.md` exercises `loop.sh` end-to-end with a trivial, network-free task — proves tmux + the loop sentinel + the Telegram ping work before pointing it at a real PRD.

## Status
- Tier 1: ✅ built + run (F1 75%).
- Tier 2: ✅ config ready; run is founder-gated (external npm).
- Security + loop dry-run: ✅ specified; runs are founder-gated (external npm / tmux launch).
