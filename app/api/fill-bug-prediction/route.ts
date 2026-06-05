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
      return "Focus on UI behavior, field validation, labels, button states, visibility, usability, layout-related validation, user interaction flows, and practical WCAG accessibility checks for user-facing UI.";
    case "api":
      return "Focus on API request and response validation, required fields, status codes, invalid payloads, authentication, authorization, and schema checks.";
    case "regression":
      return "Focus on core workflows that should remain stable after changes, including key business flows and previously working behaviors.";
    case "accessibility":
      return "Focus on WCAG 2.2 AA-oriented accessibility defect risks, including keyboard traps, missing visible focus, poor accessible names, form error association gaps, contrast failures, zoom/reflow issues, missing announcements, missing alt text, captions, target-size problems, and motion sensitivity.";
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

const getPersonaInstructions = (persona: string) => {
  switch (persona) {
    case "admin":
      return "Generate from an admin perspective with elevated permissions and privileged actions where relevant.";
    case "guest":
      return "Generate from a guest perspective with unauthenticated boundaries, redirects, and blocked actions where relevant.";
    case "first-time-user":
      return "Generate from a first-time-user perspective with onboarding, empty states, and first-run guidance where relevant.";
    case "returning-user":
      return "Generate from a returning-user perspective with existing data, repeat flows, and persisted state where relevant.";
    case "blocked-user":
      return "Generate from a blocked-user perspective with denied actions, restriction messaging, and blocked journeys where relevant.";
    case "all":
    default:
      return "Generate realistic general-user coverage unless a specific persona is clearly implied.";
  }
};

const predictionPromptMap: Record<string, string> = {
  "role-leakage":
    "Create missing cases that validate role boundaries, restricted actions, hidden controls, unauthorized access, and cross-permission leakage for the current requirement.",
  "validation-mismatch":
    "Create missing cases that validate invalid data, missing mandatory fields, rejected actions, and consistent error behavior for the current form or flow.",
  "timeout-handling":
    "Create missing cases that validate service outage handling, timeout behavior, retry logic, rollback safety, and failure messaging where the current requirement implies a downstream dependency.",
  "state-transition":
    "Create missing cases that validate behavior across business states, including disabled actions, state transitions, success state updates, and state-specific rules.",
  "stale-ui":
    "Create missing cases that validate stale UI prevention, success feedback, refreshed visible state, and cross-view consistency for the current requirement. Do not invent billing, payment, invoice, or dashboard behavior unless it appears in the requirement.",
  "ownership-visibility":
    "Create missing cases that validate account scoping, ownership, direct-link protection, and cross-user visibility controls for the current requirement.",
  "persona-gap":
    "Create missing persona-specific cases that validate the selected user journey, including permissions, redirects, restrictions, and visible messaging.",
  "accessibility-risk":
    "Create missing WCAG 2.2 AA-oriented accessibility cases that validate keyboard operation, focus visibility and order, accessible names, form error association, contrast, zoom/reflow, screen reader announcements, alt text, captions, target size, and reduced-motion behavior where relevant.",
};

function countGeneratedRows(result: string) {
  return result
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^TC\d+\s*\|/.test(line))
    .filter((line) => line.split("|").length >= 6)
    .length;
}

function hasSignupSignals(requirement: string) {
  return /\bsign\s*up\b|\bsignup\b|\bcreate account\b|\bregister\b|\baccount is created\b/i.test(
    requirement,
  );
}

