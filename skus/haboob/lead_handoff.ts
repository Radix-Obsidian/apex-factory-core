import type { BorrowerProfile, PropertyData, RealMathResult, SalesforceLead } from "./types.js";
import { parseAddressFromString } from "./property_bridge.js";

export function buildSalesforceLead(
  borrower: BorrowerProfile,
  property: PropertyData | null,
  math: RealMathResult
): SalesforceLead {
  const nameParts = (borrower.firstName + " " + borrower.lastName).trim();
  const addressParsed = property
    ? {
        street: property.street,
        city: property.city,
        state: property.state,
        postalCode: property.postalCode,
      }
    : parseAddressFromString(borrower.propertyAddress);

  const verdictSummary = buildVerdictSummary(borrower, property, math);

  return {
    FirstName: borrower.firstName || nameParts.split(" ")[0] || "Unknown",
    LastName: borrower.lastName || nameParts.split(" ").slice(1).join(" ") || "Borrower",
    Phone: borrower.phone,
    Email: borrower.email || "",
    Street: addressParsed.street,
    City: addressParsed.city,
    State: addressParsed.state,
    PostalCode: addressParsed.postalCode,
    LeadSource: "Haboob",
    Description: verdictSummary,
    Haboob_Current_Rate__c: borrower.currentRatePct,
    Haboob_Loan_Balance__c: borrower.loanBalance,
    Haboob_Property_Value__c: property?.estimatedValue ?? 0,
    Haboob_Equity_Pct__c: parseFloat((math.equityPct * 100).toFixed(2)),
    Haboob_Monthly_Savings__c: parseFloat(math.monthlySavings.toFixed(2)),
    Haboob_Fidelity_Score__c: math.fidelityScore,
    Haboob_Has_HI_Debt__c: borrower.hasHighInterestDebt,
    Haboob_Break_Even_Months__c:
      math.breakEvenMonths === Infinity ? 999 : Math.ceil(math.breakEvenMonths),
  };
}

function buildVerdictSummary(
  borrower: BorrowerProfile,
  property: PropertyData | null,
  math: RealMathResult
): string {
  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  const lines: string[] = [
    `Source: Haboob Intake Agent`,
    `Fidelity Score: ${math.fidelityScore}/10`,
    `Verdict: ${math.verdict}`,
    `Current Rate: ${borrower.currentRatePct}%`,
    `Loan Balance: ${fmt(borrower.loanBalance)}`,
    `Estimated Property Value: ${property ? fmt(property.estimatedValue) : "Not verified"}`,
    `Equity: ${(math.equityPct * 100).toFixed(1)}%`,
    `Monthly Savings Estimate: ${fmt(math.monthlySavings)}`,
    `Annual Savings Estimate: ${fmt(math.annualSavings)}`,
    `Break Even: ${math.breakEvenMonths === Infinity ? "N/A" : Math.ceil(math.breakEvenMonths) + " months"}`,
    `High Interest Debt: ${borrower.hasHighInterestDebt ? "Yes" : "No"}`,
    `Property Data Source: ${property?.source ?? "None"}`,
  ];

  return lines.join("\n");
}

export function prioritizeForLO(fidelityScore: number): {
  tier: "SAME_DAY" | "WITHIN_24H" | "NURTURE";
  instruction: string;
} {
  if (fidelityScore >= 8) {
    return {
      tier: "SAME_DAY",
      instruction:
        "Call this borrower today. Strong equity, meaningful savings, and a clear path to close.",
    };
  }
  if (fidelityScore >= 5) {
    return {
      tier: "WITHIN_24H",
      instruction:
        "Call within 24 hours. Solid candidate. The math supports a refinance conversation.",
    };
  }
  return {
    tier: "NURTURE",
    instruction:
      "Add to the nurture sequence. Equity or savings potential is below threshold now. Revisit in 90 days.",
  };
}
