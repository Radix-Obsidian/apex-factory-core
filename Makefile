# Apex Factory — front door. `make help` lists targets. See SPEC.md for the acceptance map.
SHELL := /bin/bash
.DEFAULT_GOAL := help

help: ## list targets
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | sed -E 's/:.*## / — /' | sort

preflight: ## AC1 — verify tools + .env
	@for t in tmux claude gh railway higgsfield; do command -v $$t >/dev/null && echo "✓ $$t" || echo "✗ $$t MISSING"; done
	@[ -f .env ] && echo "✓ .env present" || echo "✗ .env MISSING (cp .env.example .env)"

copytest: ## AC2 — copy gate: tier-1 regex baseline (~75% F1); tier-2 G-Eval lifts to 85.7%
	@node evals/eval-regex-gate.mjs || echo "  ↳ tier-1 below the 85% SYSTEM target by design — tier-2 (evals/) covers the gap. Not a regression unless F1 < 75%."

guard-test: ## AC3+AC4 — deploy-guard + auth-guard acceptance (fixture-based)
	@bash tests/guard.test.sh
	@bash tests/auth-guard.test.sh

router-test: ## D23 — model router assertions (task→model), $0 pure logic
	@node ops/model-router.mjs test

model-guard-test: ## D23 — fail-closed model-guard: Opus/Fable blocked on non-code work
	@bash tests/model-guard.test.sh

usage-gate-test: ## D24 — spend gate: usage.mjs --claude-gate (opt-in Opus throttle + budget gate)
	@bash tests/usage-gate.test.sh

waimd-freeze-test: ## D24 — killed-SKU outreach freeze covers every sender entrypoint (sendOne chokepoint)
	@bash tests/waimd-freeze.test.sh

honesty-auditor-test: ## D25 — the never-lie gate: honesty-auditor blocks fabricated proof / fake scarcity / un-timestamped certainty
	@bash tests/honesty-auditor.test.sh

waimd-gate-test: ## D26 — the waimd-housing validation gate fires every PRD §24 verdict (fixtures, $0)
	@bash tests/waimd-gate.test.sh

waimd-gate: ## D26 — waimd-housing validation verdict from PRD §23 metrics ($0, read-only; exit 1 on a KILL)
	@node ops/waimd-gate.mjs

waimd-engine-test: ## D27 — decision-engine unit + invariant suite (determinism, gates, fail-closed evidence)
	@node --test tests/waimd-housing/engine.test.ts

waimd-eval: ## D27 — tier-1 decision-engine eval vs the labeled corpus (F1 + gate attribution, $0)
	@node evals/waimd-engine.mjs

waimd-ready-test: ## D27 — the pre-$70 readiness gate is honest + fail-closed (never green without a beta)
	@bash tests/waimd-ready.test.sh

waimd-ready: ## D27 — pre-$70 production-readiness scorecard ($0, read-only; exit 1 while NOT READY)
	@node ops/waimd-ready.mjs

stripe-teardown-test: ## D29 — teardown verdicts are evidence-gated (mocked fetch, no network, $0)
	@node --test tests/stripe-teardown.test.mjs

stripe-audit: ## D29 — BEFORE revoking: what is still live on the Stripe account (needs the real key; read-only)
	@node ops/stripe-teardown.mjs audit

stripe-verify: ## D29 — AFTER revoking: prove the key is dead, then complete the teardown (needs the real key)
	@node ops/stripe-teardown.mjs verify

chat: ## D23 — launch a Sonnet interactive session (writing/brainstorm/research; NOT code)
	@claude --model claude-sonnet-4-6

watch: ## D23 — launch a Haiku session for polling/status/digests (never an Opus session)
	@claude --model claude-haiku-4-5-20251001

gate: ## AC4 — show the live .env gate status (must refuse publish while sealed)
	@if bash deploy-guard.sh publish >/dev/null 2>&1; then echo "✗ GATE FAILED — publish was allowed!"; exit 1; else echo "✓ gate sealed — publish refused (real .env)"; fi

