#!/usr/bin/env node
// render.mjs — "The Carrier's Almanac" newsletter renderer.
//
// Reads a Blinkist-style issue (YAML-ish front matter + body) and renders TWO outputs:
//   1. A responsive, INLINE-styled HTML email (table layout, email-client safe).
//   2. A clean plaintext alternative (the textContent every CAN-SPAM email must carry).
//
// The visual identity mirrors the Waimd product ("The Carrier's Almanac"): deep ink on warm
// paper, a confident DOT safety-red, brass for deadlines, a serif display headline against mono
// for data. Email clients strip <style> and ignore web fonts, so we inline everything and lean on
// Georgia (serif) + a monospace stack as the closest universally-available analogs to
// Spectral + JetBrains Mono.
//
// CLI:
//   node render.mjs issues/0001-the-audit-clock.md            # write HTML next to the issue, print path
//   node render.mjs issues/0001-the-audit-clock.md --stdout   # print HTML to stdout (no file written)
//   node render.mjs issues/0001-the-audit-clock.md --text     # print the plaintext version
//
// Programmatic: `import { renderIssue, parseIssue } from "./render.mjs"`.
//   renderIssue(issue) -> { subject, html, text }

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Brand — close hex equivalents of the product's oklch "Almanac" palette.
// ---------------------------------------------------------------------------
export const BRAND = {
  ink: "#23201c", // deep ink (body text / masthead)
  ink2: "#4a443c", // softened ink (secondary copy)
  muted: "#8a8073", // captions, fine print
  paper: "#f6f1e7", // warm paper (page background)
  paper2: "#efe7d8", // slightly deeper paper (panels)
  surface: "#fffdf8", // card surface
  line: "#e0d6c4", // hairlines
  red: "#c4332b", // DOT safety red (accent / CTA)
  red2: "#a32a23", // pressed red
  brass: "#b9892f", // brass — deadlines / the clock
  good: "#3f7d54", // confirmation green (used sparingly)
  serif: "Georgia, 'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', 'Times New Roman', serif",
  mono: "'JetBrains Mono', ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace",
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

// Single CTA destination — the free dated roadmap.
export const CTA = {
  url: "https://waimd.org",
  label: "Build your free 18-month roadmap",
};

// Legal / CAN-SPAM identity (kept here so the footer is never improvised).
export const IDENTITY = {
  product: "Waimd",
  tagline: "The Carrier's Almanac",
  seller: "Voco Technologies, Inc.",
  postal: "850 New Burton Road, Suite 201, Dover, DE 19904",
  disclaimer: "Decision-support, not legal advice. Always verify against FMCSA.",
  unsubscribeBase: process.env.WAIMD_UNSUBSCRIBE_BASE || "https://waimd.org/unsubscribe",
};

// ---------------------------------------------------------------------------
// Parsing — a small, dependency-free front-matter reader.
//   - Scalars:  key: value
//   - Lists:    key:\n  - item\n  - item   (or  key: [a, b, c])
//   Everything after the closing `---` is treated as optional body markdown
//   (currently unused by the template, but parsed so issues can carry notes).
// ---------------------------------------------------------------------------
export function parseIssue(raw) {
  const text = String(raw).replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const fm = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fm) throw new Error("missing YAML-ish front matter (expected a leading --- … --- block)");

  const meta = {};
  const lines = fm[1].split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) {
      i++;
      continue;
    }
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1];
    const rest = m[2].trim();

    if (rest === "|" || rest === ">") {
      // Block scalar: collect following indented lines. `>` folds to spaces,
      // `|` keeps newlines. Blank lines become paragraph breaks either way.
      const fold = rest === ">";
      const collected = [];
      let j = i + 1;
      while (j < lines.length && (lines[j].trim() === "" || /^\s+\S/.test(lines[j]))) {
        // Stop if we hit a line that looks like the next `key:` at column 0.
        if (lines[j].trim() !== "" && /^[A-Za-z0-9_]+:\s/.test(lines[j])) break;
        collected.push(lines[j].replace(/^\s{1,4}/, ""));
        j++;
      }
      let value;
      if (fold) {
        value = collected
          .join("\n")
          .split(/\n\s*\n/)
          .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
          .filter(Boolean)
          .join("\n\n")
          .trim();
      } else {
        value = collected.join("\n").replace(/\n+$/, "");
      }
      meta[key] = value;
      i = j;
      continue;
    }

    if (rest === "") {
      // Block list: collect following "  - " lines.
      const items = [];
      let j = i + 1;
      while (j < lines.length && /^\s*-\s+/.test(lines[j])) {
        items.push(stripQuotes(lines[j].replace(/^\s*-\s+/, "").trim()));
        j++;
      }
      meta[key] = items;
      i = j;
      continue;
    }

    if (rest.startsWith("[") && rest.endsWith("]")) {
      meta[key] = rest
        .slice(1, -1)
        .split(",")
        .map((s) => stripQuotes(s.trim()))
        .filter(Boolean);
      i++;
      continue;
    }

    meta[key] = stripQuotes(rest);
    i++;
  }

  return { ...meta, body: (fm[2] || "").trim() };
}

