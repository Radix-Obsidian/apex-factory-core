#!/usr/bin/env bash
# daily-send.sh — fully autonomous daily outreach. Sources fresh leads + sends.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"
LOG="$HERE/data/daily-send-$(date +%Y%m%d).log"
echo "=== Waimd daily send $(date -u +%FT%TZ) ===" | tee -a "$LOG"

# Source next batch of 200
node pipeline.mjs --commit --batch 200 >> "$LOG" 2>&1

# Pick newest batch
BATCH=$(ls -1t data/batches/*.json 2>/dev/null | head -1)
if [ -z "$BATCH" ]; then echo "No batch found" | tee -a "$LOG"; exit 0; fi

echo "Sending batch: $BATCH" | tee -a "$LOG"
node --env-file=../../.env send-scheduled.mjs --batch "$BATCH" --send --i-approve >> "$LOG" 2>&1

# Send any due drip follow-ups (steps 2 & 3). Same rails as the step-1 sender; reads the store directly,
# drops anyone who clicked the roadmap link or unsubscribed. No-op until leads come due.
echo "Running drip follow-ups" | tee -a "$LOG"
node --env-file=../../.env sequence-send.mjs --send --i-approve >> "$LOG" 2>&1

echo "=== Done $(date -u +%FT%TZ) ===" | tee -a "$LOG"
