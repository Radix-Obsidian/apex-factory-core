/**
 * Haboob Fidelity Ledger Sync
 * Pushes completed intake sessions to the Notion Pipeline Ledger database.
 * Run after each session completes or batch via cron.
 * Secrets expected in environment: NOTION_API_KEY, HABOOB_NOTION_DB_ID
 */

const NOTION_VERSION = "2022-06-28";
const NOTION_BASE = "https://api.notion.com/v1";

async function notionRequest(path, method, body) {
  const key = process.env["NOTION_API_KEY"];
  if (!key) throw new Error("NOTION_API_KEY is not set");

  const resp = await fetch(`${NOTION_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Notion API error ${resp.status}: ${text}`);
  }

  return resp.json();
}

export async function pushToLedger(lead, sessionId) {
  const dbId = process.env["HABOOB_NOTION_DB_ID"];
  if (!dbId) throw new Error("HABOOB_NOTION_DB_ID is not set");

  const tierMap = {
    0: "Nurture", 1: "Nurture", 2: "Nurture", 3: "Nurture", 4: "Nurture",
    5: "Within 24H", 6: "Within 24H", 7: "Within 24H",
    8: "Same Day", 9: "Same Day", 10: "Same Day",
  };
  const score = lead.Haboob_Fidelity_Score__c ?? 0;
  const tier = tierMap[Math.min(score, 10)];

  await notionRequest("/pages", "POST", {
    parent: { database_id: dbId },
    properties: {
      Name: { title: [{ text: { content: `${lead.FirstName} ${lead.LastName}` } }] },
      Phone: { phone_number: lead.Phone },
      Email: { email: lead.Email || null },
      Address: { rich_text: [{ text: { content: `${lead.Street}, ${lead.City}, ${lead.State} ${lead.PostalCode}` } }] },
      "Current Rate": { number: lead.Haboob_Current_Rate__c },
      "Loan Balance": { number: lead.Haboob_Loan_Balance__c },
      "Property Value": { number: lead.Haboob_Property_Value__c },
      "Equity Pct": { number: lead.Haboob_Equity_Pct__c },
      "Monthly Savings": { number: lead.Haboob_Monthly_Savings__c },
      "Fidelity Score": { number: lead.Haboob_Fidelity_Score__c },
      "Priority Tier": { select: { name: tier } },
      "Session ID": { rich_text: [{ text: { content: sessionId } }] },
      "Has HI Debt": { checkbox: lead.Haboob_Has_HI_Debt__c },
      Source: { select: { name: "Haboob" } },
    },
  });
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const mockLead = {
    FirstName: "Test",
    LastName: "Borrower",
    Phone: "4805551234",
    Email: "test@example.com",
    Street: "123 Main St",
    City: "Los Angeles",
    State: "CA",
    PostalCode: "90001",
    LeadSource: "Haboob",
    Description: "Smoke test entry",
    Haboob_Current_Rate__c: 7.25,
    Haboob_Loan_Balance__c: 425000,
    Haboob_Property_Value__c: 750000,
    Haboob_Equity_Pct__c: 43.3,
    Haboob_Monthly_Savings__c: 487,
    Haboob_Fidelity_Score__c: 8,
    Haboob_Has_HI_Debt__c: false,
    Haboob_Break_Even_Months__c: 22,
  };

  pushToLedger(mockLead, "smoke-test-001")
    .then(() => console.log("Ledger sync successful."))
    .catch((err) => console.error("Ledger sync failed:", err.message));
}