function stripQuotes(s) {
  if (s.length >= 2 && ((s[0] === '"' && s.at(-1) === '"') || (s[0] === "'" && s.at(-1) === "'"))) {
    return s.slice(1, -1);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Validation — fail fast and loud. A malformed issue should never render
// half an email.
// ---------------------------------------------------------------------------
function validate(issue) {
  const errs = [];
  if (!issue.title) errs.push("title is required");
  if (!issue.dek) errs.push("dek (the hook) is required");
  if (!Array.isArray(issue.takeaways) || issue.takeaways.length < 1) {
    errs.push("takeaways must be a non-empty list");
  }
  if (issue.takeaways && issue.takeaways.length > 6) {
    errs.push("takeaways should be 3-5 items (skimmable); got " + issue.takeaways.length);
  }
  if (!issue.doThisNow) errs.push("doThisNow is required");
  if (errs.length) throw new Error("invalid issue:\n  - " + errs.join("\n  - "));
}

// ---------------------------------------------------------------------------
// HTML escaping + a deliberately tiny inline-markdown pass (bold + code only),
// so issue copy can emphasize a deadline or a CFR token without raw HTML.
// ---------------------------------------------------------------------------
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function inline(s) {
  let out = esc(s);
  out = out.replace(/\*\*(.+?)\*\*/g, `<strong style="color:${BRAND.ink};font-weight:700">$1</strong>`);
  out = out.replace(
    /`([^`]+?)`/g,
    `<span style="font-family:${BRAND.mono};font-size:0.92em;color:${BRAND.red2}">$1</span>`,
  );
  return out;
}

// ---------------------------------------------------------------------------
// HTML email — table layout, fully inline styles. Width-capped at 600px, fluid
// below. Outlook-safe: no flex, no grid, no positioned elements.
// ---------------------------------------------------------------------------
export function renderHtml(issue, opts = {}) {
  const { issueNo = "", date = "", readMins = "2" } = opts;
  const ctaUrl = withUtm(CTA.url, issue);
  const unsubUrl = IDENTITY.unsubscribeBase;
  const eyebrow = "THE 2-MINUTE BRIEFING";

  const takeawayRows = issue.takeaways
    .map(
      (t, idx) => `
            <tr>
              <td valign="top" width="34" style="padding:0 12px 14px 0;">
                <span style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;font-family:${BRAND.mono};font-size:12px;font-weight:700;color:${BRAND.paper};background:${BRAND.ink};border-radius:50%;">${idx + 1}</span>
              </td>
              <td valign="top" style="padding:0 0 14px 0;font-family:${BRAND.sans};font-size:16px;line-height:1.5;color:${BRAND.ink2};">
                ${inline(t)}
              </td>
            </tr>`,
    )
    .join("");

  const cfrLine =
    Array.isArray(issue.cfr) && issue.cfr.length
      ? `<tr><td style="padding:18px 0 0 0;font-family:${BRAND.mono};font-size:12px;letter-spacing:0.04em;color:${BRAND.muted};">REGS &nbsp;&middot;&nbsp; ${issue.cfr.map((c) => esc(c)).join(" &nbsp;&middot;&nbsp; ")}</td></tr>`
      : "";

  const dekHtml = inline(issue.dek);

  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light only" />
<title>${esc(issue.title)}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
  /* Progressive enhancement only — every critical style is also inline. */
  body { margin:0; padding:0; width:100% !important; background:${BRAND.paper}; }
  a { text-decoration:none; }
  .px { padding-left:40px !important; padding-right:40px !important; }
  @media only screen and (max-width:620px) {
    .px { padding-left:24px !important; padding-right:24px !important; }
    .hero-title { font-size:30px !important; line-height:1.12 !important; }
    .cta-btn { display:block !important; width:100% !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.paper};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${BRAND.paper};">
    ${esc(issue.dek)} &mdash; a 2-minute briefing from ${IDENTITY.product}.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.paper};">
    <tr>
      <td align="center" style="padding:28px 12px 40px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${BRAND.surface};border:1px solid ${BRAND.line};border-radius:14px;overflow:hidden;">

          <!-- Masthead -->
          <tr>
            <td class="px" style="padding:26px 40px 22px 40px;background:${BRAND.ink};border-bottom:3px solid ${BRAND.red};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" style="font-family:${BRAND.serif};font-size:21px;font-weight:700;letter-spacing:0.01em;color:${BRAND.paper};">
                    ${esc(IDENTITY.product)}
                    <span style="color:${BRAND.brass};font-weight:400;"> &middot; ${esc(IDENTITY.tagline)}</span>
                  </td>
                  <td align="right" style="font-family:${BRAND.mono};font-size:11px;letter-spacing:0.08em;color:${BRAND.muted};white-space:nowrap;">
                    ${issueNo ? "No. " + esc(issueNo) : ""}${issueNo && date ? " &nbsp;/&nbsp; " : ""}${date ? esc(date) : ""}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Briefing eyebrow + read time -->
          <tr>
            <td class="px" style="padding:30px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" style="font-family:${BRAND.mono};font-size:11px;letter-spacing:0.16em;font-weight:700;color:${BRAND.red};">
                    ${eyebrow}
                  </td>
                  <td align="right" style="font-family:${BRAND.mono};font-size:11px;letter-spacing:0.06em;color:${BRAND.muted};white-space:nowrap;">
                    &#9201; ${esc(readMins)} MIN READ
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Big idea headline -->
          <tr>
            <td class="px" style="padding:14px 40px 0 40px;">
              <h1 class="hero-title" style="margin:0;font-family:${BRAND.serif};font-size:38px;line-height:1.08;font-weight:700;letter-spacing:-0.01em;color:${BRAND.ink};">
                ${esc(issue.title)}
              </h1>
            </td>
          </tr>

          <!-- Dek / hook -->
          <tr>
            <td class="px" style="padding:18px 40px 0 40px;">
              <p style="margin:0;font-family:${BRAND.serif};font-size:18px;line-height:1.55;color:${BRAND.ink2};">
                ${dekHtml}
              </p>
            </td>
          </tr>

          <!-- Rule -->
          <tr>
            <td class="px" style="padding:26px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                <td style="border-top:1px solid ${BRAND.line};font-size:0;line-height:0;">&nbsp;</td>
              </tr></table>
            </td>
          </tr>

          <!-- Key takeaways -->
          <tr>
            <td class="px" style="padding:24px 40px 0 40px;">
              <p style="margin:0 0 18px 0;font-family:${BRAND.mono};font-size:11px;letter-spacing:0.16em;font-weight:700;color:${BRAND.brass};">
                KEY TAKEAWAYS
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${takeawayRows}
              </table>
            </td>
          </tr>

          <!-- Do this now -->
          <tr>
            <td class="px" style="padding:10px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.paper2};border-left:4px solid ${BRAND.red};border-radius:8px;">
                <tr>
                  <td style="padding:18px 22px;">
                    <p style="margin:0 0 6px 0;font-family:${BRAND.mono};font-size:11px;letter-spacing:0.14em;font-weight:700;color:${BRAND.red2};">
                      &#9656; DO THIS NOW
                    </p>
                    <p style="margin:0;font-family:${BRAND.sans};font-size:16px;line-height:1.5;color:${BRAND.ink};">
                      ${inline(issue.doThisNow)}
                    </p>
                    ${cfrLine}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Single CTA -->
          <tr>
            <td class="px" style="padding:30px 40px 4px 40px;" align="center">
              <p style="margin:0 0 16px 0;font-family:${BRAND.serif};font-size:17px;line-height:1.5;color:${BRAND.ink2};">
                ${esc(issue.ctaLead || "Your audit window has a date. So should your prep.")}
              </p>
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(ctaUrl)}" style="height:50px;v-text-anchor:middle;width:340px;" arcsize="14%" strokecolor="${BRAND.red2}" fillcolor="${BRAND.red}">
                <w:anchorlock/>
                <center style="color:${BRAND.paper};font-family:sans-serif;font-size:16px;font-weight:bold;">${esc(CTA.label)}</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <a class="cta-btn" href="${esc(ctaUrl)}" style="display:inline-block;background:${BRAND.red};color:${BRAND.paper};font-family:${BRAND.sans};font-size:16px;font-weight:700;line-height:50px;text-align:center;text-decoration:none;padding:0 32px;border-radius:8px;border:1px solid ${BRAND.red2};">
                ${esc(CTA.label)} &rarr;
              </a>
              <!--<![endif]-->
              <p style="margin:14px 0 0 0;font-family:${BRAND.mono};font-size:11px;letter-spacing:0.04em;color:${BRAND.muted};">
                Free &middot; dated to your authority &middot; no card
              </p>
            </td>
          </tr>

          <!-- Disclaimer -->
          <tr>
            <td class="px" style="padding:28px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                <td style="border-top:1px solid ${BRAND.line};padding-top:16px;font-family:${BRAND.sans};font-size:12px;line-height:1.5;color:${BRAND.muted};">
                  ${esc(IDENTITY.disclaimer)}
                </td>
              </tr></table>
            </td>
          </tr>

          <!-- Footer / CAN-SPAM -->
          <tr>
            <td class="px" style="padding:20px 40px 30px 40px;background:${BRAND.paper};border-top:1px solid ${BRAND.line};">
              <p style="margin:0 0 6px 0;font-family:${BRAND.serif};font-size:14px;font-weight:700;color:${BRAND.ink};">
                ${esc(IDENTITY.product)} &mdash; ${esc(IDENTITY.tagline)}
              </p>
              <p style="margin:0 0 10px 0;font-family:${BRAND.sans};font-size:12px;line-height:1.5;color:${BRAND.muted};">
                ${esc(IDENTITY.seller)} &middot; ${esc(IDENTITY.postal)}
              </p>
              <p style="margin:0;font-family:${BRAND.sans};font-size:12px;line-height:1.5;color:${BRAND.muted};">
                You&#39;re receiving this 2-minute briefing because you signed up for ${esc(IDENTITY.product)} compliance updates.
                <a href="${esc(unsubUrl)}" style="color:${BRAND.red2};text-decoration:underline;">Unsubscribe</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Plaintext alternative — readable on its own, every link spelled out.
// ---------------------------------------------------------------------------
export function renderText(issue, opts = {}) {
  const { issueNo = "", date = "" } = opts;
  const ctaUrl = withUtm(CTA.url, issue);
  const strip = (s) => String(s).replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+?)`/g, "$1");
  const rule = "=".repeat(60);

  const head = [
    `${IDENTITY.product.toUpperCase()} — ${IDENTITY.tagline}`,
    [issueNo ? `No. ${issueNo}` : "", date].filter(Boolean).join("  /  "),
    "THE 2-MINUTE BRIEFING",
    rule,
    "",
    strip(issue.title),
    "",
    strip(issue.dek),
    "",
    "KEY TAKEAWAYS",
  ];

  const takeaways = issue.takeaways.map((t, i) => `  ${i + 1}. ${strip(t)}`);

  const action = ["", "DO THIS NOW", `  ${strip(issue.doThisNow)}`];

  const cfr =
    Array.isArray(issue.cfr) && issue.cfr.length ? ["", "REGS: " + issue.cfr.join("  ·  ")] : [];

  const cta = [
    "",
    rule,
    `${CTA.label}:`,
    `  ${ctaUrl}`,
    "Free · dated to your authority · no card.",
    "",
    IDENTITY.disclaimer,
    "",
    rule,
    `${IDENTITY.product} — ${IDENTITY.tagline}`,
    `${IDENTITY.seller} · ${IDENTITY.postal}`,
    `Unsubscribe: ${IDENTITY.unsubscribeBase}`,
  ];

  return [...head, ...takeaways, ...action, ...cfr, ...cta].join("\n") + "\n";
}

