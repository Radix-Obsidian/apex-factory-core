import Anthropic from "@anthropic-ai/sdk";
import type {
  AgentState,
  AgentTurn,
  ConversationSession,
  BorrowerProfile,
  PropertyData,
} from "./types.js";
import { getPropertyData } from "./property_bridge.js";
import { runRealMath, formatVerdictMessage } from "./real_math.js";
import { buildSalesforceLead, prioritizeForLO } from "./lead_handoff.js";

const MODEL = process.env["HABOOB_MODEL"] ?? "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are the Haboob Mortgage Advisor, an expert analyst powered by Voco Technologies.
You operate with the posture of a trusted specialist, never a salesperson.
You do not pitch, pressure, or use urgency language.
You ask one focused question at a time.
You do not use exclamation marks.
You do not use hyphens or dashes in your replies.
All numbers you reference should be formatted as currency or percentages.
Your tone is calm, authoritative, and precise.
When you need to move the conversation to the next step, you ask a clear, direct question.
You never make up financial data. If you do not have verified property data, you ask the borrower for their astimate.`;

const STATE_PROMPTS: Record<AgentState, string> = {
  GREETING:
    "Greet the borrower professionally. Explain that you are here to run a real numbers analysis on their mortgage situation. Ask what brings them in today.",
  RATE_CAPTURE:
    "Ask the borrower for their current mortgage interest rate. Be direct and specific.",
  BALANCE_CAPTURE:
    "Ask for their approximate remaining loan balance. Reassure them a ballpark figure is fine.",
  ADDRESS_CAPTURE:
    "Ask for the full property address including city, state, and zip code so you can look up the current market value.",
  DATA_FETCH:
    "The system is looking up the property data. Tell the borrower you are pulling their property information and it will only take a moment.",
  DEBT_CAPTURE:
    "Ask whether they carry any high interest debt such as credit cards or personal loans that they might want to consolidate into the refinance.",
  CONTACT_CAPTURE:
    "Ask for their first name, last name, and the best phone number to reach them for the next step with a specialist.",
  CALCULATING:
    "Tell the borrower you are running the numbers now and will have their analysis momentarily.",
  VERDICT_PRESENT:
    "Present the Real Math verdict clearly and concisely. Do not use hyphens. State the monthly savings, annual savings, equity position, and break even timeline. End by offering to connect them with a specialist.",
  HANDOFF_READY:
    "Thank the borrower. Confirm their information has been passed to a specialist who will reach out. Give them a clear expectation of when they will hear back.",
  DISQUALIFIED:
    "Explain politely that based on their current numbers a refinance may not be the right move today. Offer to check back in 90 days when market conditions may have changed.",
};

function parseRate(input: string): number | null {
  const match = input.match(/(\d+\.?\d*)/);
  if (!match) return null;
  const val = parseFloat(match[1]);
  if (val > 30 || val < 1) return null;
  return val;
}

function parseBalance(input: string): number | null {
  const cleaned = input.replace(/[$,]/g, "");
  const match = cleaned.match(/(\d+\.?\d*)(k|m)?/i);
  if (!match) return null;
  let val = parseFloat(match[1]);
  if (match[2]?.toLowerCase() === "k") val *= 1000;
  if (match[2]?.toLowerCase() === "m") val *= 1000000;
  if (val < 10000 || val > 10000000) return null;
  return val;
}

function detectYes(input: string): boolean {
  return /\b(yes|yeah|yep|yup|sure|absolutely|definitely|y)\b/i.test(input);
}

export function createSession(sessionId: string): ConversationSession {
  return {
    sessionId,
    state: "GREETING",
    borrower: {},
    property: null,
    math: null,
    turnCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export async function processTurn(
  session: ConversationSession,
  userMessage: string
): Promise<AgentTurn> {
  const client = new Anthropic();
  session.turnCount++;

  let nextState: AgentState = session.state;
  const sessionUpdates: Partial<ConversationSession> = {};
  let stateInstruction = STATE_PROMPTS[session.state];

  switch (session.state) {
    case "GREETING":
      nextState = "RATE_CAPTURE";
      break;

    case "RATE_CAPTURE": {
      const rate = parseRate(userMessage);
      if (rate) {
        sessionUpdates.borrower = { ...session.borrower, currentRatePct: rate };
        nextState = "BALANCE_CAPTURE";
      } else {
        stateInstruction =
          "The borrower did not provide a clear interest rate. Ask them again, explaining they can give it as a number like 7.25.";
      }
      break;
    }

    case "BALANCE_CAPTURE": {
      const balance = parseBalance(userMessage);
      if (balance) {
        sessionUpdates.borrower = { ...session.borrower, loanBalance: balance, remainingMonths: 360 };
        nextState = "ADDRESS_CAPTURE";
      } else {
        stateInstruction =
          "The borrower did not provide a clear loan balance. Ask them again. Give an example format like $350,000 or 350k.";
      }
      break;
    }

    case "ADDRESS_CAPTURE": {
      if (userMessage.trim().length > 10) {
        sessionUpdates.borrower = { ...session.borrower, propertyAddress: userMessage.trim() };
        nextState = "DATA_FETCH";
      } else {
        stateInstruction =
          "The borrower did not provide a full address. Ask them to include street, city, state, and zip.";
      }
      break;
    }

    case "DATA_FETCH": {
      const address = session.borrower.propertyAddress ?? userMessage;
      const propertyData: PropertyData | null = await getPropertyData(address);

      if (propertyData) {
        sessionUpdates.property = propertyData;
        stateInstruction = `Property data retrieved. Estimated value: $${propertyData.estimatedValue.toLocaleString()}.