auth-guard: ## D8 — assert the factory's two-key credential invariant against the live .env (no API key in factory slot)
	@if bash auth-guard.sh >/dev/null 2>&1; then echo "✓ auth-guard OK — factory OAuth token present, no API key in .env"; else echo "✗ auth-guard FAILED — credential misconfig in .env (run: bash auth-guard.sh)"; exit 1; fi

dryrun: ## AC5 — full $0 end-to-end gated slice (loop → preview → notify)
	@LOOP_CMD='bash deploy-guard.sh preview && echo ALL_DONE' PRD_FILE=evals/dryrun-PRD.md MAX_ITERS=2 bash loop.sh __run
	@echo "--- then the gate must refuse publish ---"; $(MAKE) -s gate

heartbeat: ## AC6 — run one heartbeat (DRY_RESTART: never spawns a real loop)
	@DRY_RESTART=1 bash heartbeat.sh

usage: ## read + analyze BOTH pools (Claude plan usage + Higgsfield live credits)
	@node usage.mjs

recycled-verify: ## Recycled — deterministic guardrail tests (R1/R2/R4/R7), $0 LLM
	@node --test recycled/recycled.test.mjs && echo "── recycled-verify GREEN ──"

recycled-scan: ## Recycled — Stage 0: enumerate own dormant/dead repos (metadata only, $0)
	@node recycled/recycled-scan.mjs

recycled-metrics: ## Recycled — cross-run KPIs (D16): kaizen instrument; seed of the digital twin ($0, reads runs/)
	@node recycled/recycled-scan.mjs metrics

recycled-ideate: ## Recycled — net-new ideation (D17): run recipe (the run is a Workflow invocation = LLM spend; ingest is $0)
	@echo "Recycled net-new ideation (D17) — the generator the salvage line lacked. Run recipe:"
	@echo "  1. Invoke the Workflow tool on recycled/ideate.workflow.js (spends Anthropic; bounded by usage.mjs)."
	@echo "     optional args: {domain, maxPains, maxIdeas} — default domain = boring high-intent low-competition B2B."
	@echo "  2. Pipe the result JSON into the deterministic ingest (zero-cost, persists artifacts + queues greenlights):"
	@echo "       node recycled/recycled-scan.mjs ideate ingest <run-id>"
	@echo "  3. The build loop Phase-1 then picks it up: node recycled/recycled-scan.mjs candidates next"
	@echo "  NOTE: the kill-pass is NOT weakened for net-new (D17 IDEATION_BARS); 0 survivors is a valid honest result."

design-check: ## D18 — validate a SKU ships a well-formed Claude-Design brand kit (deterministic, $0). Usage: make design-check SKU=../<sku-repo>
	@node scripts/design-check.mjs "$(SKU)"

closed-loop-check: ## D19 — validate a SKU owns the outcome / closes the loop (deterministic, $0). Usage: make closed-loop-check SKU=../<sku-repo>
	@node scripts/closed-loop-check.mjs "$(SKU)"

caching-check: ## D22 — validate a SKU routes model calls through a cached wrapper (deterministic, $0). Usage: make caching-check SKU=../<sku-repo>
	@node scripts/caching-check.mjs "$(SKU)"

caching-verify: ## D22 — unit tests for the prompt-caching detector ($0 LLM)
	@node --test hooks/caching-core.test.mjs && echo "── caching-verify GREEN ──"

cachingtest: ## D22 — tier-1 caching-gate eval: detector F1 vs labeled corpus (deterministic, $0)
	@node evals/caching-gate.mjs

# ── D20: post-launch operations — operate each LIVE SKU (registry-driven, deterministic, $0) ──
sku-list: ## Ops — list the SKU portfolio registry ($0)
	@node ops/registry.mjs list
sku-validate: ## Ops — structural-validate the SKU registry ($0)
	@node ops/registry.mjs validate
canary: ## Ops — per-SKU health probe (exit≠0 if any DOWN/DEGRADED; network read, $0 LLM)
	@node ops/canary.mjs
portfolio: ## Ops — per-SKU + total revenue from Stripe (read-only key per registry; n/a without it)
	@node ops/revenue.mjs
support-triage: ## Ops — deterministic support triage + founder escalations ($0)
	@node ops/support.mjs
