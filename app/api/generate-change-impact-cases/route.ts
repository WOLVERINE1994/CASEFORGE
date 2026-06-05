import { getGroqClient } from "../../../utils/groq-client";

type RequirementChangeInput = {
  type?: string;
  summary?: string;
};

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

const getPersonaInstructions = (persona: string) => {
  switch (persona) {
    case "admin":
      return "Generate impact cases from an admin perspective, emphasizing privileged controls, admin visibility, and policy behavior.";
    case "guest":
      return "Generate impact cases from a guest perspective, emphasizing access limits, redirects, and unauthenticated behavior.";
    case "first-time-user":
      return "Generate impact cases from a first-time-user perspective, emphasizing onboarding, setup, and first-run messaging.";
    case "returning-user":
      return "Generate impact cases from a returning-user perspective, emphasizing saved state, existing data, and repeat journeys.";
    case "blocked-user":
      return "Generate impact cases from a blocked-user perspective, emphasizing denied actions, restriction messaging, and recovery paths.";
    case "all":
    default:
      return "Generate realistic general-user impact cases unless the requirement clearly implies a more specific persona.";
  }
};

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const oldRequirement =
      typeof body?.oldRequirement === "string" ? body.oldRequirement.trim() : "";
    const newRequirement =
      typeof body?.newRequirement === "string" ? body.newRequirement.trim() : "";
    const mode =
      typeof body?.mode === "string" ? body.mode : "functional";
    const persona =
      typeof body?.persona === "string" ? body.persona : "all";
    const changes: RequirementChangeInput[] = Array.isArray(body?.changes)
      ? body.changes
      : [];
    const existingRows: ExistingRow[] = Array.isArray(body?.existingRows)
      ? body.existingRows
      : [];

    if (!oldRequirement || !newRequirement) {
      return Response.json(
        { result: "Both old and new requirements are required." },
        { status: 400 }
      );
    }

    if (changes.length === 0) {
      return Response.json(
        { result: "No requirement changes were provided." },
        { status: 400 }
      );
    }

    const modeInstructions = getModeInstructions(mode);
    const personaInstructions = getPersonaInstructions(persona);

    const chatCompletion = await getGroqClient().chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "You are a senior QA engineer generating only the new or updated regression test cases needed after a requirement change.",
        },
        {
          role: "user",
          content: `Generate only the additional software test cases needed because the requirement changed.

Old Requirement:
${oldRequirement}

New Requirement:
${newRequirement}

Generation Mode:
${mode}

Persona:
${persona}

Mode Guidance:
${modeInstructions}

Persona Guidance:
${personaInstructions}

Detected Changes:
${changes
  .map(
    (change) =>
      `${String(change.type).toUpperCase()}: ${change.summary}`
  )
  .join("\n")}

Existing Test Cases:
${existingRows
  .map(
    (row) =>
      `${row.id} | ${row.type} | ${row.title} | ${row.preconditions} | ${row.steps} | ${row.expectedResult}`
  )
  .join("\n")}

IMPORTANT RULES:
- Return only the new test cases needed because of the requirement changes
- Do NOT repeat existing cases unless the changed behavior truly needs a distinct updated scenario
- Prefer regression-aware cases that target the changed, added, or removed behavior
- Keep the cases specific to the selected persona's permissions, lifecycle state, or restrictions
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
- Avoid extra commentary before or after the test cases
- Generate 1 to 5 meaningful cases based on actual impact, not filler

Format exactly like this:
TC001 | Regression | Title | Preconditions item 1; Preconditions item 2 | Step 1; Step 2; Step 3 | Expected Result`,
        },
      ],
    });

    let result = chatCompletion.choices[0]?.message?.content || "";
    result = result.replace(/\*\*/g, "").trim();

    return Response.json({ result });
  } catch (error) {
    console.error("GENERATE CHANGE IMPACT CASES ERROR:", error);

    return Response.json(
      { result: "Error generating change impact test cases. Check server logs." },
      { status: 500 }
    );
  }
}
