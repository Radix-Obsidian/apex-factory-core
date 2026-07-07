Audit the company org map for drift ($0, no model calls).

Run `make org-verify`. It passes only when every `registry/*.jsonl` record is schema-valid,
keys are unique, all cross-references resolve (repo + recycled-candidate foreign keys), and
`ORG.md` is reproducible from the data (no drift).

If it fails, report which check failed and propose the fix (usually `make org-render`, or
correcting the offending record in `registry/*.jsonl`).
