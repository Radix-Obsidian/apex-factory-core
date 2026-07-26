export type AgentState =
  | "GREETING"
  | "RATE_CAPTURE"
  | "BALANCE_CAPTURE"
  | "ADDRESS_CAPTURE"
  | "DATA_FETCH"
  | "DEBT_CAPTURE"
  | "CONTACT_CAPTURE"
  | "CALCULATING"
  | "VERDICT_PRESENT"
  | "HANDOFF_READY"
  | "DISQUALIFIED";

export interface ConversationSession {
  sessionId: string;
  state: AgentState;
  borrower: Partial<BorrowerProfile>;
  property: Partial<PropertyData> | null;
  math: Partial<RealMathResult> | null;
  turnCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface BorrowerProfile {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  currentRatePct: number;
  loanBalance: number;
  remainingMonths: number;
  propertyAddress: string;
  hasHighInterestDebt: boolean;
  highInterestDebtTotal: number;
}

export interface PropertyData {
  estimatedValue: number;
  assessedValue: number;
  lastSalePrice: number;
  lastSaleDate: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  source: "ATTOM" | "PropertyRadar" | "BorrowerEstimate";
}

export interface RealMathResult {
  currentMonthlyPayment: number;
  newMonthlyPayment: number;
  monthlySavings: number;
  annualSavings: number;
  equityPct: number;
  cashOutAvailable: number;
  breakEvenMonths: number;
  fidelityScore: number;
  verdict: "STRONG_YES" | "MARGINAL" | "NO_EQUITY" | "RATE_PARITY";
}

export interface SalesforceLead {
  FirstName: string;
  LastName: string;
  Phone: string;
  Email: string;
  Street: string;
  City: string;
  State: string;
  PostalCode: string;
  LeadSource: "Haboob";
  Description: string;
  Haboob_Current_Rate__c: number;
  Haboob_Loan_Balance__c: number;
  Haboob_Property_Value__c: number;
  Haboob_Equity_Pct__c: number;
  Haboob_Monthly_Savings__c: number;
  Haboob_Fidelity_Score__c: number;
  Haboob_Has_HI_Debt__c: boolean;
  Haboob_Break_Even_Months__c: number;
}

export interface AgentTurn {
  userMessage: string;
  agentReply: string;
  nextState: AgentState;
  sessionUpdates: Partial<ConversationSession>;
}