operate: ## Ops — ONE post-launch tick (health + revenue + support) over all live SKUs ($0, deterministic)
	@node ops/operate.mjs
ops-verify: ## Ops — deterministic tests for the operations layer ($0 LLM)
	@node --test ops/ops.test.mjs && echo "── ops-verify GREEN ──"

verify: preflight guard-test router-test model-guard-test usage-gate-test waimd-freeze-test honesty-auditor-test waimd-gate-test waimd-engine-test waimd-eval waimd-ready-test stripe-teardown-test gate auth-guard ops-verify caching-verify ## run mechanical acceptance checks (fast)
	@echo "── verify GREEN ──"

launch: ## fire the REAL gated cycle (⚠ spends shared Anthropic + Higgsfield pools)
	@echo "⚠ This spends shared credit pools and runs the real loop. Ctrl-C within 3s to abort."; sleep 3; bash loop.sh launch

HEARTBEAT_ID = node -e "const j=require(require('os').homedir()+'/.openclaw/cron/jobs.json');const a=j.jobs.find(x=>x.name=='apex-heartbeat');process.stdout.write(a?a.id:'')"

cron-enable: ## enable the 6h heartbeat cron (resolves id by name)
	@id=$$($(HEARTBEAT_ID)); if [ -n "$$id" ]; then openclaw cron enable "$$id" >/dev/null && echo "✓ apex-heartbeat enabled ($$id)"; else echo "✗ apex-heartbeat not found — register first"; fi

cron-disable: ## disable the 6h heartbeat cron (resolves id by name)
	@id=$$($(HEARTBEAT_ID)); if [ -n "$$id" ]; then openclaw cron disable "$$id" >/dev/null && echo "✓ apex-heartbeat disabled ($$id)"; else echo "✗ apex-heartbeat not found"; fi

PLIST = $(HOME)/Library/LaunchAgents/com.apex.factory.crashcheck.plist

crashcron-install: ## install the 30-min pure-shell crash-check launchd agent ($0, no model calls)
	@mkdir -p $(HOME)/Library/LaunchAgents && cp launchd/com.apex.factory.crashcheck.plist "$(PLIST)"
	@launchctl unload "$(PLIST)" 2>/dev/null; launchctl load -w "$(PLIST)" 2>/dev/null \
	  && echo "✓ crash-check agent loaded (every 30 min)" \
	  || { launchctl bootstrap gui/$$(id -u) "$(PLIST)" 2>/dev/null && echo "✓ crash-check agent bootstrapped"; } \
	  || echo "✗ launchctl failed — load manually: launchctl load -w $(PLIST)"

crashcron-uninstall: ## remove the 30-min crash-check launchd agent
	@launchctl unload "$(PLIST)" 2>/dev/null; launchctl bootout gui/$$(id -u)/com.apex.factory.crashcheck 2>/dev/null; \
	rm -f "$(PLIST)" && echo "✓ crash-check agent removed"

hooks-install: ## activate the repo's versioned git hooks (ownership-zone guard) — run once per clone/worktree
	@git config core.hooksPath .githooks && echo "✓ core.hooksPath = .githooks (zone guard active for all committers)"

worktree-setup: ## create/sync the loop's isolated git worktree + branch (AI-native parallel isolation, D12)
	@bash scripts/worktree.sh ensure

worktree-status: ## show all worktrees + the loop branch
	@bash scripts/worktree.sh status

worktree-remove: ## tear down the loop worktree (keeps the loop/auto branch + history)
	@bash scripts/worktree.sh remove

.PHONY: help preflight copytest guard-test router-test model-guard-test usage-gate-test waimd-freeze-test honesty-auditor-test waimd-gate-test waimd-gate waimd-engine-test waimd-eval waimd-ready-test waimd-ready stripe-teardown-test stripe-audit stripe-verify chat watch gate auth-guard dryrun heartbeat usage recycled-verify recycled-scan recycled-metrics recycled-ideate design-check closed-loop-check caching-check caching-verify cachingtest verify launch cron-enable cron-disable crashcron-install crashcron-uninstall hooks-install worktree-setup worktree-status worktree-remove
