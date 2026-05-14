import { getGroqClient } from "../../../utils/groq-client";

type ExistingRow = {
  id?: string;
  type?: string;
  title?: string;
  preconditions?: string;
  steps?: string;
  expectedResult?: string;
};

const getModeInstructions = (mode: string) => {
  switch (mode) {
    case "negative":
      return "Focus on invalid inputs, error handling, failed actions, blocked paths, and system validation messages.";
    case "edge":
      return "Focus on boundary values, unusual combinations, extreme conditions, empty states, limits, and rare but realistic scenarios.";
    case "ui":
      return "Focus on UI behavior, field validation, labels, button states, visibility, usability, layout-related validation, and user interaction flows.";
    case "api":
      return "Focus on API request and response validation, required fields, status codes, invalid payloads, authentication, authorization, and schema checks.";
    case "regression":
      return "Focus on core workflows that should remain stable after changes, including key business flows and previously working behaviors.";
    case "functional":
    default:
      return "Focus on core functional flows, expected user behavior, successful paths, and major business logic.";
  }
};

const getCoverageInstructions = (coverage: string) => {
  switch (coverage) {
    case "basic":
      return "Generate a concise set covering only the most important scenarios.";
    case "thorough":
      return "Generate deeper coverage including main flows, alternate flows, negative paths, and important edge scenarios where relevant.";
    case "standard":
    default:
      return "Generate balanced coverage with a practical mix of core flows and meaningful validation scenarios.";
  }
};

const gapPromptMap: Record<string, string> = {
  "negative-gap":
    "Create missing negative test cases that validate invalid input, rejected actions, missing mandatory fields, and clear failure outcomes.",
  "edge-gap":
    "Create missing edge and boundary test cases that validate empty input, minimum values, maximum values, unusually long values, and rare but realistic combinations.",
  "failure-gap":
    "Create missing failure-path test cases for timeout handling, service unavailability, retry logic, fallback behavior, and visible error messaging.",
  "role-gap":
    "Create missing access-control test cases for authorized users, unauthorized users, role-based visibility, blocked actions, and permission validation.",
  "state-gap":
    "Create missing state-transition test cases that verify how behavior changes across business states such as draft, active, inactive, submitted, or approved.",
  "data-gap":
    "Create missing test cases with concrete and varied test data, including valid examples, invalid formats, malformed payloads, and representative business inputs.",
  "api-mode-gap":
    "Create missing API-focused test cases covering endpoints, payload validation, auth tokens, response codes, schema validation, and API error scenarios.",
  "ui-mode-gap":
    "Create missing UI-focused test cases covering control states, labels, field behavior, navigation, interaction flow, and visibility changes.",
  "regression-mode-gap":
    "Create missing regression-focused test cases that ensure existing flows and core behaviors continue working after change.",
  "persona-gap":
    "Create missing persona-specific test cases that validate the selected user's permissions, restrictions, messaging, and intended journey.",
};

const getPersonaInstructions = (persona: string) => {
  switch (persona) {
    case "admin":
      return "Fill the gap from an admin perspective, using elevated permissions, admin-only actions, and privileged visibility where relevant.";
    case "guest":
      return "Fill the gap from a guest perspective, using unauthenticated behavior, redirects, and blocked actions where relevant.";
    case "first-time-user":
      return "Fill the gap from a first-time-user perspective, using onboarding, empty states, and setup steps where relevant.";
    case "returning-user":
      return "Fill the gap from a returning-user perspective, using existing data, repeat journeys, and resumed state where relevant.";
    case "blocked-user":
      return "Fill the gap from a blocked-user perspective, using restriction states, denial messages, and blocked actions where relevant.";
    case "all":
    default:
      return "Fill the gap with realistic general-user coverage unless the requirement clearly implies a specific persona.";
  }
};

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const requirement =
      typeof body?.requirement === "string" ? body.requirement.trim() : "";
    const mode =
      typeof body?.mode === "string" ? body.mode : "functional";
    const coverage =
      typeof body?.coverage === "string" ? body.coverage : "standard";
    const persona =
      typeof body?.persona === "string" ? body.persona : "all";
    const gapId =
      typeof body?.gapId === "string" ? body.gapId : "";
    const existingRows: ExistingRow[] = Array.isArray(body?.existingRows)
      ? body.existingRows
      : [];

    if (!requirement) {
      return Response.json(
        { result: "Requirement is missing." },
        { status: 400 }
      );
    }

    if (!gapId || !gapPromptMap[gapId]) {
      return Response.json(
        { result: "Coverage gap is missing or invalid." },
        { status: 400 }
      );
    }

    const modeInstructions = getModeInstructions(mode);
    const coverageInstructions = getCoverageInstructions(coverage);
    const personaInstructions = getPersonaInstructions(persona);
    const existingRowsText = existingRows
      .map((row) =>
        `${row.id} | ${row.type} | ${row.title} | ${row.preconditions} | ${row.steps} | ${row.expectedResult}`
      )
      .join("\n");

    const chatCompletion = await getGroqClient().chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.35,
      messages: [
        {
          role: "system",
          content:
            "You are a senior QA engineer filling a specific test coverage gap with a few additional structured test cases.",
        },
        {
          role: "user",
          content: `Generate 2 to 4 additional software test cases for the requirement below.

Requirement:
${requirement}

Generation Mode:
${mode}

Coverage Depth:
${coverage}

Persona:
${persona}

Coverage Gap To Fill:
${gapPromptMap[gapId]}

Mode Guidance:
${modeInstructions}

Coverage Guidance:
${coverageInstructions}

Persona Guidance:
${personaInstructions}

Existing Test Cases:
${existingRowsText || "None"}

IMPORTANT RULES:
- Do NOT use markdown
- Do NOT use asterisks (*)
- Do NOT use bold text
- Output plain text only
- Return exactly one test case per line
- Use | as the column separator
- Do NOT add line breaks inside a single test case
- The second column must be the test case type
- Use only one of these types in the second column: Functional, Regression, API, UI, Negative, Edge, Integration, Security, Performance
- In the Preconditions field, separate multiple items using semicolons
- In the Steps field, separate steps using semicolons
- Keep each row strictly in 6 columns only
- Avoid adding extra commentary before or after the test cases
- Generate only new cases that fill the requested gap
- The selected persona should materially shape the added cases
- Do not repeat or lightly rephrase existing cases
- Keep expected results concise but meaningful
- Preserve realistic business relevance
- Use temporary IDs in the first column if needed; the app will resequence them

Format exactly like this:
TC001 | Functional | Title | Preconditions item 1; Preconditions item 2 | Step 1; Step 2; Step 3 | Expected Result`,
        },
      ],
    });

    let result = chatCompletion.choices[0]?.message?.content || "";
    result = result.replace(/\*\*/g, "").trim();

    return Response.json({ result });
  } catch (error) {
    console.error("FILL COVERAGE GAP ERROR:", error);

    return Response.json(
      { result: "Error filling coverage gap. Check server logs." },
      { status: 500 }
    );
  }
}
