import { getGroqClient } from "../../../utils/groq-client";

const cleanCell = (value: string) =>
  value
    .replace(/\|/g, "/")
    .replace(/\s+/g, " ")
    .trim();

const extractSectionValue = (requirement: string, label: string) => {
  const lines = requirement.split(/\r?\n/).map((line) => line.trim());
  const index = lines.findIndex((line) =>
    new RegExp(`^#{0,6}\\s*${label}\\s*$`, "i").test(line)
  );

  if (index >= 0) {
    return (
      lines
        .slice(index + 1)
        .find((line) => line && !line.startsWith("#")) || ""
    );
  }

  const inlineMatch = requirement.match(
    new RegExp(`${label}\\s*:?\\s*([^\\n#]+)`, "i")
  );

  return inlineMatch?.[1]?.trim() || "";
};

const getRequirementContext = (requirement: string) => {
  const storyTitle = extractSectionValue(requirement, "Story Title");
  const epicTitle = requirement.match(/^#\s*Epic:\s*(.+)$/im)?.[1]?.trim() || "";
  const firstHeading = requirement.match(/^#+\s*(.+)$/m)?.[1]?.trim() || "";

  return cleanCell(storyTitle || epicTitle || firstHeading || "the requirement")
    .replace(/^Epic:\s*/i, "")
    .slice(0, 90);
};

const inferTargetCaseCount = (requirement: string, coverage: string) => {
  const normalized = requirement.toLowerCase();
  const signalCount = [
    /acceptance criteria/.test(normalized),
    /functional requirements/.test(normalized),
    /required fields/.test(normalized),
    /sales csv/.test(normalized),
    /inventory csv/.test(normalized),
    /product master csv/.test(normalized),
    /api/.test(normalized),
    /database|persist|stored/.test(normalized),
    /preview/.test(normalized),
    /performance|50k|non-functional/.test(normalized),
  ].filter(Boolean).length;

  const base =
    coverage === "basic" ? 6 : coverage === "thorough" ? 14 : 10;

  return Math.min(coverage === "thorough" ? 18 : 14, base + Math.floor(signalCount / 2));
};

const buildFallbackCases = (requirement: string, mode: string, coverage: string) => {
  const context = getRequirementContext(requirement);
  const normalized = requirement.toLowerCase();
  const isCsvUploadStory =
    normalized.includes("csv") &&
    (normalized.includes("upload") || normalized.includes("inventory"));
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

  if (isCsvUploadStory) {
    const rows = [
      [
        "TC001",
        "Functional",
        "Sales CSV upload creates validated preview",
        "User is authenticated; CSV upload workspace is available",
        "Open the CSV upload screen; Select Sales CSV as the upload type; Upload a sales file with all required columns; Review the generated preview",
        "The first 20 normalized sales rows are shown with no validation errors.",
        "date=2026-05-01; sku=SKU-001; units_sold=12; selling_price=1299.50; discount_percent=10; city=Mumbai",
      ],
      [
        "TC002",
        "Functional",
        "Inventory CSV upload accepts required stock fields",
        "User is authenticated; CSV upload workspace is available",
        "Open the CSV upload screen; Select Inventory CSV as the upload type; Upload an inventory file with required stock fields; Review the preview",
        "Inventory records are normalized and previewed with sku, current_stock, warehouse, and stock_age_days.",
        "sku=SKU-001; current_stock=45; warehouse=BLR-01; stock_age_days=32",
      ],
      [
        "TC003",
        "Functional",
        "Product master upload validates catalogue attributes",
        "User is authenticated; CSV upload workspace is available",
        "Open the CSV upload screen; Select Product Master CSV as the upload type; Upload a product master file; Review the preview",
        "Product records are accepted with catalogue, pricing, color, size, and gender attributes.",
        "sku=SKU-001; product_name=Linen Shirt; category=Apparel; subcategory=Shirts; color=Blue; size=M; gender=Women; mrp=1999; cost_price=850",
      ],
      [
        "TC004",
        "Negative",
        "Missing required columns block submission",
        "User is authenticated; CSV upload workspace is available",
        "Select Sales CSV as the upload type; Upload a file without units_sold; Review the validation result; Try to submit the upload",
        "Submission is blocked and the error clearly identifies the missing units_sold column.",
        "Missing column=units_sold",
      ],
      [
        "TC005",
        "Negative",
        "Invalid data types return field-level errors",
        "User is authenticated; CSV upload workspace is available",
        "Select Inventory CSV as the upload type; Upload a file with current_stock as text; Review the validation result",
        "The system rejects the file and shows a user-friendly type error for current_stock.",
        "current_stock=forty-five; stock_age_days=12",
      ],
      [
        "TC006",
        "Negative",
        "Malformed CSV is rejected safely",
        "User is authenticated; CSV upload workspace is available",
        "Open the CSV upload screen; Upload a malformed CSV file; Review the upload response",
        "The system rejects the malformed file without saving partial records and shows a clear correction message.",
        "Broken quote; Uneven column count",
      ],
      [
        "TC007",
        "Edge",
        "Oversized file respects configured limit",
        "Upload size limit is configured; User is authenticated",
        "Open the CSV upload screen; Select a CSV file larger than the configured limit; Start the upload",
        "The upload is rejected before processing and the user sees the allowed size limit.",
        "File size greater than configured limit",
      ],
      [
        "TC008",
        "Functional",
        "Duplicate records are normalized before persistence",
        "Database connection is available; User is authenticated",
        "Upload a CSV containing duplicate sku and date records; Review duplicate handling feedback; Confirm final submission",
        "Duplicate rows are handled according to the product rule and only normalized records are persisted.",
        "Duplicate sku=SKU-001; Duplicate date=2026-05-01",
      ],
      [
        "TC009",
        "API",
        "Upload endpoint returns documented validation schema",
        "Backend upload endpoint is available; User has a valid session",
        "Submit a CSV upload request to the backend endpoint; Include an invalid row; Inspect the API response",
        "The response includes success status, upload type, preview rows, and structured validation errors.",
        "uploadType=sales; invalid row=2",
      ],
      [
        "TC010",
        "Performance",
        "Large CSV processes within expected time",
        "Performance-like test environment is available; Database is reachable",
        "Prepare a valid 50000 row CSV; Upload the file; Measure total processing time",
        "The file is validated, normalized, and prepared for persistence within 10 seconds.",
        "50000 rows; Valid sales CSV",
      ],
      [
        "TC011",
        "UI",
        "Upload flow remains keyboard accessible",
        "CSV upload screen is available; User can navigate with keyboard only",
        "Open the upload screen; Move through controls using the keyboard; Select upload type; Trigger file upload and preview",
        "Focus order is visible and logical, controls have accessible names, and the flow can be completed without a mouse.",
        "Keyboard only; WCAG 2.2 AA focus check",
      ],
    ];

    return rows
      .slice(0, inferTargetCaseCount(requirement, coverage))
      .map((row) => row.map(cleanCell).join(" | "))
      .join("\n");
  }

  const isSignupStory = /\bsign\s*up\b|\bsignup\b|\bcreate account\b|\bregister\b|\baccount is created\b/i.test(
    requirement
  );

  if (isSignupStory) {
    const rows = [
      [
        "TC001",
        "Functional",
        "Create account opens complete signup form",
        "User is not signed in; GlowCart entry page is available",
        "Click Create Account; Review the opened signup form; Check required and optional controls",
        "The signup form opens and displays the expected required and optional fields.",
        "First Name; Last Name; Email; Mobile Number; Password; Confirm Password; Date of Birth; Gender; Skin Profile",
      ],
      [
        "TC002",
        "Negative",
        "Empty required signup fields block submission",
        "Signup form is open; Required fields are empty",
        "Click Submit; Review validation messages beside required fields",
        "Submission is blocked and required-field validation feedback is shown.",
        "Required fields left blank",
      ],
      [
        "TC003",
        "Negative",
        "Invalid email address is rejected",
        "Signup form is open; Required non-email fields contain valid values",
        "Enter an invalid email address; Complete remaining required fields; Select terms consent; Submit the form",
        "Submission is blocked and the email field shows invalid-format feedback.",
        "invalid-email",
      ],
      [
        "TC004",
        "Negative",
        "Password confirmation mismatch is rejected",
        "Signup form is open; Required profile fields contain valid values",
        "Enter a password; Enter a different confirm password; Select terms consent; Submit the form",
        "Submission is blocked and password mismatch feedback is shown.",
        "Password=GlowCart@123; Confirm Password=GlowCart@124",
      ],
      [
        "TC005",
        "Negative",
        "Short mobile number blocks account creation",
        "Signup form is open; Required non-phone fields contain valid values",
        "Enter fewer than 10 digits in Mobile Number; Select terms consent; Submit the form",
        "Submission is blocked and phone length validation feedback is shown.",
        "Mobile Number=95213",
      ],
      [
        "TC006",
        "Negative",
        "Terms consent is required before signup",
        "Signup form is open; All required text fields contain valid values",
        "Leave Terms and Privacy Policy unchecked; Submit the form",
        "Submission is blocked until the Terms and Privacy Policy checkbox is selected.",
        "Terms checkbox unchecked",
      ],
      [
        "TC007",
        "UI",
        "Dropdown selections save valid signup choices",
        "Signup form is open; Dropdown option data is available",
        "Open Gender dropdown; Select a gender; Open Skin Profile dropdown; Select a skin profile; Select a Beauty Interest option if present",
        "Selected dropdown values remain visible and are included in the signup data.",
        "Gender=Female; Skin Profile=Sensitive; Beauty Interest=Skincare",
      ],
      [
        "TC008",
        "Functional",
        "Optional signup fields do not block submission",
        "Signup form is open; Required fields contain valid values; Terms consent is selected",
        "Leave optional fields blank; Leave newsletter unchecked; Submit the form",
        "The account can be created without optional preferences, referral code, address, or newsletter consent.",
        "Referral Code blank; Address blank; Newsletter unchecked",
      ],
      [
        "TC009",
        "UI",
        "Password visibility toggle shows and hides values",
        "Signup form is open; Password fields contain entered values",
        "Click the password visibility toggle; Confirm the value is visible; Click the toggle again; Repeat for Confirm Password",
        "Password and confirm password values can be shown and hidden without changing the entered text.",
        "Password=GlowCart@123",
      ],
      [
        "TC010",
        "Functional",
        "Sign in link switches from signup",
        "Signup form is open",
        "Click Already have account Sign in link; Review the displayed authentication form",
        "The user is moved from signup to the sign-in flow.",
        "Existing user path",
      ],
      [
        "TC011",
        "Functional",
        "Valid signup creates account successfully",
        "Signup form is open; User email is not already registered",
        "Enter all required valid details; Select dropdown values; Select Terms and Privacy Policy; Submit the form",
        "The account is created and success feedback is shown to the user.",
        "First Name=Sincara; Last Name=Glow; Email=sincara@example.com; Mobile=9521314567; Password=GlowCart@123",
      ],
      [
        "TC012",
        "Negative",
        "Missing date of birth blocks signup",
        "Signup form is open; Other required fields contain valid values; Terms consent is selected",
        "Leave Date of Birth empty; Submit the form; Review the date validation feedback",
        "Submission is blocked and Date of Birth is marked as required.",
        "Date of Birth blank",
      ],
      [
        "TC013",
        "Negative",
        "Missing skin profile blocks signup",
        "Signup form is open; Other required fields contain valid values; Terms consent is selected",
        "Leave Skin Profile unselected; Submit the form; Review the dropdown validation feedback",
        "Submission is blocked and Skin Profile is marked as required.",
        "Skin Profile unselected",
      ],
      [
        "TC014",
        "Functional",
        "Newsletter opt in is saved during signup",
        "Signup form is open; Required fields contain valid values; Terms consent is selected",
        "Select the Newsletter checkbox; Submit the form; Review the created account preferences",
        "The account is created and the newsletter preference is saved as selected.",
        "Newsletter checked",
      ],
    ];

    return rows
      .slice(0, inferTargetCaseCount(requirement, coverage))
      .map((row) => row.map(cleanCell).join(" | "))
      .join("\n");
  }

  const rows = [
    [
      "TC001",
      modeType,
      "Primary user completes required flow successfully",
      `User is authenticated; ${context} workspace is available`,
      "Open the relevant workflow; Enter the required information; Submit or complete the main action",
      "The system completes the flow and shows the expected successful outcome.",
      "Valid user inputs; Standard browser session",
    ],
    [
      "TC002",
      "Negative",
      "Required validation prevents incomplete submission",
      `User is authenticated; ${context} validation rules are configured`,
      "Open the relevant workflow; Leave required information missing; Submit the action",
      "The system blocks completion and shows clear validation guidance.",
      "Missing required values; Invalid or incomplete input",
    ],
    [
      "TC003",
      "Edge",
      "Boundary input remains stable and understandable",
      `User is authenticated; ${context} workflow is available`,
      "Open the relevant workflow; Enter boundary or unusually long input; Complete the main action",
      "The system handles the boundary input without data loss, layout breakage, or unclear feedback.",
      "Long text value; Minimum or maximum allowed value",
    ],
    [
      "TC004",
      "UI",
      "Keyboard and focus flow supports completion",
      `User-facing interface exists; ${context} screen is available`,
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
      return "Generate a concise set covering only the most important scenarios. For a multi-section story, target about 5 to 7 distinct cases.";
    case "thorough":
      return "Generate deeper coverage including main flows, alternate flows, negative paths, and important edge scenarios where relevant. For a multi-section epic or story, target about 12 to 18 distinct cases.";
    case "standard":
    default:
      return "Generate balanced coverage with a practical mix of core flows and meaningful validation scenarios. For a multi-section epic or story, target about 8 to 14 distinct cases.";
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
  let coverage = "standard";

  try {
    const body = await req.json();

    requirement =
      typeof body?.requirement === "string" ? body.requirement.trim() : "";

    mode = typeof body?.mode === "string" ? body.mode : "functional";

    coverage = typeof body?.coverage === "string" ? body.coverage : "standard";
    const persona =
      typeof body?.persona === "string" ? body.persona : "all";
    const orchestration =
      typeof body?.orchestration === "string" ? body.orchestration.trim() : "";
    const targetCaseCount = inferTargetCaseCount(requirement, coverage);

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

Cognitive Orchestration:
${orchestration || "No orchestration override was provided. Infer the best QA mix from the requirement, mode, coverage, and persona."}

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
- Preconditions must be concise and must not copy long raw requirement, epic, story, or markdown text
- Use a short module phrase in Preconditions, such as "CSV upload workspace is available", instead of pasting the requirement title
- Steps should contain actions only, not expected outcomes
- Use 3 to 6 steps unless the requirement genuinely needs fewer or more
- Expected Result must describe the final observable outcome in one concise sentence
- Test Data should include realistic example inputs when they help execution; otherwise use None
- Do not repeat near-identical test cases
- Each test case should be realistic and distinct
- Decide the appropriate number of test cases based on requirement scope and complexity
- For this requirement and selected coverage, target around ${targetCaseCount} meaningful test cases
- The selected coverage depth should influence how broad or deep the output is
- The selected persona should materially influence permissions, starting state, and expected behavior
- Follow the Cognitive Orchestration guidance when deciding the mix of functional, negative, edge, WCAG, security, regression, and automation-ready cases
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
        result: buildFallbackCases(requirement, mode, coverage),
        warning: getGenerationErrorMessage(error),
      });
    }

    return Response.json(
      { result: getGenerationErrorMessage(error) },
      { status: 500 }
    );
  }
}