Confirm the value with the borrower and proceed to ask about high interest debt.`;
      } else {
        stateInstruction =
          "Property data could not be retrieved automatically. Ask the borrower to estimate their current home value.";
      }
      nextState = "DEBT_CAPTURE";
      break;
    }

    case "DEBT_CAPTURE": {
      const hasDebt = detectYes(userMessage);
      sessionUpdates.borrower = {
        ...session.borrower,
        hasHighInterestDebt: hasDebt,
        highInterestDebtTotal: 0,
      };
      nextState = "CONTACT_CAPTURE";
      break;
    }

    case "CONTACT_CAPTURE": {
      const phoneMatch = userMessage.match(/\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/);
      const nameMatch = userMessage.match(/^([A-Za-z]+)\s+([A-Za-z]+)/);

      if (phoneMatch || nameMatch) {
        sessionUpdates.borrower = {
          ...session.borrower,
          phone: phoneMatch?[0] ?? "",
          firstName: nameMatch?[1] ?? "",
          lastName: nameMatch?[2] ?? "",
        };
        nextState = "CALCULATING";
      } else {
        stateInstruction =
          "Ask the borrower to provide both their full name and a phone number so the specialist can reach them.";
      }
      break;
    }

    case "CALCULATING": {
      const b = session.borrower;
      const p = sessionUpdates.property ?? session.property;

      if (
        b.currentRatePct != null &&
        b.loanBalance != null &&
        b.remainingMonths != null &&
        p?.estimatedValue
      ) {
        const mathResult = runRealMath(
          {
            currentRatePct: b.currentRatePct,
            loanBalance: b.loanBalance,
            remainingMonths: b.remainingMonths,
            hasHighInterestDebt: b.hasHighInterestDebt ?? false,
          },
          p as PropertyData
        );
        sessionUpdates.math = mathResult;

        const verdictText = formatVerdictMessage(mathResult);
        stateInstruction = `Run is complete. Present the following verdict to the borrower:\n\n${verdictText}`;
        nextState = mathResult.verdict === "NO_EQUITY" ? "DISQUALIFIED" : "VERDICT_PRESENT";
      } else {
        stateInstruction =
          "Some required data is missing. Apologize and ask the borrower to confirm their loan balance and property address so we can complete the analysis.";
        nextState = "BALANCE_CAPTURE";
      }
      break;
    }

    case "VERDICT_PRESENT": {
      nextState = "HANDOFF_READY";
      const math = sessionUpdates.math ?? session.math;
      if (math && math.fidelityScore !== undefined) {
        const priority = prioritizeForLO(math.fidelityScore);
        stateInstruction = `The borrower has acknowledged the verdict. Confirm their information is being passed to a specialist. Their priority tier is ${priority.tier}. Do not mention the tier to the borrower. Close the conversation professionally.`;
      }
      break;
    }

    case "HANDOFF_READY":
    case "DISQUALIFIED":
      break;
  }

  const completedSession: ConversationSession = {
    ...session,
    ...sessionUpdates,
    state: nextState,
    updatedAt: Date.now(),
    borrower: { ...session.borrower, ...(sessionUpdates.borrower ?? {}) },
  };

  const completion = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Current conversation state: ${session.state}
Instruction for this turn: ${stateInstruction}
Borrower said: ${userMessage || "(session started, send greeting)"}

Respond as the Haboob Mortgage Advisor. One paragraph maximum. No hyphens. No exclamation marks.`,
      },
    ],
  });

  const agentReply =
    completion.content[0]?.type === "text" ? completion.content[0].text : "";

  if (
    nextState === "HANDOFF_READY" &&
    completedSession.borrower.currentRatePct &&
    completedSession.property?.estimatedValue &&
    completedSession.math?.fidelityScore !== undefined
  ) {
    const lead = buildSalesforceLead(
      completedSession.borrower as BorrowerProfile,
      completedSession.property as PropertyData,
      completedSession.math as import("./types.js").RealMathResult
    );

    sessionUpdates.borrower = {
      ...sessionUpdates.borrower,
      _salesforceLead: lead,
    } as Partial<BorrowerProfile> & { _salesforceLead: typeof lead };
  }

  return {
    userMessage,
    agentReply,
    nextState,
    sessionUpdates: {
      ...sessionUpdates,
      state: nextState,
      turnCount: completedSession.turnCount,
    },
  };
}
