#!/usr/bin/env node
// ops/content/repurpose.mjs — turns REAL recent activity into ready-to-post content seeds:
// recent commits (factory-core + dot-navigator) + the newest build-in-public entries + a portfolio
// snapshot (if the registry is readable). Output is a dated markdown file under content/repurpose/
// with an X/Twitter thread, a LinkedIn post, and a newsletter angle — plain, honest, no hype, and
// derived ONLY from what actually happened.
//
//   node ops/content/repurpose.mjs            # last 14 days of activity → content/repurpose/<date>.md
//   node ops/content/repurpose.mjs --days 21
//
// $0, no LLM, never charges, never commits. Any missing input is skipped without crashing.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const HOME = os.homedir();
const FACTORY = path.join(HOME, "factory-core");
const BIP_DIR = path.join(FACTORY, "build-in-public");
const REGISTRY = path.join(FACTORY, "skus", "registry.json");
const OUT_DIR = path.join(FACTORY, "content", "repurpose");

const REPOS = [
  { label: "factory-core", dir: FACTORY },
  { label: "dot-navigator", dir: path.join(HOME, "dot-navigator") },
];

function parseDays(argv) {
  const i = argv.indexOf("--days");
  if (i !== -1 && argv[i + 1]) {
    const n = parseInt(argv[i + 1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 14;
}

function readCommits(repoDir, label, days) {
  if (!fs.existsSync(repoDir)) return [];
  try {
    const out = execFileSync(
      "git",
      ["-C", repoDir, "log", `--since=${days} days ago`, "--no-merges", "--pretty=format:%s\x1f%cI"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
    if (!out) return [];
    return out
      .split("\n")
      .map((line) => {
        const [subject, iso] = line.split("\x1f");
        if (!subject) return null;
        const m = subject.match(/^(\w+)(?:\([^)]*\))?!?:\s*(.+)$/);
        return {
          repo: label,
          type: m ? m[1].toLowerCase() : "other",
          desc: m ? m[2].trim() : subject.trim(),
          date: (iso || "").slice(0, 10),
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

// Newest build-in-public entries (numbered NNNN-*.md), excluding README. Returns [{num,title,date,why}].
function readBip(limit = 3) {
  if (!fs.existsSync(BIP_DIR)) return [];
  let files;
  try {
    files = fs.readdirSync(BIP_DIR).filter((f) => /^\d{3,}-.*\.md$/.test(f));
  } catch {
    return [];
  }
  files.sort().reverse(); // highest number = newest
  const out = [];
  for (const f of files.slice(0, limit)) {
    try {
      const raw = fs.readFileSync(path.join(BIP_DIR, f), "utf8");
      const titleLine = raw.split("\n").find((l) => l.startsWith("# ")) || "";
      const dateLine = raw.split("\n").find((l) => /\*\*Date:\*\*/.test(l)) || "";
      const title = titleLine.replace(/^#\s*\d*\s*[—-]?\s*/, "").trim() || f;
      const date = (dateLine.match(/\*\*Date:\*\*\s*(.+)/) || [])[1]?.trim() || "";
      // The WHOLE first prose paragraph after a "What happened" heading (BiP entries are hard-wrapped, so a
      // single line is a truncated fragment). Collect until the paragraph's blank line, join, then keep ~2
      // sentences so the seed reads as a clean hook rather than the full section.
      const lines = raw.split("\n").map((l) => l.trim());
      let why = "";
      const whIdx = lines.findIndex((l) => /^##\s+What happened/i.test(l));
      const start = whIdx === -1 ? 0 : whIdx + 1;
      const para = [];
      for (let i = start; i < lines.length; i++) {
        const l = lines[i];
        if (l.startsWith("#") || l.startsWith("**")) {
          if (para.length) break; // next heading after we have the paragraph
          continue; // skip headings/labels before the prose begins
        }
        if (!l) {
          if (para.length) break; // blank line ends the paragraph
          continue; // skip leading blanks
        }
        para.push(l);
      }
      why = para.join(" ").replace(/\s+/g, " ").trim();
      const sentences = why.match(/[^.!?]+[.!?]+/g);
      if (sentences && sentences.length > 2) why = sentences.slice(0, 2).join(" ").trim();
      out.push({ num: f.match(/^(\d+)/)?.[1] || "", title, date, why });
    } catch {
      /* skip unreadable entry */
    }
  }
  return out;
}

// Portfolio snapshot from the registry, if present and parseable. Never throws.
function readPortfolio() {
  if (!fs.existsSync(REGISTRY)) return null;
  try {
    const reg = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
    const skus = Array.isArray(reg.skus) ? reg.skus : [];
    return {
      total: skus.length,
      live: skus.filter((s) => s.status === "live").length,
      items: skus.map((s) => ({
        slug: s.slug,
        status: s.status,
        url: s.live_url || "",
        domain: s.domain || "",
      })),
    };
  } catch {
    return null;
  }
}

// ---- content composition (deterministic, derived only from the inputs above) ----

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function summarizeActivity(commits) {
  const counts = {};
  for (const c of commits) counts[c.type] = (counts[c.type] || 0) + 1;
  const parts = [];
  for (const [t, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    parts.push(`${n} ${t}`);
  }
  return parts.join(", ");
}

function pickHighlights(commits, n = 5) {
  // Prefer feat/fix (most reader-relevant), then everything else, preserving recency order.
  const ranked = [...commits].sort((a, b) => {
    const w = (t) => (t === "feat" ? 0 : t === "fix" ? 1 : t === "perf" ? 2 : 3);
    return w(a.type) - w(b.type);
  });
  return ranked.slice(0, n);
}

function buildThread(commits, bip, portfolio, days) {
  const posts = [];
  const lead = bip[0];
  if (lead) {
    posts.push(`Building in public — last ${days} days at the factory.\n\n${lead.title}.${lead.why ? ` ${lead.why}` : ""}`);
  } else {
    posts.push(`Building in public — what shipped in the last ${days} days at the factory.`);
  }

  const highlights = pickHighlights(commits, 4);
  for (const h of highlights) {
    posts.push(`${cap(h.desc)}\n\n(${h.repo}, ${h.type})`);
  }

  if (portfolio) {
    posts.push(
      `Where the portfolio stands: ${portfolio.live}/${portfolio.total} SKU(s) live.` +
        (portfolio.items[0]?.url ? ` First one's at ${portfolio.items[0].url}.` : "")
    );
  }

  // Trim to 3-5 posts.
  const trimmed = posts.slice(0, 5);
  while (trimmed.length < 3 && commits.length) trimmed.push(`More: ${cap(commits[trimmed.length]?.desc || "work in progress")}.`);
  return trimmed.map((p, i) => `**${i + 1}/${trimmed.length}**\n${p}`).join("\n\n");
}

function buildLinkedIn(commits, bip, portfolio, days) {
  const lead = bip[0];
  const lines = [];
  if (lead) {
    lines.push(`${lead.title}.`);
    if (lead.why) lines.push("", lead.why);
  } else {
    lines.push(`A quiet ${days} days of building.`);
  }
  lines.push("", "What actually changed:");
  for (const h of pickHighlights(commits, 5)) lines.push(`• ${cap(h.desc)} (${h.repo})`);
  if (portfolio) {
    lines.push("", `Portfolio: ${portfolio.live} of ${portfolio.total} product(s) live.`);
  }
  lines.push("", "No launch theater — just the log.");
  return lines.join("\n");
}

function buildNewsletter(commits, bip, portfolio, days) {
  const lead = bip[0];
  const angle = lead
    ? `"${lead.title}" — the honest version of what shipped`
    : `What shipped in the last ${days} days (the log, not the hype)`;
  const supporting = pickHighlights(commits, 3)
    .map((h) => `${cap(h.desc)} (${h.repo})`)
    .join("; ");
  return [
    `**Angle:** ${angle}`,
    "",
    `**Open with:** ${lead?.why || `${commits.length} commit(s) across ${REPOS.length} repos this period.`}`,
    "",
    `**Back it with:** ${supporting || "recent commits"}.`,
    portfolio ? `\n**Proof point:** ${portfolio.live}/${portfolio.total} SKU(s) live${portfolio.items[0]?.url ? ` (${portfolio.items[0].url})` : ""}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function main() {
  const days = parseDays(process.argv.slice(2));

  const commits = [];
  for (const { label, dir } of REPOS) commits.push(...readCommits(dir, label, days));
  const bip = readBip(3);
  const portfolio = readPortfolio();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const outFile = path.join(OUT_DIR, `${today}.md`);

  // Empty-everything guard: still write a usable, honest file.
  const haveActivity = commits.length || bip.length;

  const doc = [
    `# Content seeds — ${today}`,
    "",
    `> Derived only from real activity in the last ${days} days. Plain and honest, no hype. Edit before posting.`,
    "",
    `**Source signal:** ${commits.length} commit(s) [${summarizeActivity(commits) || "none"}], ${bip.length} build-in-public entr${bip.length === 1 ? "y" : "ies"}, portfolio ${portfolio ? "available" : "unavailable"}.`,
    "",
    "---",
    "",
    "## X / Twitter thread",
    "",
    haveActivity ? buildThread(commits, bip, portfolio, days) : "_No activity in window — nothing to post. Ship something first._",
    "",
    "---",
    "",
    "## LinkedIn post",
    "",
    haveActivity ? buildLinkedIn(commits, bip, portfolio, days) : "_No activity in window._",
    "",
    "---",
    "",
    "## Newsletter angle",
    "",
    haveActivity ? buildNewsletter(commits, bip, portfolio, days) : "_No activity in window._",
    "",
  ].join("\n");

  fs.writeFileSync(outFile, doc);
  console.log(`repurpose: wrote ${outFile} (${commits.length} commits, ${bip.length} bip entries, portfolio ${portfolio ? "yes" : "no"})`);
  return outFile;
}

main();
