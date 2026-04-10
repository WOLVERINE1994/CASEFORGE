import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

type RowPayload = {
  id: string;
  type: string;
  title: string;
  preconditions: string;
  steps: string;
  expectedResult: string;
};

type RewriteFocusItem = {
  title?: string;
  summary?: string;
  suggestion?: string;
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
      return "Generate a concise and focused test case covering an important scenario only.";
    case "thorough":
      return "Generate a stronger, deeper, and more complete test case with meaningful coverage for the selected scenario.";
    case "standard":
    default:
      return "Generate a balanced and practical test case with meaningful coverage for the selected scenario.";
  }
};

const getPersonaInstructions = (persona: string) => {
  switch (persona) {
    case "admin":
      return "Refine the case for an admin with elevated permissions and access to privileged actions.";
    case "guest":
      return "Refine the case for a guest or unauthenticated user with limited access and redirect behavior.";
    case "first-time-user":
      return "Refine the case for a first-time user, including onboarding, empty states, and initial setup context.";
    case "returning-user":
      return "Refine the case for a returning user with existing data, saved preferences, and repeat actions.";
    case "blocked-user":
      return "Refine the case for a blocked or restricted user with denied actions and restriction messaging.";
    case "all":
    default:
      return "Keep the case realistic for the general audience unless the requirement implies a more specific persona.";
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
    const row = body?.row as RowPayload | undefined;
    const rewriteFocus: RewriteFocusItem[] = Array.isArray(body?.rewriteFocus)
      ? body.rewriteFocus
      : [];

    if (!requirement) {
      return Response.json(
        { result: "Requirement is missing." },
        { status: 400 }
      );
    }

    if (!row) {
      return Response.json(
        { result: "Row data is missing." },
        { status: 400 }
      );
    }

    const modeInstructions = getModeInstructions(mode);
    const coverageInstructions = getCoverageInstructions(coverage);
    const personaInstructions = getPersonaInstructions(persona);

    const chatCompletion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.25,
      messages: [
        {
          role: "system",
          content:
            "You are a senior QA engineer rewriting exactly one software test case so it becomes more relevant, more structured, and easier to edit.",
        },
        {
          role: "user",
          content: `Rewrite exactly one test case for the requirement below.

Requirement:
${requirement}

Generation Mode:
${mode}

Coverage Depth:
${coverage}

Persona:
${persona}

Mode Guidance:
${modeInstructions}

Coverage Guidance:
${coverageInstructions}

Persona Guidance:
${personaInstructions}

Current Test Case:
${row.id} | ${row.type} | ${row.title} | ${row.preconditions} | ${row.steps} | ${row.expectedResult}

Rewrite Priorities:
${rewriteFocus.length > 0
  ? rewriteFocus
      .map(
        (item) =>
          `- ${item.title ?? "Issue"}: ${item.summary ?? ""} ${item.suggestion ?? ""}`.trim()
      )
      .join("\n")
  : "- Improve any weak title, thin steps, or weak expected result that reduce execution quality."}

IMPORTANT RULES:
- Return exactly one test case only
- Do NOT use markdown
- Do NOT use asterisks (*)
- Do NOT use bold text
- Output plain text only
- Use | as the column separator
- Do NOT add line breaks inside the test case
- Keep the output strictly in 7 columns only
- Column order must be: ID | Type | Title | Preconditions | Steps | Expected Result | Test Data
- Keep the same test case intent, but improve quality, clarity, and usefulness
- Make it distinct and meaningful
- Address every rewrite priority listed above in one improved row
- Keep the scenario aligned to the selected persona's permissions, state, or restrictions
- Do not return commentary before or after the test case
- The second column must be the test case type
- Use only one of these types in the second column: Functional, Regression, API, UI, Negative, Edge, Integration, Security, Performance
- You may improve type, title, preconditions, steps, and expected result
- Titles should describe the scenario and outcome, not start with words like "Verify", "Test", or "Check"
- Preconditions should only describe setup or starting state
- Steps should contain actions only, separated by semicolons
- Expected Result should be one concise, observable outcome sentence
- Test Data should include concrete sample input or environment detail when useful; otherwise use None
- Preserve the same test case ID in the first column
- Keep the rewritten case grounded in the requirement and avoid introducing unrelated product behavior

Format exactly like this:
TC001 | Functional | Title | Preconditions item 1; Preconditions item 2 | Step 1; Step 2; Step 3 | Expected Result | Test Data item 1; Test Data item 2`,
        },
      ],
    });

    let result = chatCompletion.choices[0]?.message?.content || "";
    result = result.replace(/\*\*/g, "").trim();

    return Response.json({ result });
  } catch (error) {
    console.error("REGENERATE ROW ERROR:", error);

    return Response.json(
      {
        result: "Error regenerating test case. Check server logs.",
      },
      { status: 500 }
    );
  }
}
