# ops/inbox/ — support queue (one JSONL file per SKU)

Each SKU whose registry entry has `support.source: "inbox-file"` reads its queue from
`ops/inbox/<slug>.jsonl` (path overridable via `support.inbox`). One JSON object per line:

```json
{"id": "t-001", "from": "carrier@example.com", "subject": "Where's my audit window?", "text": "I got my USDOT number last month, when is the safety audit due?", "received": "2026-06-22T14:00:00Z", "status": "open"}
```

| field | required | meaning |
|---|---|---|
| `id` | yes | stable ticket id |
| `text` | yes | message body (triaged together with `subject`) |
| `from` | no | sender |
| `subject` | no | subject line |
| `received` | no | ISO timestamp |
| `status` | no | `open` (default) or `closed` — closed items are skipped |

`ops/support.mjs` triages every open item: irreversible/sensitive ones (refund, cancellation, legal,
data-deletion, press) become **founder escalations**; the rest are **staged for factory-support to draft**.
Nothing here is ever auto-sent.

Real inbox files are git-ignored (they hold customer PII); commit only this README. A production wiring
replaces this file source with `support.source: "endpoint"` backed by the SKU's own `SupportTicket` table
(added by the Phase 3 `chassis` template).
