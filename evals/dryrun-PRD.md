# dryrun-PRD.md — throwaway PRD to exercise loop.sh end-to-end (no product, no deploy, no charge)

Purpose: prove the Ralph loop wiring works (tmux session starts, the agent iterates, the
ALL_DONE sentinel breaks the loop, the OpenClaw Telegram ping fires) WITHOUT building a real SKU.

## Acceptance (trivial + safe)
- [ ] Create `evals/dryrun-output.txt` containing the single line `loop-ok`.
- [ ] Create `evals/dryrun.test.mjs` with one assertion that the file contains `loop-ok`, and run it (must pass).
- [ ] Do NOT touch Stripe, Railway, Higgsfield, or any network resource.
- [ ] When both boxes are done, print the literal token `ALL_DONE` and stop.

## Run
```bash
MAX_ITERS=3 SESSION=factory-dryrun bash ~/factory-core/loop.sh
tmux -S ~/.tmux/sock attach -t factory-dryrun     # watch
tail -f ~/factory-core/runs/loop.log               # or follow the log
```
Expected: loop completes within 3 iterations, log ends `SHIPPED:0`, Telegram gets the finish ping.
