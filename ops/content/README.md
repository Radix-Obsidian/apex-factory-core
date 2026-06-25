# ops/content — content-repurposing + changelog engine

Turns the factory's **real activity** (git history, build-in-public entries, portfolio
registry) into two things: a maintained `CHANGELOG.md` and ready-to-edit content seeds.
Deterministic, `$0`, no LLM, never commits, never charges, never takes an irreversible action.

## Scripts

### `changelog.mjs`
Reads recent git history from **both** `~/factory-core` and `~/dot-navigator` (via
`git -C <repo> log`), groups commits by conventional-commit type
(feat / fix / perf / refactor / docs / test / chore / ci, everything else → Other), and
refreshes `~/factory-core/CHANGELOG.md` with a new dated section at the top (most recent first).

- Dedupe: each line is tagged with `<!--h:shorthash-->`; re-runs skip hashes already present, so
  nothing duplicates.
- Window: last **14 days** by default. `--days N` to widen/narrow.
- Robust: a missing repo path, a non-git directory, or empty `git log` output is skipped quietly.

```bash
node ops/content/changelog.mjs            # last 14 days, both repos
node ops/content/changelog.mjs --days 30
```

### `repurpose.mjs`
Turns recent commits + the newest `build-in-public/` entries + a portfolio snapshot (from
`skus/registry.json`, if readable) into post-ready **seeds**, written to
`~/factory-core/content/repurpose/<YYYY-MM-DD>.md`. Each file contains:

- an **X/Twitter thread** (3–5 posts),
- a **LinkedIn post**,
- a short **newsletter angle**.

All derived **only** from real activity — plain and honest, no hype. Edit before posting.

- Robust: missing repos, no build-in-public dir, or an unparseable registry are all skipped; with
  zero activity it still writes an honest "nothing to post" file instead of crashing.
- Window: last **14 days** by default. `--days N` supported.

```bash
node ops/content/repurpose.mjs            # last 14 days → content/repurpose/<date>.md
node ops/content/repurpose.mjs --days 21
```

### `run.mjs`
The entrypoint the scheduler calls. Runs `changelog.mjs` then `repurpose.mjs` in sequence, each in
its own `node` process (a failing step can't take the other down). Extra args (e.g. `--days N`) are
forwarded to both.

```bash
node ops/content/run.mjs
node ops/content/run.mjs --days 21
```

## Outputs
- `~/factory-core/CHANGELOG.md` — refreshed in place, dated sections, most recent first.
- `~/factory-core/content/repurpose/<YYYY-MM-DD>.md` — one seed file per run date.

## Scheduling
A **launchd** job runs `node ops/content/run.mjs` **every 3 days**. The operator installs the plist
(the scripts neither create nor load any plist). Suggested shape for the operator:

- Program args: `/usr/bin/env node /Users/<you>/factory-core/ops/content/run.mjs`
- `StartInterval`: `259200` (3 days, in seconds) — or a `StartCalendarInterval` set.
- Working directory: `~/factory-core`.
- Redirect `StandardOutPath` / `StandardErrorPath` to a log under `~/factory-core` for auditing.

No secrets are required; the engine is read-only against git and the registry and writes only the
two outputs above.
