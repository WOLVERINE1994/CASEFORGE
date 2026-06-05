import { type Persona, toPersonaLabel } from "./workspace";

export type TestCaseRow = {
  id: string;
  type: string;
  title: string;
  preconditions: string;
  steps: string;
  expectedResult: string;
  gapSourceId?: string;
  gapSourceLabel?: string;
  gapSourceMethod?: "auto" | "manual";
};

export type CoverageGapSeverity = "high" | "medium" | "low";

export type CoverageGap = {
  id: string;
  title: string;
  severity: CoverageGapSeverity;
  summary: string;
  recommendation: string;
};

export type CoverageGapAnalysis = {
  score: number;
  status: "strong" | "watch" | "weak";
  gaps: CoverageGap[];
  strengths: string[];
};

export const coverageGapTitles: Record<string, string> = {
  "negative-gap": "Negative coverage is thin",
  "edge-gap": "Boundary and edge cases are missing",
  "failure-gap": "Failure-path handling is under-tested",
  "role-gap": "Role and permission coverage is missing",
  "state-gap": "State transition coverage is limited",
  "data-gap": "Concrete test data coverage is weak",
  "api-mode-gap": "Requested API focus is not strongly reflected",
  "ui-mode-gap": "Requested UI focus is not strongly reflected",
  "regression-mode-gap": "Regression intent is not visible enough",
  "persona-gap": "Persona-specific coverage is missing",
  "accessibility-gap": "WCAG accessibility coverage is missing",
};

export const getCoverageGapTitle = (gapId: string) =>
  coverageGapTitles[gapId] ?? "Coverage gap";

export const createManualGapDraft = (gapId: string) => {
  switch (gapId) {
    case "persona-gap":
      return {
        type: "Functional",
        title: "Verify the selected persona can only follow its intended journey",
        preconditions:
          "Requirement is implemented; The selected persona can access the relevant entry point or restriction state",
        steps:
          "Prepare the selected persona state; Open the target flow; Attempt the intended action; Observe permissions, messaging, and resulting behavior",
        expectedResult:
          "The experience matches the selected persona's permissions, restrictions, and expected workflow",
      };
    case "negative-gap":
      return {
        type: "Negative",
        title: "Verify the system rejects invalid input for this flow",
        preconditions: "Requirement is implemented; User can access the target flow",
        steps:
          "Open the target flow; Enter invalid or incomplete input; Submit the action; Observe validation behavior",
        expectedResult:
          "The action is rejected and a clear validation or failure message is shown",
      };
    case "edge-gap":
      return {
        type: "Edge",
        title: "Verify boundary input handling for this flow",
        preconditions: "Requirement is implemented; Boundary values are identified",
        steps:
          "Open the target flow; Enter minimum boundary value; Repeat with maximum or empty value; Submit each variation",
        expectedResult:
          "The system handles each boundary value correctly without unexpected behavior",
      };
    case "failure-gap":
      return {
        type: "Negative",
        title: "Verify failure handling when a dependent action cannot complete",
        preconditions:
          "Requirement is implemented; A dependency can fail or be simulated as unavailable",
        steps:
          "Trigger the target action; Simulate timeout, outage, or failure; Observe retry or fallback behavior",
        expectedResult:
          "The system shows a clear failure state and handles the interruption safely",
      };
    case "role-gap":
      return {
        type: "Negative",
        title: "Verify unauthorized users cannot perform the restricted action",
        preconditions:
          "Requirement is implemented; Two users with different permissions are available",
        steps:
          "Log in as a user without required permission; Attempt the restricted action; Observe access behavior",
        expectedResult:
          "The unauthorized user is blocked and the system protects the action correctly",
      };
    case "state-gap":
      return {
        type: "Functional",
        title: "Verify behavior changes correctly across business states",
        preconditions:
          "Requirement is implemented; The entity can move between relevant states",
        steps:
          "Prepare the entity in one business state; Perform the target action; Repeat for another state; Compare outcomes",
        expectedResult:
          "The system behavior matches the rules for each state transition",
      };
    case "data-gap":
      return {
        type: "Functional",
        title: "Verify the flow with representative business test data",
        preconditions:
          "Requirement is implemented; Valid and invalid sample data sets are available",
        steps:
          "Open the target flow; Execute the action with realistic data values; Repeat with invalid format or malformed input",
        expectedResult:
          "Valid data is accepted correctly and invalid data is handled with clear feedback",
      };
    case "api-mode-gap":
      return {
        type: "API",
        title: "Verify API request validation and response contract for the target endpoint",
        preconditions:
          "API is available; Authentication details and payload schema are known",
        steps:
          "Send a valid request to the target endpoint; Repeat with invalid payload or missing auth; Review status code and response body",
        expectedResult:
          "The API returns the correct status code, validation behavior, and response structure",
      };
    case "ui-mode-gap":
      return {
        type: "UI",
        title: "Verify the target UI interaction and visible state changes",
        preconditions:
          "Feature is accessible in the UI; Required screen and controls are available",
        steps:
          "Open the target page; Interact with the relevant control or field; Observe labels, states, and visible feedback",
        expectedResult:
          "The UI responds correctly and presents the expected labels, states, and feedback",
      };
    case "accessibility-gap":
      return {
        type: "UI",
        title: "Verify keyboard focus and accessible feedback for the target flow",
        preconditions:
          "Requirement is implemented; User-facing UI is available; WCAG 2.2 AA review is in scope",
        steps:
          "Open the target flow; Navigate through interactive controls using keyboard only; Confirm visible focus order and control names; Trigger a validation or status message if relevant",
        expectedResult:
          "The flow remains operable and understandable with keyboard navigation, visible focus, accessible names, and clear feedback",
      };
    case "regression-mode-gap":
      return {
        type: "Regression",
        title: "Verify an existing core flow still works after the recent change",
        preconditions:
          "Feature change is deployed; A previously working business flow is available",
        steps:
          "Execute the previously stable business flow; Complete the expected user actions; Compare the outcome with prior expected behavior",
        expectedResult:
          "The existing flow continues to work without regression",
      };
    default:
      return {
        type: "Functional",
        title: "Verify missing coverage for the target workflow",
        preconditions: "Requirement is implemented",
        steps:
          "Open the target flow; Execute the relevant scenario; Observe the resulting system behavior",
        expectedResult:
          "The system handles the scenario correctly",
      };
  }
};

