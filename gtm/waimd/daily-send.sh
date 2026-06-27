#!/usr/bin/env bash
# daily-send.sh — fully autonomous daily outreach. Sources fresh leads + sends.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"
LOG="$HERE/data/daily-send-$(date +%Y%m%d).log"
echo "=== Waimd daily send $(date -u +%FT%TZ) ===" | tee -a "$LOG"

# Source next batch of 200
node pipeline.mjs --commit --batch 200 >> "$LOG" 2>&1

# Drip follow-ups FIRST (Day 4 / Day 8 are time-sensitive) — first claim on the day's ramped budget.
# Same rails as the step-1 sender; reads the store directly, drops anyone who clicked or unsubscribed.
echo "Running drip follow-ups" | tee -a "$LOG"
node --env-file=../../.env sequence-send.mjs --send --i-approve >> "$LOG" 2>&1

# Then Email 1 — drains the OLDEST/most-urgent queued leads from the store (not just today's batch),
# using whatever warmup budget remains for today.
echo "Sending Email 1 (store-drain, most-urgent first)" | tee -a "$LOG"
node --env-file=../../.env send-scheduled.mjs --send --i-approve >> "$LOG" 2>&1

echo "=== Done $(date -u +%FT%TZ) ===" | tee -a "$LOG"
