#!/usr/bin/env node
// ops/content/changelog.mjs — refreshes ~/factory-core/CHANGELOG.md from recent git history across
// BOTH the factory (factory-core) and the first SKU (dot-navigator). Commits are grouped by
// conventional-commit type and deduped by hash, so re-runs never duplicate a line. Covers the last
// ~14 days by default; pass --days N to widen/narrow the window.
//
//   node ops/content/changelog.mjs            # last 14 days, both repos → CHANGELOG.md
//   node ops/content/changelog.mjs --days 30  # last 30 days
//
// $0, no LLM, never charges, never commits. Missing repo / empty git output degrade to a clean run.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const HOME = os.homedir();
const FACTORY = path.join(HOME, "factory-core");
const CHANGELOG = path.join(FACTORY, "CHANGELOG.md");

// Repos we harvest history from. label is what shows up next to each commit line.
const REPOS = [
  { label: "factory-core", dir: FACTORY },
  { label: "dot-navigator", dir: path.join(HOME, "dot-navigator") },
];

const TYPE_ORDER = ["feat", "fix", "perf", "refactor", "docs", "test", "chore", "ci"];
const TYPE_HEADING = {
  feat: "Features",
  fix: "Fixes",
  perf: "Performance",
  refactor: "Refactors",
  docs: "Docs",
  test: "Tests",
  chore: "Chores",
  ci: "CI",
  other: "Other",
};

function parseDays(argv) {
  const i = argv.indexOf("--days");
  if (i !== -1 && argv[i + 1]) {
    const n = parseInt(argv[i + 1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 14;
}

// Read commits from one repo. Returns [] for a missing dir, a non-repo, or empty output — never throws.
function readCommits(repoDir, label, days) {
  if (!fs.existsSync(repoDir)) return [];
  try {
    // Unit-separated fields, record-separated rows: hash \x1f subject \x1f isoDate
    const out = execFileSync(
      "git",
      ["-C", repoDir, "log", `--since=${days} days ago`, "--no-merges", "--pretty=format:%H\x1f%s\x1f%cI"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
    if (!out) return [];
    return out
      .split("\n")
      .map((line) => {
        const [hash, subject, iso] = line.split("\x1f");
        if (!hash || !subject) return null;
        return { hash, subject: subject.trim(), date: (iso || "").slice(0, 10), repo: label };
      })
      .filter(Boolean);
  } catch {
    // not a git repo, git missing, or any git error — skip this source quietly
    return [];
  }
}

// "feat(eval): thing" → { type: "feat", desc: "thing" }; unknown prefixes → "other".
function classify(subject) {
  const m = subject.match(/^(\w+)(?:\([^)]*\))?!?:\s*(.+)$/);
  if (m) {
    const type = m[1].toLowerCase();
    if (TYPE_ORDER.includes(type)) return { type, desc: m[2].trim() };
  }
  return { type: "other", desc: subject };
}

// Hashes already recorded in CHANGELOG.md (we tag each line with <!--h:short-->) so we can dedupe.
function existingHashes(text) {
  const set = new Set();
  for (const m of text.matchAll(/<!--h:([0-9a-f]{7,40})-->/g)) set.add(m[1]);
  return set;
}

function buildSection(dateStr, commitsByType) {
  const lines = [`## ${dateStr}`, ""];
  const order = [...TYPE_ORDER, "other"];
  for (const type of order) {
    const items = commitsByType[type];
    if (!items || !items.length) continue;
    lines.push(`### ${TYPE_HEADING[type]}`, "");
    for (const c of items) {
      const short = c.hash.slice(0, 7);
      lines.push(`- ${c.desc} _(${c.repo})_ <!--h:${short}-->`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

function main() {
  const days = parseDays(process.argv.slice(2));

  let prior = "";
  if (fs.existsSync(CHANGELOG)) {
    try {
      prior = fs.readFileSync(CHANGELOG, "utf8");
    } catch {
      prior = "";
    }
  }
  const seen = existingHashes(prior);

  // Gather + dedupe (by short hash) across both repos.
  const fresh = [];
  for (const { label, dir } of REPOS) {
    for (const c of readCommits(dir, label, days)) {
      const short = c.hash.slice(0, 7);
      if (seen.has(short)) continue;
      seen.add(short);
      fresh.push(c);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const header = "# Changelog\n\nAuto-generated from git history across factory-core and its SKUs. Most recent first.\n";

  if (!fresh.length) {
    // Nothing new — ensure the file at least exists with a header, but don't add an empty section.
    if (!prior) {
      fs.writeFileSync(CHANGELOG, header);
      console.log(`changelog: created ${CHANGELOG} (no commits in last ${days} days)`);
    } else {
      console.log(`changelog: no new commits in last ${days} days; ${CHANGELOG} unchanged`);
    }
    return CHANGELOG;
  }

  const byType = {};
  for (const c of fresh) {
    const { type, desc } = classify(c.subject);
    (byType[type] ||= []).push({ ...c, type, desc });
  }

  const section = buildSection(today, byType);

  // Insert the new dated section directly under the header, above any prior sections.
  let body;
  if (prior) {
    const idx = prior.indexOf("\n## ");
    if (idx !== -1) {
      // splice new section between header and first existing section
      body = prior.slice(0, idx + 1) + section + "\n" + prior.slice(idx + 1);
    } else {
      // header-only prior file
      const base = prior.endsWith("\n") ? prior : prior + "\n";
      body = base + "\n" + section;
    }
  } else {
    body = header + "\n" + section;
  }

  fs.writeFileSync(CHANGELOG, body);
  console.log(`changelog: wrote ${fresh.length} new commit(s) into ${CHANGELOG} (window: ${days}d)`);
  return CHANGELOG;
}

main();