function buildFallbackPredictionRows(predictionId: string, requirement: string) {
  const signup = hasSignupSignals(requirement);
  const genericSubject = signup ? "signup" : "target";
  const rows: Array<{
    type: string;
    title: string;
    preconditions: string;
    steps: string;
    expectedResult: string;
  }> = [];

  switch (predictionId) {
    case "validation-mismatch":
      rows.push(
        {
          type: "Negative",
          title: `${genericSubject} missing mandatory input is rejected`,
          preconditions: `${signup ? "Signup form" : "Target form"} is open; Required fields are identifiable`,
          steps:
            "Leave one or more mandatory fields blank; Attempt to submit; Review validation feedback",
          expectedResult:
            "Submission is blocked and the missing mandatory fields show clear validation feedback",
        },
        {
          type: "Negative",
          title: `${genericSubject} invalid format validation is consistent`,
          preconditions: `${signup ? "Signup form" : "Target form"} is open; Required fields are available`,
          steps:
            "Enter invalid formatted data; Complete other required inputs; Submit the form",
          expectedResult:
            "The invalid value is rejected consistently before account or record creation",
        }
      );
      break;
    case "stale-ui":
      rows.push(
        {
          type: "UI",
          title: `${genericSubject} success feedback updates visible state`,
          preconditions: `${signup ? "Signup form" : "Target flow"} is open; Valid data is available`,
          steps:
            "Complete the flow successfully; Observe the success feedback; Revisit the related screen or state indicator",
          expectedResult:
            "The UI shows the latest successful state without stale or contradictory information",
        },
        {
          type: "Regression",
          title: `${genericSubject} reopened screen preserves latest status`,
          preconditions: `${signup ? "Account creation" : "Target action"} has completed successfully`,
          steps:
            "Navigate away from the flow; Return to the related screen; Review the displayed status and data",
          expectedResult:
            "The reopened screen reflects the latest completed state consistently",
        }
      );
      break;
    case "state-transition":
      rows.push({
        type: "Functional",
        title: `${genericSubject} state changes after successful completion`,
        preconditions: `${signup ? "Signup form" : "Target flow"} is open; Valid data is available`,
        steps:
          "Complete the primary action; Observe the resulting state; Attempt the next expected user action",
        expectedResult:
          "The user reaches the correct post-completion state and the next available action matches the requirement",
      });
      break;
    case "persona-gap":
      rows.push({
        type: "Functional",
        title: `${genericSubject} journey matches selected persona expectations`,
        preconditions: "Selected persona context is available; Requirement flow is implemented",
        steps:
          "Open the flow as the selected persona; Complete the intended journey; Review messaging and allowed actions",
        expectedResult:
          "The persona receives the correct journey, messaging, and access for the requirement",
      });
      break;
    default:
      rows.push({
        type: "Functional",
        title: `${genericSubject} risk area has targeted coverage`,
        preconditions: "Requirement flow is implemented; Relevant test data is available",
        steps:
          "Open the target flow; Execute the risk-focused scenario; Observe the outcome",
        expectedResult:
          "The predicted risk area behaves correctly for the current requirement",
      });
      break;
  }

  return rows
    .map(
      (row, index) =>
        `TC${String(index + 1).padStart(3, "0")} | ${row.type} | ${row.title} | ${row.preconditions} | ${row.steps} | ${row.expectedResult}`
    )
    .join("\n");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const requirement =
      typeof body?.requirement === "string" ? body.requirement.trim() : "";
    const mode = typeof body?.mode === "string" ? body.mode : "functional";
    const coverage =
      typeof body?.coverage === "string" ? body.coverage : "standard";
    const persona = typeof body?.persona === "string" ? body.persona : "all";
    const predictionId =
      typeof body?.predictionId === "string" ? body.predictionId : "";
    const existingRows: ExistingRow[] = Array.isArray(body?.existingRows)
      ? body.existingRows
      : [];

    if (!requirement) {
      return Response.json(
        { result: "Requirement is missing." },
        { status: 400 }
      );
    }

    if (!predictionId || !predictionPromptMap[predictionId]) {
      return Response.json(
        { result: "Bug prediction is missing or invalid." },
        { status: 400 }
      );
    }

    const chatCompletion = await getGroqClient().chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.35,
      messages: [
        {
          role: "system",
          content:
            "You are a senior QA engineer generating targeted test cases to cover a predicted defect zone.",
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

Likely Defect Zone To Cover:
${predictionPromptMap[predictionId]}

Mode Guidance:
${getModeInstructions(mode)}

Coverage Guidance:
${getCoverageInstructions(coverage)}

Persona Guidance:
${getPersonaInstructions(persona)}

Existing Test Cases:
${existingRows
  .map(
    (row) =>
      `${row.id} | ${row.type} | ${row.title} | ${row.preconditions} | ${row.steps} | ${row.expectedResult}`
  )
  .join("\n") || "None"}

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
- Generate only new cases that specifically cover the predicted defect zone
- Keep every case grounded in this requirement text
- Do not introduce unrelated billing, invoice, payment, dashboard, or admin behavior unless the requirement explicitly mentions it
- Do not repeat or lightly rephrase existing cases
- Preserve realistic business relevance
- For WCAG-oriented cases, use UI as the Type and describe observable accessibility evidence in the expected result

Format exactly like this:
TC001 | Functional | Title | Preconditions item 1; Preconditions item 2 | Step 1; Step 2; Step 3 | Expected Result`,
        },
      ],
    });

    let result = chatCompletion.choices[0]?.message?.content || "";
    result = result.replace(/\*\*/g, "").trim();

    if (countGeneratedRows(result) === 0) {
      result = buildFallbackPredictionRows(predictionId, requirement);
    }

    return Response.json({ result });
  } catch (error) {
    console.error("FILL BUG PREDICTION ERROR:", error);

    return Response.json(
      { result: "Error covering bug prediction. Check server logs." },
      { status: 500 }
    );
  }
}
