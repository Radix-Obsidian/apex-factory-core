# The Carrier's Almanac — newsletter

A Blinkist-style FMCSA briefing for brand-new interstate carriers. Each issue is one **big idea +
key takeaways**, designed to be read in ~2 minutes, build trust, and drive to the free dated
roadmap at **https://waimd.org**.

Visual identity matches the Waimd product ("The Carrier's Almanac"): deep ink on warm paper, a DOT
safety-red accent, brass for deadlines, a serif display headline against mono for data. The email
itself is table-layout + inline CSS so it survives Gmail, Outlook, and Apple Mail intact.

---

## Issue format

Each issue is a markdown file in `issues/` with YAML-ish front matter and an optional body note.
Filenames are zero-padded and slugged: `NNNN-the-slug.md` (e.g. `0001-the-audit-clock.md`). The
leading number becomes the issue number; the slug becomes UTM `utm_content`.

```markdown
---
title: A sharp big-idea headline               # required
subject: Optional distinct email subject line  # optional (defaults to title)
dek: >                                          # required — 2-3 sentence hook
  The hook. What this issue is about and why it matters right now.
date: June 25, 2026                             # optional (defaults to today)
issueNo: 1                                       # optional (defaults to filename number)
takeaways:                                       # required — 3 to 5 crisp points
  - "**Bolded lead-in.** Then the explanation. `49 CFR` renders in mono."
  - "Second takeaway."
  - "Third takeaway."
doThisNow: One concrete action the reader can take today.   # required
cfr:                                              # optional — the relevant cite(s)
  - 49 CFR Part 385, Subpart D
---

Optional closing body note (plain prose). Currently not rendered into the email
template, but kept with the issue for editorial context.
```

Inline formatting supported in `dek`, `takeaways`, and `doThisNow`:

- `**bold**` → emphasized ink
- `` `code` `` → monospace, DOT-red (use for CFR tokens, dates, field names)

### Content rules (non-negotiable)

- **FMCSA accuracy is critical.** These are real federal requirements. State them carefully and
  conservatively; prefer "generally" / "usually" over absolutes when timing or edge cases vary.
- Every issue carries the standard disclaimer in the footer:
  *"Decision-support, not legal advice. Always verify against FMCSA."*
- Keep each issue **~150–250 words** total. Short and skimmable beats comprehensive.
- One **single CTA** only — the free dated roadmap. No competing links.

---

## Rendering

`render.mjs` reads an issue and produces an inline-styled HTML email plus a plaintext alternative.

```bash
# Write <issue>.html next to the source, print subject/issue/paths
node render.mjs issues/0001-the-audit-clock.md

# Print the HTML to stdout (pipe to a file or a browser)
node render.mjs issues/0001-the-audit-clock.md --stdout > /tmp/preview.html

# Print the plaintext alternative
node render.mjs issues/0001-the-audit-clock.md --text
```

From the repo root:

```bash
node gtm/waimd/newsletter/render.mjs gtm/waimd/newsletter/issues/0001-the-audit-clock.md
```

The renderer **validates** every issue (title, dek, 1–6 takeaways, doThisNow) and **fails loudly**
rather than emit a half-built email. Read time and issue number are derived automatically.

Programmatic use:

```js
import { parseIssue, renderIssue } from "./render.mjs";
const issue = parseIssue(fs.readFileSync("issues/0001-the-audit-clock.md", "utf8"));
const { subject, html, text } = renderIssue(issue, { issueNo: "1", date: "June 25, 2026" });
```

---

## Sending

Sending is **not** wired into this renderer by design. It goes out through the existing Waimd GTM
engine (`../send.mjs` / `../send-scheduled.mjs` via Brevo), which enforces every compliance rail:
suppression list, daily cap, `List-Unsubscribe` header, a truthful from-address, and the CAN-SPAM
postal address.

**Gated on domain warmup.** Like cold outreach, newsletter sending stays off until the dedicated
sending domain (`outreach.waimd.org`) is warmed and the daily cap is deliberately raised — this is
Brevo-gated and a founder decision, never automatic. To wire an issue into a send, hand
`renderIssue()`'s `{ subject, html, text }` to the sender's batch shape; the rails in `send.mjs`
do the rest.

The footer's seller identity and postal address (`Voco Technologies, Inc.`,
`850 New Burton Road, Suite 201, Dover, DE 19904`) are baked into the template so every rendered
issue is CAN-SPAM-shaped before it ever reaches the sender.
