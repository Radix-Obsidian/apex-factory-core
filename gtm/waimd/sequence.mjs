// sequence.mjs — pure, I/O-free logic for the 3-email follow-up drip. State lives on the lead record so
// the JSONL store stays the single source of truth; these helpers only compute the next move. No network,
// no files → fully unit-testable. The gated runner (sequence-send.mjs) wires this to the store + transport.
//
// Why self-hosted: Brevo has NO API to create automation workflows (they're UI-only — a POST to create
// one 404s), so the drip's timing and "stop if clicked" branching live here, not in Brevo.
//
// Lead sequence fields (all additive; absent = not enrolled):
//   seqEnrolledAt  ISO          when step 1 went out (enrollment)
//   seqSentAt      {1,2,3}: ISO per-step send timestamps (the schedule anchors)
//   seqStep        number       highest step sent so far (1|2|3)
//   engaged        bool         clicked the roadmap link → dropped from the drip
//   engagedAt      ISO
//   seqDone        bool         no more sends (completed all steps, or engaged)
//   seqStopReason  "completed" | "engaged"

import { SEQUENCE } from "./config.mjs";

const DAY_MS = 86_400_000;
const lastStepN = (seq) => seq.steps[seq.steps.length - 1].n;
const stepDef = (seq, n) => seq.steps.find((s) => s.n === n) || null;
const toMs = (t) => (t instanceof Date ? t.getTime() : new Date(t).getTime());

// Record that `step` just went out. Immutable: returns a new lead. Marks the sequence done when the final
// step is sent. Every step flows through here (enroll() delegates for step 1).
export function recordSent(lead, step, nowIso, seq = SEQUENCE) {
  const seqSentAt = { ...(lead.seqSentAt || {}), [step]: nowIso };
  const done = step >= lastStepN(seq);
  return {
    ...lead,
    seqSentAt,
    seqStep: step,
    ...(done ? { seqDone: true, seqStopReason: "completed" } : {}),
  };
}

// Enroll a lead at step 1 (called by the step-1 senders on a successful send). Stamps the enrollment time
// once; a re-send just refreshes the step-1 anchor.
export function enroll(lead, nowIso, seq = SEQUENCE) {
  const enrolled = recordSent(lead, 1, nowIso, seq);
  return { ...enrolled, seqEnrolledAt: lead.seqEnrolledAt || nowIso };
}

// Drop a lead from the drip because they engaged (clicked the roadmap link). Immutable.
export function markEngaged(lead, nowIso) {
  return { ...lead, engaged: true, engagedAt: lead.engagedAt || nowIso, seqDone: true, seqStopReason: "engaged" };
}

// Enrolled and still receiving the drip?
export function isActive(lead) {
  return Boolean(lead.seqStep) && !lead.seqDone && !lead.engaged;
}

// The next follow-up step DUE for `lead` as of `now`, or null. Only returns steps after step 1
// (enrollment is the step-1 senders' job). A step is due once its `offsetDays` have elapsed since the
// prior step's send. Returns null if the lead is done, engaged, not enrolled, or the wait hasn't elapsed.
export function nextDue(lead, now = new Date(), seq = SEQUENCE) {
  const at = nextDueAt(lead, seq);
  if (!at) return null;
  return toMs(now) >= at.getTime() ? lead.seqStep + 1 : null;
}

// When the next due step (if any) unlocks — a Date, or null if the lead has no pending step. Drives the
// dry-run schedule output.
export function nextDueAt(lead, seq = SEQUENCE) {
  if (!isActive(lead)) return null;
  const nextN = lead.seqStep + 1;
  const def = stepDef(seq, nextN);
  if (!def) return null; // no more steps
  const baseIso = (lead.seqSentAt || {})[lead.seqStep];
  if (!baseIso) return null; // can't schedule without the prior send's anchor
  return new Date(toMs(baseIso) + def.offsetDays * DAY_MS);
}
