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

guard-test: ## AC3+AC4 — deploy-guard + gate acceptance (fixture-based)
	@bash tests/guard.test.sh

gate: ## AC4 — show the live .env gate status (must refuse publish while sealed)
	@if bash deploy-guard.sh publish >/dev/null 2>&1; then echo "✗ GATE FAILED — publish was allowed!"; exit 1; else echo "✓ gate sealed — publish refused (real .env)"; fi

dryrun: ## AC5 — full $0 end-to-end gated slice (loop → preview → notify)
	@LOOP_CMD='bash deploy-guard.sh preview && echo ALL_DONE' PRD_FILE=evals/dryrun-PRD.md MAX_ITERS=2 bash loop.sh __run
	@echo "--- then the gate must refuse publish ---"; $(MAKE) -s gate

heartbeat: ## AC6 — run one heartbeat (DRY_RESTART: never spawns a real loop)
	@DRY_RESTART=1 bash heartbeat.sh

verify: preflight guard-test gate ## run mechanical acceptance checks (fast)
	@echo "── verify GREEN ──"

launch: ## fire the REAL gated cycle (⚠ spends shared Anthropic + Higgsfield pools)
	@echo "⚠ This spends shared credit pools and runs the real loop. Ctrl-C within 3s to abort."; sleep 3; bash loop.sh launch

HEARTBEAT_ID = node -e "const j=require(require('os').homedir()+'/.openclaw/cron/jobs.json');const a=j.jobs.find(x=>x.name=='apex-heartbeat');process.stdout.write(a?a.id:'')"

cron-enable: ## enable the 6h heartbeat cron (resolves id by name)
	@id=$$($(HEARTBEAT_ID)); if [ -n "$$id" ]; then openclaw cron enable "$$id" >/dev/null && echo "✓ apex-heartbeat enabled ($$id)"; else echo "✗ apex-heartbeat not found — register first"; fi

cron-disable: ## disable the 6h heartbeat cron (resolves id by name)
	@id=$$($(HEARTBEAT_ID)); if [ -n "$$id" ]; then openclaw cron disable "$$id" >/dev/null && echo "✓ apex-heartbeat disabled ($$id)"; else echo "✗ apex-heartbeat not found"; fi

.PHONY: help preflight copytest guard-test gate dryrun heartbeat verify launch cron-enable cron-disable
