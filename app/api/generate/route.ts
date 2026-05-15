import { getGroqClient } from "../../../utils/groq-client";

const cleanCell = (value: string) =>
  value
    .replace(/\|/g, "/")
    .replace(/\s+/g, " ")
    .trim();

const buildFallbackCases = (requirement: string, mode: string) => {
  const requirementSummary = cleanCell(requirement).slice(0, 120) || "the requirement";
  const modeType =
    mode === "api"
      ? "API"
      : mode === "ui" || mode === "accessibility"
      ? "UI"
      : mode === "security"
      ? "Security"
      : mode === "edge"
      ? "Edge"
      : mode === "negative"
      ? "Negative"
      : "Functional";

  const rows = [
    [
      "TC001",
      modeType,
      "Primary user completes required flow successfully",
      `Requirement is available; User has access to ${requirementSummary}`,
      "Open the relevant workflow; Enter the required information; Submit or complete the main action",
      "The system completes the flow and shows the expected successful outcome.",
      "Valid user inputs; Standard browser session",
    ],
    [
      "TC002",
      "Negative",
      "Required validation prevents incomplete submission",
      `Requirement is available; User is on the relevant form or workflow for ${requirementSummary}`,
      "Open the relevant workflow; Leave required information missing; Submit the action",
      "The system blocks completion and shows clear validation guidance.",
      "Missing required values; Invalid or incomplete input",
    ],
    [
      "TC003",
      "Edge",
      "Boundary input remains stable and understandable",
      `Requirement is available; User can access the workflow for ${requirementSummary}`,
      "Open the relevant workflow; Enter boundary or unusually long input; Complete the main action",
      "The system handles the boundary input without data loss, layout breakage, or unclear feedback.",
      "Long text value; Minimum or maximum allowed value",
    ],
    [
      "TC004",
      "UI",
      "Keyboard and focus flow supports completion",
      `User-facing interface exists; User can access the workflow for ${requirementSummary}`,
      "Open the relevant screen; Navigate using keyboard only; Complete the main action",
      "Focus order is visible and logical, and the user can complete the flow without a mouse.",
      "Keyboard only; WCAG 2.2 AA focus visibility check",
    ],
  ];

  return rows.map((row) => row.map(cleanCell).join(" | ")).join("\n");
};

const getGenerationErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    if (error.message.includes("GROQ_API_KEY")) {
      return "GROQ_API_KEY is missing in the server environment. Add it in Vercel and redeploy.";
    }

    return "The AI provider could not generate test cases right now. Check the Groq key, model access, and server logs.";
  }

  return "The AI provider could not generate test cases right now. Check server logs.";
};

const getModeInstructions = (mode: string) => {
  switch (mode) {
    case "negative":
      return "Focus on invalid inputs, error handling, failed actions, blocked paths, and system validation messages.";
    case "edge":
      return "Focus on boundary values, unusual combinations, extreme conditions, empty states, limits, and rare but realistic scenarios.";
    case "ui":
      return "Focus on UI behavior, field validation, labels, button states, visibility, usability, layout-related validation, user interaction flows, and practical accessibility checks where the UI is user-facing.";
    case "api":
      return "Focus on API request and response validation, required fields, status codes, invalid payloads, authentication, authorization, and schema checks.";
    case "security":
      return "Focus on defensive security validation for systems the user owns or is authorized to test. Cover authentication, authorization, session handling, input validation, sensitive data protection, secure error handling, upload safety, API boundary validation, abuse resistance, and business-logic misuse prevention. Do not produce exploit instructions, payload libraries, or offensive hacking content.";
    case "accessibility":
      return "Focus on manual accessibility and WCAG 2.2 AA-oriented validation. Cover WCAG POUR principles: perceivable content, operable keyboard flow, understandable labels/errors, and robust semantic structure. Include keyboard navigation, visible focus order, focus management, semantic labels, form labels and error associations, alt text expectations, heading structure, color contrast review points, screen reader behavior, zoom and reflow, status announcements, clear link/button labels, target size, and motion/accessibility considerations where relevant.";
    case "regression":
      return "Focus on core workflows that should remain stable after changes, including key business flows and previously working behaviors.";
    case "salesforce":
      return "Focus on Salesforce business workflows and enterprise validation. Cover Accounts, Contacts, Leads, Opportunities, Cases, Campaigns, custom objects, validation rules, field behavior, page layouts, related lists, Lightning UI flows, role/profile permissions, approval processes, Flow and Process validation, search and list views, reporting visibility, integrations, negative paths, and realistic business edge cases.";
    case "functional":
    default:
      return "Focus on core functional flows, expected user behavior, successful paths, and major business logic.";
  }
};

