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
      return "Keep the merged case aligned to an admin workflow with elevated permissions and privileged controls.";
    case "guest":
      return "Keep the merged case aligned to a guest workflow with access limits and redirect behavior.";
    case "first-time-user":
      return "Keep the merged case aligned to a first-time-user workflow with onboarding and empty-state context.";
    case "returning-user":
      return "Keep the merged case aligned to a returning-user workflow with saved state and existing data.";
    case "blocked-user":
      return "Keep the merged case aligned to a blocked-user workflow with denied actions and restriction messaging.";
    case "all":
    default:
      return "Keep the merged case realistic for the general audience unless the source rows clearly imply a more specific persona.";
  }
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const requirement =
      typeof body?.requirement === "string" ? body.requirement.trim() : "";
    const mode =
      typeof body?.mode === "string" ? body.mode : "functional";
    const persona =
      typeof body?.persona === "string" ? body.persona : "all";
    const rows = Array.isArray(body?.rows)
      ? (body.rows as RowPayload[])
      : [];

    if (!requirement) {
      return Response.json(
        { result: "Requirement is missing." },
        { status: 400 }
      );
    }

    if (rows.length < 2) {
      return Response.json(
        { result: "At least two rows are required to merge similar cases." },
        { status: 400 }
      );
    }

    const modeInstructions = getModeInstructions(mode);
    const personaInstructions = getPersonaInstructions(persona);
    const preferredId = rows[0]?.id || "TC001";

    const chatCompletion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.35,
      messages: [
        {
          role: "system",
          content:
            "You are a senior QA engineer merging overlapping software test cases into one stronger structured test case.",
        },
        {
          role: "user",
          content: `Merge the similar test cases below into exactly one stronger software test case.

Requirement:
${requirement}

Generation Mode:
${mode}

Persona:
${persona}

Mode Guidance:
${modeInstructions}

Persona Guidance:
${personaInstructions}

Rows To Merge:
${rows
  .map(
    (row) =>
      `${row.id} | ${row.type} | ${row.title} | ${row.preconditions} | ${row.steps} | ${row.expectedResult}`
  )
  .join("\n")}

IMPORTANT RULES:
- Return exactly one test case only
- Do NOT use markdown
- Do NOT use asterisks (*)
- Do NOT use bold text
- Output plain text only
- Use | as the column separator
- Do NOT add line breaks inside the test case
- Keep the output strictly in 6 columns only
- Combine the strongest parts of the similar rows into one clearer, more complete case
- Remove repetition and keep the scenario distinct and meaningful
- Preserve the selected persona's access level, state, or restrictions in the merged case
- The first column must use this exact ID: ${preferredId}
- The second column must be one of: Functional, Regression, API, UI, Negative, Edge, Integration, Security, Performance

Format exactly like this:
${preferredId} | Functional | Title | Preconditions item 1; Preconditions item 2 | Step 1; Step 2; Step 3 | Expected Result`,
        },
      ],
    });

    let result = chatCompletion.choices[0]?.message?.content || "";
    result = result.replace(/\*\*/g, "").trim();

    return Response.json({ result });
  } catch (error) {
    console.error("MERGE SIMILAR CASES ERROR:", error);

    return Response.json(
      { result: "Error merging similar test cases. Check server logs." },
      { status: 500 }
    );
  }
}
