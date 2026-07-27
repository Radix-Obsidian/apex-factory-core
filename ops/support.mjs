#!/usr/bin/env node
// ops/support.mjs — deterministic support TRIAGE + the irreversible-action ANDON CORD. It loads a SKU's
// inbound queue, classifies each message, and GATES anything irreversible (refund, dispute, cancel,
// legal, data-deletion, press) to a FOUNDER ESCALATION — never an auto-action. It stages the rest for
// the factory-support agent to DRAFT; drafts are never auto-sent from here. $0, no LLM. This is the same
// "machine prepares, human commits the irreversible step" discipline as the publish+charge gate (D5).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistry, findSku } from './registry.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

// Irreversible / sensitive → escalate to founder. Default-to-escalate when any of these match.
const ESCALATE = [
  [/refund|charge[ -]?back|chargeback|dispute|money[ -]back|\bcharged?\b|\bcharging\b|\bovercharged?\b/i, 'money movement (refund/dispute)'],
  [/\bcancel|unsubscrib|stop (my )?(billing|subscription|payments?)|close (my )?account|terminate (my )?account/i, 'cancellation'],
  [/lawyer|legal|lawsuit|\bsue\b|attorney|liabilit/i, 'legal'],
  [/gdpr|ccpa|(delete|remove|erase) (my )?(account|data|information)|right to be forgotten/i, 'data-deletion / privacy'],
  [/press|journalist|media inquiry|reporter/i, 'press'],
];
const INFO_ONLY = [/^(thanks|thank you|got it|never ?mind|nm|cheers|all set)\b/i];

// pure: classify one message body.
export function triage(text) {
  const t = String(text || '');
  const reasons = [];
  for (const [re, why] of ESCALATE) if (re.test(t)) reasons.push(why);
  if (reasons.length) return { category: 'escalate', reasons };
  if (INFO_ONLY.some(re => re.test(t.trim()))) return { category: 'info', reasons: ['acknowledgement only'] };
  return { category: 'support', reasons: [] };
}

export function loadInbox(sku) {
  const src = sku.support?.source;
  if (!src || src === 'none') return { ok: true, items: [], note: 'no support source configured' };
  if (src === 'inbox-file') {
    const p = path.join(ROOT, sku.support.inbox || `ops/inbox/${sku.slug}.jsonl`);
    if (!fs.existsSync(p)) return { ok: true, items: [], note: `inbox empty (${path.relative(ROOT, p)} absent)` };
    const items = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l, i) => {
      try { return JSON.parse(l); } catch { return { id: `bad-${i}`, error: 'unparseable', raw: l }; }
    });
    return { ok: true, items };
  }
  return { ok: false, items: [], note: `unsupported support source: ${src}` };
}

export function triageInbox(sku) {
  const { items, note } = loadInbox(sku);
  const open = items.filter(m => m.status !== 'closed').map(m => ({
    id: m.id, from: m.from, subject: m.subject, received: m.received, text: m.text,
    ...triage(`${m.subject || ''} ${m.text || ''}`),
  }));
  return {
    slug: sku.slug,
    note,
    open: open.length,
    escalations: open.filter(t => t.category === 'escalate'),
    to_draft: open.filter(t => t.category === 'support'),
    info: open.filter(t => t.category === 'info'),
  };
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const json = process.argv.includes('--json');
  const slug = process.argv.find((a, i) => i >= 2 && !a.startsWith('--'));
  const reg = loadRegistry();
  const skus = slug
    ? [findSku(reg, slug)].filter(Boolean)
    : reg.skus.filter(s => s.support && s.support.source && s.support.source !== 'none' && s.status !== 'killed');
  const out = skus.map(triageInbox);
  if (json) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }
  console.log('— SUPPORT TRIAGE (drafts are never auto-sent; irreversible → founder) —');
  for (const r of out) {
    console.log(`  ${r.slug}: ${r.open} open · ${r.escalations.length} escalation(s) · ${r.to_draft.length} to draft${r.note ? ` · ${r.note}` : ''}`);
    for (const e of r.escalations) console.log(`    ⛔ ESCALATE #${e.id} — ${e.reasons.join(', ')} — "${(e.subject || e.text || '').slice(0, 60)}"`);
  }
}
