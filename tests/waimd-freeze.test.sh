#!/usr/bin/env bash
# tests/waimd-freeze.test.sh — D24 outreach-freeze acceptance. Proves the kill guard covers EVERY sender
# entrypoint (not just send.mjs) via the sendOne() chokepoint, and that the teardown stays visible.
set -u
cd "$(dirname "$0")/.."
fail=0
ok() { echo "✓ $1"; }
no() { echo "✗ $1"; fail=1; }

# 1. shared guard: frozen (dot-navigator killed) AND assertNotFrozen() throws
node -e "import('./gtm/waimd/kill-guard.mjs').then(m=>{if(!m.SKU_FROZEN)process.exit(1);try{m.assertNotFrozen();process.exit(2)}catch{process.exit(0)}})" 2>/dev/null \
  && ok "kill-guard: frozen + assertNotFrozen throws" || no "kill-guard freeze"

# 2. sendOne chokepoint refuses (assert is the first line, before any network)
node -e "import('./gtm/waimd/transport.mjs').then(async m=>{try{await m.sendOne({email:'x'},{to:'a@b.c',subject:'s',html:'h',text:'t',unsubscribeUrl:'u'});process.exit(1)}catch(e){process.exit(/frozen/i.test(e.message)?0:3)}})" 2>/dev/null \
  && ok "sendOne chokepoint refuses when frozen" || no "sendOne chokepoint"

# 3. cron entrypoints (daily-send.sh calls these) exit without sending
node gtm/waimd/send-scheduled.mjs 2>&1 | grep -qi "frozen" && ok "send-scheduled.mjs refuses" || no "send-scheduled.mjs refuses"
node gtm/waimd/sequence-send.mjs 2>&1 | grep -qi "frozen" && ok "sequence-send.mjs refuses" || no "sequence-send.mjs refuses"

# 4. teardown stays visible: killed + !teardown_complete is surfaced
n=$(node -e "import('./ops/registry.mjs').then(m=>{const r=m.loadRegistry();console.log(r.skus.filter(x=>x.status==='killed'&&!x.teardown_complete).length)})" 2>/dev/null)
[ "$n" = "1" ] && ok "teardown surfaced (killed + not complete)" || no "teardown surfaced (got '$n')"

[ "$fail" -eq 0 ] && echo "waimd-freeze-test: OK" || { echo "waimd-freeze-test: FAILED"; exit 1; }
