// Unit tests for the prompt-caching detector (D22). Run: node --test hooks/caching-core.test.mjs
// Mirrors the audit-core/eval split: this same classifyFile() backs the live hook, the per-SKU
// check, and the tier-1 eval — so testing it here tests all three.
import test from "node:test";
import assert from "node:assert/strict";
import { classifyFile, isViolation } from "./caching-core.mjs";

const v = (file, content) => classifyFile(file, content).verdict;

test("raw inline fetch to the messages endpoint, no cache_control → block", () => {
  const code = `await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 400, system: SYSTEM, messages }),
  });`;
  assert.equal(v("app/api/brief/route.ts", code), "block");
});

test("raw messages.create() inline in a route, no cache_control → block", () => {
  const code = `export async function POST(req) {
    const resp = await anthropic().messages.create({ model: "claude-sonnet-4-6", system: SYS, messages });
    return Response.json(resp);
  }`;
  assert.equal(v("src/routes/ai.ts", code), "block");
});

test("a wrapper definition with messages.create + cache_control → compliant", () => {
  const code = `export async function complete(feature, params) {
    return anthropic().messages.create({
      model: m,
      system: [{ type: "text", text: params.system, cache_control: { type: "ephemeral" } }],
      ...params,
    });
  }`;
  assert.equal(v("lib/llm.ts", code), "compliant");
});

test("a wrapper definition exposing a system string but NO cache_control → warn", () => {
  const code = `export async function complete(feature, params) {
    return anthropic().messages.create({ model: m, system: params.system, messages: params.messages });
  }`;
  assert.equal(v("server/lib/claude.ts", code), "warn");
});

test("Twilio's .messages.create (non-Anthropic) is NOT flagged → n/a", () => {
  const code = `const _client = twilio(sid, token);
    await _client.messages.create({ to, from, body });`;
  assert.equal(v("server/lib/twilio.ts", code), "n/a");
});

test("an Anthropic health-ping with no system block (nothing to cache) → n/a", () => {
  const code = `await anthropic().messages.create({ model, max_tokens: 1, messages: [{ role: "user", content: "ping" }] });`;
  assert.equal(v("server/lib/model-watch.ts", code), "n/a");
});

test("a spread-param wrapper with no visible system or cache (indeterminate) → n/a, not a false positive", () => {
  const code = `export async function complete(feature, params) {
    return anthropic().messages.create({ model: m, ...params });
  }`;
  assert.equal(v("server/lib/claude.ts", code), "n/a");
});

test("an inline call that DOES tag cache_control → compliant", () => {
  const code = `const r = await anthropic().messages.create({
    model, system: [{ type: "text", text: SYS, cache_control: { type: "ephemeral" } }], messages });`;
  assert.equal(v("src/handlers/ask.ts", code), "compliant");
});

test("a file that routes through the wrapper (no raw call site) → n/a", () => {
  const code = `import { complete } from "../lib/llm";
  export async function handler() { return complete("vision", { system: SYS, messages }); }`;
  assert.equal(v("src/routes/vision.ts", code), "n/a");
});

test("a plain non-LLM file → n/a", () => {
  const code = `export function add(a, b) { return a + b; }`;
  assert.equal(v("lib/math.ts", code), "n/a");
});

test("heatlog-shaped callClaude helper in a route (named, raw fetch, uncached) → warn (still non-compliant)", () => {
  const code = `async function callClaude(model, ctx) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "x-api-key": key }, body: JSON.stringify({ model, system: SYSTEM, messages: [{ role: "user", content: ctx }] }) });
    return r.json();
  }`;
  const verdict = v("app/api/engine/route.ts", code);
  assert.equal(verdict, "warn");
  assert.equal(isViolation(verdict), true);
});

test("isViolation: block & warn are violations; compliant & n/a are not", () => {
  assert.equal(isViolation("block"), true);
  assert.equal(isViolation("warn"), true);
  assert.equal(isViolation("compliant"), false);
  assert.equal(isViolation("n/a"), false);
});

test("classifyFile reports the call-site signal and a human reason", () => {
  const code = `const resp = await anthropic().messages.create({ model, system: SYS, messages });`;
  const r = classifyFile("src/routes/ai.ts", code);
  assert.ok(r.sites.length >= 1, "should record at least one call site");
  assert.ok(r.reasons.length >= 1, "should give a human reason");
  assert.equal(r.verdict, "block");
});
