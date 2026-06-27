#!/usr/bin/env node
// Apex caching-auditor — ECC PreToolUse hook (tier-1, code-based; D22, see CACHING.md).
// Flags Write/Edit of code that calls the Anthropic API without routing through a cached wrapper.
// Input: Claude Code hook JSON on stdin. Exit 0 = allow; exit 2 = block (stderr shown to the agent).
// Detection lives in caching-core.mjs so the eval harness tests this exact gate.
import { readFileSync } from "node:fs";
import { classifyFile, shouldAnalyze } from "./caching-core.mjs";

let raw = "";
try { raw = readFileSync(0, "utf8"); } catch { process.exit(0); }
let data; try { data = JSON.parse(raw || "{}"); } catch { process.exit(0); }

const tool = data.tool_name || "";
if (tool !== "Write" && tool !== "Edit") process.exit(0);

const ti = data.tool_input || {};
const file = ti.file_path || "";
const content = ti.content ?? ti.new_string ?? "";
if (!shouldAnalyze(file)) process.exit(0);

const { verdict, reasons } = classifyFile(file, content);

// BLOCK a raw inline call that bypasses any wrapper; WARN a wrapper/chokepoint missing cache_control
// (the 1024-token floor makes "uncached" sometimes legitimate — see CACHING.md).
if (verdict === "block") {
  console.error("🏭 caching-auditor BLOCKED this write:");
  for (const r of reasons) console.error("  ✗ " + r);
  console.error("Route the call through a cached wrapper (chassis/lib/llm.ts `complete`), or tag the static");
  console.error("`system` block with cache_control: { type: 'ephemeral' }. See CACHING.md (D22), then retry.");
  process.exit(2);
}
if (verdict === "warn") {
  for (const r of reasons) console.error("🏭 caching-auditor ⚠ " + r);
}
process.exit(0);
