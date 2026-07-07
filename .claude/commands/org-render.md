Regenerate the company org map after a registry edit.

1. Run `make org-render` (regenerates `ORG.md` from `registry/*.jsonl`).
2. Run `make org-verify` to confirm it's valid and reproducible.
3. If `ORG.md` changed, commit it with `bash scripts/commit.sh "org: re-render ORG.md"` (core zone).

ORG.md is generated — never hand-edit it. The source of truth is `registry/*.jsonl`.