const hasAny = (content: string, patterns: RegExp[]) =>
  patterns.some((pattern) => pattern.test(content));

export const analyzeCoverageGaps = (
  rows: TestCaseRow[],
  mode: string,
  persona: Persona = "all"
): CoverageGapAnalysis => {
  if (rows.length === 0) {
    return {
      score: 0,
      status: "weak",
      gaps: [],
      strengths: [],
    };
  }

  const content = rows
    .map((row) =>
      [
        row.type,
        row.title,
        row.preconditions,
        row.steps,
        row.expectedResult,
      ].join(" ")
    )
    .join(" ")
    .toLowerCase();

  const types = new Set(rows.map((row) => row.type.trim()).filter(Boolean));
  const gaps: CoverageGap[] = [];
  const strengths: string[] = [];

  const hasNegativeCoverage =
    types.has("Negative") ||
    hasAny(content, [/\binvalid\b/, /\berror\b/, /\breject\b/, /\bfail\b/, /\bdenied\b/]);
  const hasEdgeCoverage =
    types.has("Edge") ||
    hasAny(content, [/\bmax\b/, /\bmin\b/, /\bboundary\b/, /\bempty\b/, /\blimit\b/, /\boverflow\b/]);
  const hasFailureCoverage = hasAny(content, [
    /\btimeout\b/,
    /\bservice unavailable\b/,
    /\bretry\b/,
    /\bfallback\b/,
    /\bnetwork\b/,
    /\berror message\b/,
  ]);
  const hasRoleCoverage = hasAny(content, [
    /\badmin\b/,
    /\bguest\b/,
    /\buser role\b/,
    /\bpermission\b/,
    /\bauthori[sz]ed\b/,
    /\bunauthori[sz]ed\b/,
  ]);
  const hasStateCoverage = hasAny(content, [
    /\bdraft\b/,
    /\bactive\b/,
    /\binactive\b/,
    /\bsubmitted\b/,
    /\bapproved\b/,
    /\bstatus\b/,
    /\bstate\b/,
  ]);
  const hasDataCoverage = hasAny(content, [
    /\bvalid\b/,
    /\binvalid\b/,
    /\bpayload\b/,
    /\bjson\b/,
    /\btoken\b/,
    /\bemail\b/,
    /\binput\b/,
  ]);
  const hasPersonaCoverage =
    persona === "all"
      ? true
      : persona === "first-time-user"
      ? hasAny(content, [/\bfirst[- ]time\b/, /\bonboarding\b/, /\bempty state\b/, /\bnew user\b/])
      : persona === "returning-user"
      ? hasAny(content, [/\breturning\b/, /\bexisting\b/, /\bsaved\b/, /\bresume\b/, /\blast-used\b/])
      : persona === "blocked-user"
      ? hasAny(content, [/\bblocked\b/, /\brestricted\b/, /\bsuspended\b/, /\bdenied\b/])
      : hasAny(content, [new RegExp(`\\b${persona.replace("-", "[- ]")}\\b`)]);
  const hasAccessibilityCoverage = hasAny(content, [
    /\bwcag\b/,
    /\baccessib/,
    /\bscreen reader\b/,
    /\baria\b/,
    /\bkeyboard\b/,
    /\btab order\b/,
    /\bfocus\b/,
    /\bcontrast\b/,
    /\bzoom\b/,
    /\breflow\b/,
    /\balt text\b/,
    /\bcaption\b/,
    /\bsemantic\b/,
    /\blandmark\b/,
  ]);

  if (!hasNegativeCoverage) {
    gaps.push({
      id: "negative-gap",
      title: "Negative coverage is thin",
      severity: "high",
      summary:
        "The current suite focuses more on expected behavior than invalid or rejected paths.",
      recommendation:
        "Add cases for invalid input, blocked actions, missing fields, and rejection behavior.",
    });
  } else {
    strengths.push("Negative-path checks are represented in the current suite.");
  }

  if (!hasEdgeCoverage) {
    gaps.push({
      id: "edge-gap",
      title: "Boundary and edge cases are missing",
      severity: "medium",
      summary:
        "The suite does not clearly cover empty, minimum, maximum, or unusual values.",
      recommendation:
        "Add boundary-value cases for empty input, min/max length, large payloads, and unusual sequences.",
    });
  } else {
    strengths.push("Boundary and edge-case signals are present.");
  }

  if (!hasFailureCoverage) {
    gaps.push({
      id: "failure-gap",
      title: "Failure-path handling is under-tested",
      severity: "medium",
      summary:
        "There is limited evidence of timeout, outage, retry, or error-message validation.",
      recommendation:
        "Cover service failure, timeout, retry, and user-facing error states.",
    });
  } else {
    strengths.push("Failure-path handling appears in the generated coverage.");
  }

  if (!hasRoleCoverage) {
    gaps.push({
      id: "role-gap",
      title: "Role and permission coverage is missing",
      severity: "medium",
      summary:
        "The suite does not appear to validate access control, role restrictions, or unauthorized behavior.",
      recommendation:
        "Add cases for authorized and unauthorized users, role-specific visibility, and blocked actions.",
    });
  } else {
    strengths.push("Role or permission scenarios are covered.");
  }

  if (!hasStateCoverage) {
    gaps.push({
      id: "state-gap",
      title: "State transition coverage is limited",
      severity: "low",
      summary:
        "The cases do not clearly validate status changes or behavior across business states.",
      recommendation:
        "Add cases for draft, active, inactive, submitted, approved, and other state transitions.",
    });
  } else {
    strengths.push("State-based behavior appears in the suite.");
  }

  if (!hasDataCoverage) {
    gaps.push({
      id: "data-gap",
      title: "Concrete test data coverage is weak",
      severity: "low",
      summary:
        "The suite may be missing realistic input combinations, payload examples, or data-specific checks.",
      recommendation:
        "Add explicit sample inputs, invalid formats, payload variations, and representative test data.",
    });
  } else {
    strengths.push("The suite references concrete data or payload conditions.");
  }

  if (!hasPersonaCoverage && persona !== "all") {
    gaps.push({
      id: "persona-gap",
      title: "Persona-specific coverage is missing",
      severity: "medium",
      summary:
        `The suite does not clearly show how the ${toPersonaLabel(persona).toLowerCase()} experience should behave.`,
      recommendation:
        `Add cases that validate the ${toPersonaLabel(persona).toLowerCase()} journey, permissions, messaging, and restrictions.`,
    });
  } else if (persona !== "all") {
    strengths.push(`${toPersonaLabel(persona)} behavior is represented in the suite.`);
  }

  if (mode === "api" && !types.has("API")) {
    gaps.push({
      id: "api-mode-gap",
      title: "Requested API focus is not strongly reflected",
      severity: "high",
      summary:
        "The suite does not show enough API-oriented cases for the selected generation mode.",
      recommendation:
        "Add endpoint, payload, status code, auth token, and response contract validation cases.",
    });
  }

  if (mode === "ui" && !types.has("UI")) {
    gaps.push({
      id: "ui-mode-gap",
      title: "Requested UI focus is not strongly reflected",
      severity: "high",
      summary:
        "The suite does not show enough UI-specific checks for the selected generation mode.",
      recommendation:
        "Add visual state, field behavior, layout, navigation, and interaction validation cases.",
    });
  }

  if ((mode === "accessibility" || mode === "ui") && !hasAccessibilityCoverage) {
    gaps.push({
      id: "accessibility-gap",
      title: "WCAG accessibility coverage is missing",
      severity: mode === "accessibility" ? "high" : "medium",
      summary:
        "The suite does not clearly validate WCAG-oriented accessibility behavior for the user-facing flow.",
      recommendation:
        "Add cases for keyboard navigation, visible focus, accessible names, form error association, contrast, zoom/reflow, screen reader announcements, and alt text where relevant.",
    });
  } else if (hasAccessibilityCoverage) {
    strengths.push("Accessibility or WCAG-oriented validation is represented.");
  }

  if (mode === "regression" && !types.has("Regression")) {
    gaps.push({
      id: "regression-mode-gap",
      title: "Regression intent is not visible enough",
      severity: "medium",
      summary:
        "The suite does not clearly demonstrate backward-compatibility or existing-flow protection.",
      recommendation:
        "Add cases that verify existing behavior remains unchanged after the new update.",
    });
  }

  const penalty = gaps.reduce((total, gap) => {
    if (gap.severity === "high") {
      return total + 18;
    }

    if (gap.severity === "medium") {
      return total + 10;
    }

    return total + 5;
  }, 0);

  const score = Math.max(0, Math.min(100, 100 - penalty));
  const status = score >= 75 ? "strong" : score >= 45 ? "watch" : "weak";

  return {
    score,
    status,
    gaps,
    strengths,
  };
};
