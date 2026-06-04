import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

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
    case "security":
      return "Focus on defensive security validation for systems the user owns or is authorized to test. Cover authentication, authorization, session handling, input validation, sensitive data protection, secure error handling, upload safety, API boundary validation, abuse resistance, and business-logic misuse prevention. Do not produce exploit instructions, payload libraries, or offensive hacking content.";
    case "accessibility":
      return "Focus on manual accessibility and WCAG-oriented validation. Cover keyboard navigation, visible focus order, focus management, semantic labels, form labels and error associations, alt text expectations, heading structure, color contrast review points, screen reader behavior, zoom and reflow, status announcements, clear link/button labels, and motion/accessibility considerations where relevant.";
    case "regression":
      return "Focus on core workflows that should remain stable after changes, including key business flows and previously working behaviors.";
    case "salesforce":
      return "Focus on Salesforce business workflows and enterprise validation. Cover Accounts, Contacts, Leads, Opportunities, Cases, Campaigns, custom objects, validation rules, field behavior, page layouts, related lists, Lightning UI flows, role/profile permissions, approval processes, Flow and Process validation, search and list views, reporting visibility, integrations, negative paths, and realistic business edge cases.";
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

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function requirementSection(requirement: string, heading: string, stopHeadings: string[]) {
  const lines = requirement.split(/\r?\n/);
  const startIndex = lines.findIndex((line) =>
    new RegExp(`^\\s*${heading}\\s*:?\\s*$`, "i").test(line),
  );
  if (startIndex < 0) return "";
  const stopIndex = lines.findIndex((line, index) => {
    if (index <= startIndex) return false;
    return stopHeadings.some((stopHeading) =>
      new RegExp(`^\\s*${stopHeading}\\s*:?\\s*$`, "i").test(line),
    );
  });
  return lines.slice(startIndex + 1, stopIndex < 0 ? undefined : stopIndex).join("\n");
}

function countAcceptanceCriteria(requirement: string) {
  const section = requirementSection(requirement, "Acceptance Criteria", [
    "Definition of Done",
    "DoD",
    "Scope",
    "Description",
  ]);
  const source = section || requirement;
  return source
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*\d.)\s]+/, "").trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^(acceptance criteria|definition of done|scope|description|story)$/i.test(line))
    .length;
}

function countFormFields(requirement: string) {
  const fieldLikeLines = requirement
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*\d.)\s]+/, "").trim())
    .filter((line) => line.length >= 3 && line.length <= 42)
    .filter((line) => !/[.!?]$/.test(line))
    .filter((line) =>
      /\b(field|name|email|mobile|phone|password|date|gender|dropdown|profile|checkbox|code|address|newsletter|interest)\b/i.test(
        line,
      ),
    );
  return new Set(fieldLikeLines.map((line) => line.toLowerCase())).size;
}

function countValidationRules(requirement: string) {
  const matches = requirement.match(
    /\bcannot submit\b|\binvalid\b|\brequired\b|\bmust\b|\bunless\b|\bnot match\b|\bless than\b|\bminimum\b|\bmaximum\b|\bcheckbox\b|\btoggle\b|\bsuccessful\b|\bswitch\b/gi,
  );
  return matches?.length ?? 0;
}

function generationCaseTarget(requirement: string, coverage: string) {
  const criteriaCount = countAcceptanceCriteria(requirement);
  const fieldCount = countFormFields(requirement);
  const validationCount = countValidationRules(requirement);
  const complexityScore =
    criteriaCount + Math.ceil(fieldCount / 4) + Math.ceil(validationCount / 2);

  const bounds =
    coverage === "basic"
      ? { min: 4, max: 8, ratio: 0.55 }
      : coverage === "thorough"
        ? { min: 10, max: 22, ratio: 1 }
        : { min: 6, max: 16, ratio: 0.8 };

  const target = clamp(Math.ceil(complexityScore * bounds.ratio), bounds.min, bounds.max);
  const minimum = clamp(Math.min(target, Math.max(bounds.min, target - 2)), bounds.min, target);
  return {
    criteriaCount,
    fieldCount,
    minimum,
    target,
    validationCount,
  };
}