const wcagCoverageGuidance = (mode: string, coverage: string) => {
  if (mode === "api" || mode === "security") {
    return "Do not force WCAG UI cases for non-visual backend/API-only requirements unless the requirement explicitly includes a user-facing interface, notification, document, or media output.";
  }

  if (mode === "accessibility") {
    return "Because accessibility mode is selected, most or all cases should be WCAG 2.2 AA-oriented UI/manual validation cases. Use UI as the Type, mention the relevant accessibility focus in the title or expected result, and cover keyboard, focus, semantics, forms/errors, contrast, zoom/reflow, screen reader announcements, and media/alternative text when relevant.";
  }

  if (mode === "ui" || coverage === "thorough") {
    return "For user-facing UI requirements, include at least one WCAG 2.2 AA-oriented case when relevant. Use UI as the Type and ground it in observable behavior such as keyboard operation, focus visibility/order, accessible names, form error association, color contrast, zoom/reflow, screen reader announcements, or alt text.";
  }

  return "When the requirement clearly describes a user-facing UI, consider one practical WCAG 2.2 AA-oriented case if it adds meaningful coverage; do not add accessibility filler for backend-only or purely API behavior.";
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
      return "Assume the actor is an admin with elevated permissions, privileged actions, and broader visibility.";
    case "guest":
      return "Assume the actor is a guest or unauthenticated user with limited access, redirects, and sign-in boundaries.";
    case "first-time-user":
      return "Assume the actor is a first-time user who may encounter onboarding, empty states, and setup guidance.";
    case "returning-user":
      return "Assume the actor is a returning user with existing data, saved state, and repeat-use expectations.";
    case "blocked-user":
      return "Assume the actor is blocked or restricted, so denied actions, restriction messaging, and recovery guidance matter.";
    case "all":
    default:
      return "Cover realistic general-user behavior unless the requirement clearly implies a specific role or account state.";
  }
};

export async function POST(req: Request) {
  let requirement = "";
  let mode = "functional";

  try {
    const body = await req.json();

    requirement =
      typeof body?.requirement === "string" ? body.requirement.trim() : "";

    mode = typeof body?.mode === "string" ? body.mode : "functional";

    const coverage =
      typeof body?.coverage === "string" ? body.coverage : "standard";
    const persona =
      typeof body?.persona === "string" ? body.persona : "all";

    if (!requirement) {
      return Response.json(
        { result: "Requirement is missing." },
        { status: 400 }
      );
    }

    const modeInstructions = getModeInstructions(mode);
    const coverageInstructions = getCoverageInstructions(coverage);
    const personaInstructions = getPersonaInstructions(persona);
    const accessibilityInstructions = wcagCoverageGuidance(mode, coverage);

    const chatCompletion = await getGroqClient().chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a senior QA engineer generating highly relevant, editable, and non-duplicative software test cases.",
        },
        {
          role: "user",
          content: `Generate software test cases for the requirement below.

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

WCAG Accessibility Guidance:
${accessibilityInstructions}

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
- Keep each row strictly in 7 columns only
- Column order must be: ID | Type | Title | Preconditions | Steps | Expected Result | Test Data
- In the Preconditions field, separate multiple items using semicolons
- In the Steps field, separate steps using semicolons
- In the Test Data field, separate concrete inputs or environment details using semicolons
- Avoid adding extra commentary before or after the test cases
- Every test case must be grounded in the requirement text. Do not invent unrelated modules, screens, roles, or system behavior.
- This is manual QA generation only. Do not output automation code, exploit tooling, or offensive penetration steps.
- Any security coverage must stay defensive, authorized, and release-readiness focused.
- Make titles clear, specific, and easy to edit later
- Titles should describe the scenario and outcome, not start with words like "Verify", "Test", or "Check"
- Keep titles between 6 and 12 words when possible
- Preconditions should only describe starting state, permissions, or required setup
- Steps should contain actions only, not expected outcomes
- Use 3 to 6 steps unless the requirement genuinely needs fewer or more
- Expected Result must describe the final observable outcome in one concise sentence
- Test Data should include realistic example inputs when they help execution; otherwise use None
- Do not repeat near-identical test cases
- Each test case should be realistic and distinct
- Decide the appropriate number of test cases based on requirement scope and complexity
- The selected coverage depth should influence how broad or deep the output is
- The selected persona should materially influence permissions, starting state, and expected behavior
- Smaller requirements should produce fewer cases
- Broader requirements should produce more cases
- Do not create padded or repetitive rows just to increase quantity
- Prioritize meaningful coverage over fixed count
- If the requirement is ambiguous, make the smallest safe assumption and reflect it in Preconditions or Test Data instead of inventing new product behavior
- Prefer one strong case over multiple shallow duplicates
- If a negative or edge scenario is not supported by the requirement or selected mode, do not force it
- For security mode, prefer realistic validation scenarios around access, protection, misuse resistance, and safe failure handling instead of attack walkthroughs
- For accessibility mode, prefer practical WCAG 2.2 AA-oriented manual checks with observable expected outcomes
- For WCAG-oriented cases, use UI as the Type and mention observable accessibility evidence such as keyboard behavior, focus order, accessible names, form associations, contrast, zoom/reflow, screen reader announcements, captions, or alt text

Format exactly like this:
TC001 | Functional | Title | Preconditions item 1; Preconditions item 2 | Step 1; Step 2; Step 3 | Expected Result | Test Data item 1; Test Data item 2

Example:
TC001 | Functional | Returning user signs in with valid credentials | User account exists; Account is active | Open login page; Enter a valid email; Enter a valid password; Click Sign in | The user reaches the dashboard and sees an authenticated session | valid.user@example.com; Correct password`,
        },
      ],
    });

    let result = chatCompletion.choices[0]?.message?.content || "";
    result = result.replace(/\*\*/g, "").trim();

    return Response.json({ result });
  } catch (error) {
    console.error("AI ERROR:", error);

    if (requirement) {
      return Response.json({
        result: buildFallbackCases(requirement, mode),
        warning: getGenerationErrorMessage(error),
      });
    }

    return Response.json(
      { result: getGenerationErrorMessage(error) },
      { status: 500 }
    );
  }
}
