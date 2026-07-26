import type { BorrowerProfile, PropertyData, RealMathResult } from "./types.js";

const DEFAULT_TARGET_RATE_PCT =
  parseFloat(process.env["HABOOB_TARGET_RATE"] ?? "6.50");

const DEFAULT_NEW_TERM_MONTHS = 360;
const CLOSING_COST_FACTOR = 0.025;
const MAX_LTV = 0.80;
const FAST_ROI_MONTHS = 24;
const HIGH_VALUE_BALANCE = 500_000;

function monthlyPayment(
  principal: number,
  annualRatePct: number,
  termMonths: number
): number {
  if (annualRatePct === 0) return principal / termMonths;
  const r = annualRatePct / 12 / 100;
  return (principal * r) / (1 - Math.pow(1 + r, -termMonths));
}

function fidelityScore(params: {
  equityPct: number;
  currentRatePct: number;
  monthlySavings: number;
  hasHighInterestDebt: boolean;
  breakEvenMonths: number;
  loanBalance: number;
}): number {
  let score = 0;

  if (params.equityPct >= 0.5) score += 3;
  else if (params.equityPct >= 0.3) score += 2;
  else if (params.equityPct >= 0.2) score += 1;

  if (params.currentRatePct >= 7.0) score += 2;
  else if (params.currentRatePct >= 6.5) score += 1;

  if (params.monthlySavings >= 500) score += 2;
  else if (params.monthlySavings >= 200) score += 1;

  if (params.hasHighInterestDebt) score += 1;

  if (params.breakEvenMonths <= FAST_ROI_MONTHS) score += 1;

  if (params.loanBalance >= HIGH_VALUE_BALANCE) score += 1;

  return Math.min(score, 10);
}

export function runRealMath(
  borrower: Pick<
    BorrowerProfile,
    | "currentRatePct"
    | "loanBalance"
    | "remainingMonths"
    | "hasHighInterestDebt"
  >,
  property: Pick<PropertyData, "estimatedValue">
): RealMathResult {
  const currentMonthlyPayment = monthlyPayment(
    borrower.loanBalance,
    borrower.currentRatePct,
    borrower.remainingMonths
  );

  const targetRatePct = DEFAULT_TARGET_RATE_PCT;
  const newMonthlyPayment = monthlyPayment(
    borrower.loanBalance,
    targetRatePct,
    DEFAULT_NEW_TERM_MONTHS
  );

  const monthlySavings = currentMonthlyPayment - newMonthlyPayment;
  const annualSavings = monthlySavings * 12;

  const equityPct =
    (property.estimatedValue - borrower.loanBalance) / property.estimatedValue;

  const cashOutAvailable = Math.max(
    0,
    property.estimatedValue * MAX_LTV - borrower.loanBalance
  );

  const estClosingCosts = borrower.loanBalance * CLOSING_COST_FACTOR;
  const breakEvenMonths =
    monthlySavings > 0 ? estClosingCosts / monthlySavings : Infinity;

  const score = fidelityScore({
    equityPct,
    currentRatePct: borrower.currentRatePct,
    monthlySavings,
    hasHighInterestDebt: borrower.hasHighInterestDebt,
    breakEvenMonths,
    loanBalance: borrower.loanBalance,
  });

  let verdict: RealMathResult["verdict"];
  if (equityPct < 0.2) {
    verdict = "NO_EQUITY";
  } else if (monthlySavings < 50) {
    verdict = "RATE_PARITY";
  } else if (score >= 7) {
    verdict = "STRONG_YES";
  } else {
    verdict = "MARGINAL";
  }

  return {
    currentMonthlyPayment,
    newMonthlyPayment,
    monthlySavings,
    annualSavings,
    equityPct,
    cashOutAvailable,
    breakEvenMonths,
    fidelityScore: score,
    verdict,
  };
}

export function formatVerdictMessage(math: RealMathResult): string {
  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const pct = (n: number) => (n * 100).toFixed(1) + "%";

  if (math.verdict === "NO_EQUITY") {
    return (
      "Based on the numbers, your current equity position is below the 20% threshold " +
      "needed for a conventional refinance. That said, there may be FHA or VA options " +
      "worth examining. One of our specialists can walk through the full picture with you."
    );
  }

  if (math.verdict === "RATE_PARITY") {
    return (
      "Your current rate is already close to today s market. The numbers do not show " +
      "a compelling savings case on a straight rate reduction. If you have equity to " +
      "access or interest debt to consolidate, the conversation changes. " +
      "A 15 minute call with a specialist would clarify the right move."
    );
  }

  const breakEvenStr =
    math.breakEvenMonths === Infinity
      ? "unknown"
      : Math.ceil(math.breakEvenMonths) + " months";

  return (
    "The math works here. " +
    "At your current rate, you are paying approximately " + fmt(math.currentMonthlyPayment) + " per month. " +
    "A refinance to current market rates would bring that to " + fmt(math.newMonthlyPayment) + ", " +
    "saving you " + fmt(math.monthlySavings) + " per month and " + fmt(math.annualSavings) + " per year. " +
    "You have approximately " + pct(math.equityPct) + " equity in the property. " +
    (math.cashOutAvailable > 0
      ? "There is also up to " + fmt(math.cashOutAvailable) + " in accessible equity if a cash out refinance is of interest. "
      : "") +
    "At current closing cost estimates, you would recover the cost of this refinance in " + breakEvenStr + ". " +
    "If you would like to take the next step, we can arrange a 15 minute call with one of our specialists."
  );
}