function countGeneratedRows(result: string) {
  return result
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^TC\d+\s*\|/.test(line))
    .filter((line) => line.split("|").length >= 7)
    .length;
}

function includesAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

function buildFallbackRows(requirement: string, mode: string, target: number) {
  const normalized = requirement.toLowerCase();
  const rows: Array<{
    type: string;
    title: string;
    preconditions: string;
    steps: string;
    expectedResult: string;
    testData: string;
  }> = [];
  const hasSignup = includesAny(normalized, [
    /\bsign\s*up\b/,
    /\bsignup\b/,
    /\bcreate account\b/,
    /\bregister\b/,
    /\baccount is created\b/,
  ]);
  const hasForm = hasSignup || includesAny(normalized, [/\bform\b/, /\bfield\b/]);
  const primaryType =
    mode === "ui" ? "UI" : mode === "negative" ? "Negative" : "Functional";

  if (hasSignup || hasForm) {
    rows.push(
      {
        type: primaryType,
        title: "Create account opens complete signup form",
        preconditions: "User is on the GlowCart entry page; User is not signed in",
        steps: "Click Create Account; Review the opened signup form; Check required and optional controls",
        expectedResult:
          "The signup form opens and displays the expected required and optional fields",
        testData:
          "First Name; Last Name; Email; Mobile Number; Password; Confirm Password; Date of Birth; Gender; Skin Profile",
      },
      {
        type: "Negative",
        title: "Empty required signup fields block submission",
        preconditions: "Signup form is open; Required fields are empty",
        steps: "Click Submit; Review validation messages beside required fields",
        expectedResult:
          "Submission is blocked and required-field validation feedback is shown",
        testData: "Required fields left blank",
      },
      {
        type: "Negative",
        title: "Invalid email address is rejected",
        preconditions: "Signup form is open; Required non-email fields contain valid values",
        steps: "Enter an invalid email address; Complete remaining required fields; Select terms consent; Submit the form",
        expectedResult:
          "Submission is blocked and the email field shows invalid-format feedback",
        testData: "invalid-email",
      },
      {
        type: "Negative",
        title: "Password confirmation mismatch is rejected",
        preconditions: "Signup form is open; Required profile fields contain valid values",
        steps: "Enter a password; Enter a different confirm password; Select terms consent; Submit the form",
        expectedResult:
          "Submission is blocked and password mismatch feedback is shown",
        testData: "Password: GlowCart@123; Confirm Password: GlowCart@124",
      },
      {
        type: "Negative",
        title: "Short mobile number blocks account creation",
        preconditions: "Signup form is open; Required non-phone fields contain valid values",
        steps: "Enter fewer than 10 digits in Mobile Number; Select terms consent; Submit the form",
        expectedResult:
          "Submission is blocked and phone length validation feedback is shown",
        testData: "95213",
      },
      {
        type: "Negative",
        title: "Terms consent is required before signup",
        preconditions: "Signup form is open; All required text fields contain valid values",
        steps: "Leave Terms and Privacy Policy unchecked; Submit the form",
        expectedResult:
          "Submission is blocked until the Terms and Privacy Policy checkbox is selected",
        testData: "Terms checkbox unchecked",
      },
      {
        type: "UI",
        title: "Dropdown selections save valid signup choices",
        preconditions: "Signup form is open; Dropdown option data is available",
        steps: "Open Gender dropdown; Select a gender; Open Skin Profile dropdown; Select a skin profile; Select a Beauty Interest option if present",
        expectedResult:
          "Selected dropdown values remain visible and are included in the signup data",
        testData: "Gender: Female; Skin Profile: Sensitive; Beauty Interest: Skincare",
      },
      {
        type: "Functional",
        title: "Optional signup fields do not block submission",
        preconditions: "Signup form is open; Required fields contain valid values; Terms consent is selected",
        steps: "Leave optional fields blank; Leave newsletter unchecked; Submit the form",
        expectedResult:
          "The account can be created without optional preferences, referral code, address, or newsletter consent",
        testData: "Referral Code: blank; Address: blank; Newsletter: unchecked",
      },
      {
        type: "UI",
        title: "Password visibility toggle shows and hides values",
        preconditions: "Signup form is open; Password fields contain entered values",
        steps: "Click the password visibility toggle; Confirm the value is visible; Click the toggle again; Repeat for Confirm Password",
        expectedResult:
          "Password and confirm password values can be shown and hidden without changing the entered text",
        testData: "Password: GlowCart@123",
      },
      {
        type: "Functional",
        title: "Sign in link switches from signup",
        preconditions: "Signup form is open",
        steps: "Click Already have account Sign in link; Review the displayed authentication form",
        expectedResult:
          "The user is moved from signup to the sign-in flow",
        testData: "Existing user path",
      },
      {
        type: "Functional",
        title: "Valid signup creates account successfully",
        preconditions: "Signup form is open; User email is not already registered",
        steps: "Enter all required valid details; Select dropdown values; Select Terms and Privacy Policy; Submit the form",
        expectedResult:
          "The account is created and success feedback is shown to the user",
        testData:
          "First Name: Sincara; Last Name: Glow; Email: sincara@example.com; Mobile: 9521314567; Password: GlowCart@123",
      },
      {
        type: "Negative",
        title: "Missing date of birth blocks signup",
        preconditions: "Signup form is open; Other required fields contain valid values; Terms consent is selected",
        steps: "Leave Date of Birth empty; Submit the form; Review the date validation feedback",
        expectedResult:
          "Submission is blocked and Date of Birth is marked as required",
        testData: "Date of Birth: blank",
      },
      {
        type: "Negative",
        title: "Missing gender selection blocks signup",
        preconditions: "Signup form is open; Other required fields contain valid values; Terms consent is selected",
        steps: "Leave Gender unselected; Submit the form; Review the dropdown validation feedback",
        expectedResult:
          "Submission is blocked and Gender is marked as required",
        testData: "Gender: unselected",
      },
      {
        type: "Negative",
        title: "Missing skin profile blocks signup",
        preconditions: "Signup form is open; Other required fields contain valid values; Terms consent is selected",
        steps: "Leave Skin Profile unselected; Submit the form; Review the dropdown validation feedback",
        expectedResult:
          "Submission is blocked and Skin Profile is marked as required",
        testData: "Skin Profile: unselected",
      },
      {
        type: "Functional",
        title: "Newsletter opt in is saved during signup",
        preconditions: "Signup form is open; Required fields contain valid values; Terms consent is selected",
        steps: "Select the Newsletter checkbox; Submit the form; Review the created account preferences",
        expectedResult:
          "The account is created and the newsletter preference is saved as selected",
        testData: "Newsletter: checked",
      },
      {
        type: "Functional",
        title: "Referral and address submit with valid signup",
        preconditions: "Signup form is open; Required fields contain valid values; Terms consent is selected",
        steps: "Enter a referral code; Enter an address; Submit the form; Review signup success feedback",
        expectedResult:
          "The account is created and optional referral and address values are accepted",
        testData: "Referral Code: GLOW10; Address: 12 Market Street",
      }
    );
  }

  if (rows.length === 0) {
    rows.push(
      {
        type: primaryType,
        title: "Primary user flow completes successfully",
        preconditions: "Requirement is implemented; User has valid starting data",
        steps: "Open the target flow; Complete the required inputs; Submit or finish the action",
        expectedResult: "The user completes the intended flow successfully",
        testData: "Valid requirement-specific data",
      },
      {
        type: "Negative",
        title: "Missing required input blocks completion",
        preconditions: "Requirement is implemented; User is on the target flow",
        steps: "Leave required input missing; Attempt to complete the action",
        expectedResult:
          "The action is blocked and clear validation feedback is shown",
        testData: "Required input omitted",
      }
    );
  }

  return rows
    .slice(0, Math.max(1, target))
    .map(
      (row, index) =>
        `TC${String(index + 1).padStart(3, "0")} | ${row.type} | ${row.title} | ${row.preconditions} | ${row.steps} | ${row.expectedResult} | ${row.testData}`
    )
    .join("\n");
}

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

    if (!requirement) {
      return Response.json(
        { result: "Requirement is missing." },
        { status: 400 }
      );
    }

    const modeInstructions = getModeInstructions(mode);
    const coverageInstructions = getCoverageInstructions(coverage);
    const personaInstructions = getPersonaInstructions(persona);
    const caseTarget = generationCaseTarget(requirement, coverage);
    const coveragePlanning = `Coverage Planning:
- Estimated acceptance criteria: ${caseTarget.criteriaCount}
- Estimated form fields and controls: ${caseTarget.fieldCount}
- Estimated validation rules and behavioral checks: ${caseTarget.validationCount}
- Target total test cases for this requirement: ${caseTarget.target}
- Minimum acceptable test cases for this requirement: ${caseTarget.minimum}
- For detailed form stories, do not collapse distinct field presence, validation, consent, dropdown, navigation, visibility-toggle, and success behaviors into a tiny happy-path set.
- Create separate test cases for each meaningful validation rule and each distinct interactive behavior until the target is reached.
- If there are many required fields, one field-presence case may cover them, but individual validation rules should remain separate.`;

    const chatCompletion = await groq.chat.completions.create({
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

${coveragePlanning}

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
- For this requirement, aim for exactly ${caseTarget.target} rows and do not return fewer than ${caseTarget.minimum} rows unless the requirement genuinely has fewer distinct behaviors
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
- For accessibility mode, prefer practical WCAG-oriented manual checks with observable expected outcomes

Format exactly like this:
TC001 | Functional | Title | Preconditions item 1; Preconditions item 2 | Step 1; Step 2; Step 3 | Expected Result | Test Data item 1; Test Data item 2

Example:
TC001 | Functional | Returning user signs in with valid credentials | User account exists; Account is active | Open login page; Enter a valid email; Enter a valid password; Click Sign in | The user reaches the dashboard and sees an authenticated session | valid.user@example.com; Correct password`,
        },
      ],
    });

    let result = chatCompletion.choices[0]?.message?.content || "";
    result = result.replace(/\*\*/g, "").trim();
    const generatedRows = countGeneratedRows(result);

    if (generatedRows < caseTarget.minimum) {
      const retryCompletion = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You are a senior QA engineer regenerating an under-covered test suite. Follow the requested row count and output format exactly.",
          },
          {
            role: "user",
            content: `The previous generation returned only ${generatedRows} rows, which is below the minimum ${caseTarget.minimum}.

Regenerate the full suite for this requirement with exactly ${caseTarget.target} meaningful rows.

Requirement:
${requirement}

Generation Mode:
${mode}

Coverage Depth:
${coverage}

Persona:
${persona}

${coveragePlanning}

Return plain text only, one test case per line, exactly 7 pipe-separated columns:
ID | Type | Title | Preconditions | Steps | Expected Result | Test Data

Cover the form opening, all required and optional field presence, mandatory validation, invalid email, password mismatch, phone length, terms checkbox, dropdown selections, optional fields, newsletter checkbox, password visibility toggle, sign-in link, and successful signup when present in the requirement.
Do not use markdown or commentary.`,
          },
        ],
      });
      const retryResult = retryCompletion.choices[0]?.message?.content?.replace(/\*\*/g, "").trim() || "";
      if (countGeneratedRows(retryResult) >= generatedRows) {
        result = retryResult;
      }
    }

    if (countGeneratedRows(result) < caseTarget.minimum) {
      result = buildFallbackRows(requirement, mode, caseTarget.target);
    }

    return Response.json({ result });
  } catch (error) {
    console.error("AI ERROR:", error);

    return Response.json(
      { result: "Error generating test cases. Check server logs." },
      { status: 500 }
    );
  }
}
