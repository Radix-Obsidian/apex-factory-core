// caching-core.mjs — shared prompt-caching detector (D22). See CACHING.md.
// Imported by ALL THREE enforcers — the PreToolUse hook (caching-auditor.mjs), the per-SKU
// gate (scripts/caching-check.mjs), and the tier-1 eval (evals/caching-gate.mjs) — so the eval
// measures the REAL gate, exactly as hooks/audit-core.mjs backs the copy hook + its eval.
//
// Pure, $0, no model. Structural by design: it scans source for direct Anthropic call sites and
// confirms each routes through a cached wrapper / tags the static `system` block — it does NOT
// type-check, nor judge whether a prompt clears the 1024-token cache floor (CACHING.md caveat).

// A direct call to the Anthropic model API: a raw HTTP POST to the messages endpoint, OR the SDK's
// `.messages.create(` *with Anthropic context in the file* — the context guard excludes other SDKs
// that share the method name (Twilio's `client.messages.create({to,from,body})`, etc.). A file that
// instead calls a wrapper (`complete(...)`) has neither, and reads as n/a (nothing to annotate here).
const SDK_CALL_RE = /\.messages\.create\s*\(/;
const ENDPOINT_RE = /api\.anthropic\.com\/v1\/messages/;
const ANTHROPIC_CTX_RE = /@anthropic-ai\/sdk|\banthropic\s*\(|\bnew\s+Anthropic\b|claude-[a-z0-9]|anthropic-version|x-api-key/i;
// A static system block must be present for there to be anything to cache. A call with no `system`
// (e.g. a max_tokens:1 health ping) has no cacheable prefix and is not a caching-standard concern.
const SYSTEM_RE = /\bsystem\s*:/;
// The cache breakpoint marker. Its presence anywhere in the call-site file = the static block is tagged.
const CACHE_RE = /cache_control/;
// A wrapper/chokepoint DEFINITION: a named function meant to centralize model calls. When such a file
// misses cache_control we WARN (add it to the one chokepoint); an un-named inline call we BLOCK.
const WRAPPER_DEF_RE =
  /\b(?:export\s+)?(?:async\s+)?(?:function\s+|const\s+)(complete|callClaude|callModel|callAnthropic|llm|chat|ask|generate|invoke)\b/;
// Path heuristics that also mark a file as the sanctioned wrapper layer.
const WRAPPER_PATH_RE = /(^|\/)lib\/.*(llm|claude|anthropic|ai)\b|(^|\/)(llm|claude|anthropic)\.[cm]?[jt]sx?$/i;
// Files this detector must never analyze (its own tooling + docs/data that quote call-site strings).
const SKIP_PATH_RE = /caching-(core|auditor|gate|corpus|check)|CACHING\.md/i;
const CODE_FILE_RE = /\.[cm]?[jt]sx?$/;

/** Should the hook / SKU walker even feed this file to classifyFile? Code files only; never our own tooling. */
export function shouldAnalyze(file) {
  const f = String(file || "");
  return CODE_FILE_RE.test(f) && !SKIP_PATH_RE.test(f);
}

/**
 * Classify a single file's caching posture.
 * @returns {{ verdict:'block'|'warn'|'compliant'|'n/a', sites:string[], reasons:string[] }}
 *   n/a        — no direct Anthropic call site (non-LLM, or routes through a wrapper)
 *   compliant  — direct call site that tags cache_control on its system block
 *   warn       — a wrapper/chokepoint definition that calls the API without cache_control
 *                (the floor makes "uncached" sometimes legitimate, so the chokepoint is nudged, not blocked)
 *   block      — a raw inline call that bypasses any wrapper AND omits cache_control (the forbidden shape)
 */
export function classifyFile(file, content) {
  const text = String(content ?? "");
  const sites = [];
  if (ENDPOINT_RE.test(text)) sites.push("api.anthropic.com/v1/messages");
  else if (SDK_CALL_RE.test(text) && ANTHROPIC_CTX_RE.test(text)) sites.push("messages.create");

  if (sites.length === 0)
    return { verdict: "n/a", sites, reasons: ["no direct Anthropic call site (non-LLM, another SDK, or routes through a wrapper)"] };

  // A direct Anthropic call with no static `system` block has no cacheable prefix (e.g. a health ping).
  if (!SYSTEM_RE.test(text))
    return { verdict: "n/a", sites, reasons: ["Anthropic call with no system block — nothing to cache"] };

  if (CACHE_RE.test(text)) {
    return { verdict: "compliant", sites, reasons: ["call site tags cache_control on the system block"] };
  }

  const isWrapper = WRAPPER_DEF_RE.test(text) || WRAPPER_PATH_RE.test(String(file || ""));
  if (isWrapper) {
    return {
      verdict: "warn",
      sites,
      reasons: ["wrapper/chokepoint calls the API without cache_control — tag the static `system` block (CACHING.md)"],
    };
  }
  return {
    verdict: "block",
    sites,
    reasons: ["raw inline model call bypasses a cached wrapper — route it through one or add cache_control (CACHING.md)"],
  };
}

/** A flagged verdict (block or warn) = a caching-standard violation. compliant/n/a are clean. */
export function isViolation(verdict) {
  return verdict === "block" || verdict === "warn";
}

/** Eval convenience, mirroring audit-core's verdict(): 'flag' (should be reported) | 'pass' | 'ignore'. */
export function evalVerdict(file, content) {
  const { verdict } = classifyFile(file, content);
  if (verdict === "n/a") return "ignore";
  return isViolation(verdict) ? "flag" : "pass";
}