// Append UTM attribution to the CTA so newsletter conversions are traceable.
function withUtm(url, issue) {
  const u = new URL(url);
  u.searchParams.set("utm_source", "email");
  u.searchParams.set("utm_medium", "newsletter");
  u.searchParams.set("utm_campaign", "carriers-almanac");
  if (issue.slug) u.searchParams.set("utm_content", issue.slug);
  return u.toString();
}

// ---------------------------------------------------------------------------
// Top-level: file → fully rendered issue.
// ---------------------------------------------------------------------------
export function renderIssue(issue, opts = {}) {
  validate(issue);
  const subject = issue.subject || issue.title;
  return {
    subject,
    html: renderHtml(issue, opts),
    text: renderText(issue, opts),
  };
}

// Derive issue No. + slug + read-time estimate from the filename + content.
function deriveMeta(filePath, issue) {
  const base = path.basename(filePath).replace(/\.md$/i, "");
  const m = base.match(/^(\d+)[-_]?(.*)$/);
  const issueNo = issue.issueNo || (m ? String(Number(m[1])) : "");
  const slug = issue.slug || (m ? m[2] : base);
  const words =
    [issue.title, issue.dek, ...(issue.takeaways || []), issue.doThisNow]
      .join(" ")
      .split(/\s+/)
      .filter(Boolean).length;
  const readMins = String(Math.max(1, Math.round(words / 180)));
  const date =
    issue.date ||
    new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return { issueNo, slug, readMins, date };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error(
      "usage: node render.mjs <issue.md> [--stdout|--text]\n" +
        "  (default: writes <issue>.html next to the source and prints its path)",
    );
    process.exit(1);
  }
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    console.error(`render: file not found: ${abs}`);
    process.exit(1);
  }

  let issue;
  try {
    issue = parseIssue(fs.readFileSync(abs, "utf8"));
    issue.slug = issue.slug; // keep explicit slug if present
  } catch (err) {
    console.error(`render: failed to parse ${path.basename(abs)}: ${err.message}`);
    process.exit(1);
  }

  const meta = deriveMeta(abs, issue);
  issue.slug = issue.slug || meta.slug;

  let out;
  try {
    out = renderIssue(issue, meta);
  } catch (err) {
    console.error(`render: ${err.message}`);
    process.exit(1);
  }

  if (args.includes("--text")) {
    process.stdout.write(out.text);
    return;
  }
  if (args.includes("--stdout")) {
    process.stdout.write(out.html);
    return;
  }

  const htmlPath = abs.replace(/\.md$/i, ".html");
  fs.writeFileSync(htmlPath, out.html);
  console.log(`subject: ${out.subject}`);
  console.log(`issue:   No. ${meta.issueNo} · ${meta.date} · ~${meta.readMins} min`);
  console.log(`html:    ${htmlPath} (${out.html.length} bytes)`);
  console.log(`text:    ${out.text.length} bytes (in-memory; use --text to print)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
