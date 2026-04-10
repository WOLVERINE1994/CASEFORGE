import { type Persona, toPersonaLabel } from "./workspace";

export type DefectSeverity = "high" | "medium" | "low";
type TestCaseRow = {
  id: string;
  type: string;
  title: string;
  preconditions: string;
  steps: string;
  expectedResult: string;
  testData?: string;
};

export type DefectPrediction = {
  id: string;
  title: string;
  severity: DefectSeverity;
  reason: string;
  requirementSignal: string;
  suggestedTestFocus: string;
  relatedRowIds: string[];
  coverageStatus: "covered" | "partial" | "uncovered";
};

export type BugPredictionAnalysis = {
  score: number;
  status: "contained" | "watch" | "hot";
  predictions: DefectPrediction[];
  strengths: string[];
};

export const bugPredictionTitles: Record<string, string> = {
  "role-leakage": "Role leakage",
  "validation-mismatch": "Validation mismatch",
  "timeout-handling": "Timeout handling bug risk",
  "state-transition": "State sync issue",
  "stale-ui": "Stale UI or dashboard sync risk",
  "ownership-visibility": "Ownership or visibility leak",
  "persona-gap": "Persona journey mismatch",
};

export const getBugPredictionTitle = (predictionId: string) =>
  bugPredictionTitles[predictionId] ?? "Likely defect zone";

export const createManualPredictionDraft = (
  predictionId: string,
  persona: Persona = "all"
) => {
  const personaContext =
    persona === "all"
      ? "Relevant user persona is available"
      : `${toPersonaLabel(persona)} scenario is available`;

  switch (predictionId) {
    case "role-leakage":
      return {
        type: "Negative",
        title: "Verify unauthorized users cannot access restricted billing actions",
        preconditions: `Requirement is implemented; ${personaContext}; Accounts with different permissions are available`,
        steps:
          "Open the billing flow as an allowed user; Confirm the restricted action is visible; Repeat as an unauthorized user; Attempt the same action",
        expectedResult:
          "Authorized access is allowed and unauthorized access is blocked without exposing protected controls or data",
      };
    case "validation-mismatch":
      return {
        type: "Negative",
        title: "Verify billing updates reject invalid or incomplete input consistently",
        preconditions: `Requirement is implemented; ${personaContext}; Validation-triggering fields are identified`,
        steps:
          "Open the target billing form; Submit with missing mandatory input; Repeat with invalid format; Compare the error handling and blocked action behavior",
        expectedResult:
          "The system rejects invalid data consistently and shows clear validation guidance",
      };
    case "timeout-handling":
      return {
        type: "Negative",
        title: "Verify billing actions handle timeout or service outage safely",
        preconditions:
          `Requirement is implemented; ${personaContext}; A downstream timeout or outage can be simulated`,
        steps:
          "Trigger the target billing action; Simulate timeout or service unavailability; Observe retry, rollback, and user-visible feedback",
        expectedResult:
          "The failure is handled safely, the user sees a clear message, and no inconsistent billing state is created",
      };
    case "state-transition":
      return {
        type: "Functional",
        title: "Verify billing behavior stays consistent across account states",
        preconditions:
          `Requirement is implemented; ${personaContext}; Relevant account states can be prepared`,
        steps:
          "Prepare the account in one business state; Perform the billing action; Repeat in another state; Compare permissions, visibility, and outcomes",
        expectedResult:
          "Each state enforces the correct billing behavior without stale or contradictory outcomes",
      };
    case "stale-ui":
      return {
        type: "UI",
        title: "Verify dashboard data refreshes after billing changes",
        preconditions:
          `Requirement is implemented; ${personaContext}; Billing data is visible on a dashboard or summary view`,
        steps:
          "Open the dashboard; Change billing-related data; Return to the summary view; Refresh or revisit linked pages",
        expectedResult:
          "The latest billing state is reflected consistently across the UI without stale values",
      };
    case "ownership-visibility":
      return {
        type: "Negative",
        title: "Verify billing data is visible only to the correct account owner",
        preconditions:
          `Requirement is implemented; ${personaContext}; More than one account or user context is available`,
        steps:
          "Access billing artifacts as the intended account owner; Attempt to access the same artifacts from another account or direct link; Observe visibility and permissions",
        expectedResult:
          "Billing data remains scoped to the correct owner and cross-user access is blocked",
      };
    case "persona-gap":
      return {
        type: "Functional",
        title: `Verify the ${toPersonaLabel(persona).toLowerCase()} journey follows the intended billing behavior`,
        preconditions:
          `Requirement is implemented; ${personaContext}; Persona-specific entry conditions are available`,
        steps:
          "Prepare the selected persona state; Open the billing flow; Attempt the intended journey; Observe messaging, redirects, permissions, and outcomes",
        expectedResult:
          "The selected persona experiences the correct billing journey without missing restrictions or unexpected access",
      };
    default:
      return {
        type: "Functional",
        title: "Verify the likely defect zone is covered by a targeted test case",
        preconditions: `Requirement is implemented; ${personaContext}`,
        steps:
          "Open the target flow; Execute the risk-focused scenario; Observe the system behavior under the predicted defect condition",
        expectedResult:
          "The system handles the predicted risk area correctly",
      };
  }
};

const hasAny = (content: string, patterns: RegExp[]) =>
  patterns.some((pattern) => pattern.test(content));

const splitRequirementIntoSentences = (requirement: string) =>
  requirement
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((item) => item.trim())
    .filter(Boolean);

const findSignalSentence = (sentences: string[], patterns: RegExp[]) =>
  sentences.find((sentence) => hasAny(sentence.toLowerCase(), patterns)) ??
  "Signal inferred from the overall requirement wording.";

const rolePatterns = [
  /\badmin\b/,
  /\bguest\b/,
  /\bblocked\b/,
  /\bpermission\b/,
  /\baccess\b/,
  /\bauthenticated\b/,
  /\bunauthenticated\b/,
  /\bredirect(?:ed)?\b/,
  /\baccess denied\b/,
];

const validationPatterns = [
  /\bvalidation\b/,
  /\bvalidate\b/,
  /\brequired\b/,
  /\binvalid\b/,
  /\bformat\b/,
  /\berror\b/,
  /\brejected?\b/,
  /\bmissing\b/,
];

const failurePatterns = [
  /\bfail\b/,
  /\bfailure\b/,
  /\btimeout\b/,
  /\btimes out?\b/,
  /\bunavailable\b/,
  /\bretry\b/,
  /\bfallback\b/,
  /\bservice\b/,
];

const statePatterns = [
  /\bstatus\b/,
  /\bstate\b/,
  /\bactive\b/,
  /\binactive\b/,
  /\bsubmitted\b/,
  /\bapproved\b/,
  /\bcan only\b.*\bwhen\b/,
  /\bcannot\b.*\bwhen\b/,
];

const syncPatterns = [
  /\bdashboard\b/,
  /\blist\b/,
  /\bhistory\b/,
  /\bsummary\b/,
  /\bdetails\b/,
  /\bpayment method\b/,
  /\bsubscription\b/,
  /\bupdate\b/,
];

const ownershipPatterns = [
  /\btheir own\b/,
  /\bown invoices?\b/,
  /\bowner(ship)?\b/,
  /\baccount\b/,
  /\buser\b/,
  /\binvoice\b/,
];

const integrationPatterns = [
  /\bservice\b/,
  /\bapi\b/,
  /\bbilling\b/,
  /\bpayment\b/,
  /\bgateway\b/,
  /\bwebhook\b/,
  /\bexternal\b/,
];

export const analyzeBugPredictions = (
  requirement: string,
  rows: TestCaseRow[] = [],
  persona: Persona = "all"
): BugPredictionAnalysis => {
  const normalized = requirement.trim().toLowerCase();
  const sentences = splitRequirementIntoSentences(requirement);

  if (!normalized) {
    return {
      score: 0,
      status: "hot",
      predictions: [],
      strengths: [],
    };
  }

  const predictions: DefectPrediction[] = [];
  const strengths: string[] = [];
  const personaLabel = toPersonaLabel(persona);
  const rowCorpus = rows.map((row) => ({
    id: row.id,
    content: [
      row.type,
      row.title,
      row.preconditions,
      row.steps,
      row.expectedResult,
      row.testData ?? "",
    ]
      .join(" ")
      .toLowerCase(),
  }));
  const findRelatedRows = (patterns: RegExp[]) =>
    rowCorpus
      .filter((row) => hasAny(row.content, patterns))
      .map((row) => row.id);
  const toCoverageStatus = (rowIds: string[]) =>
    rowIds.length === 0
      ? "uncovered"
      : rowIds.length === 1
      ? "partial"
      : "covered";

  const hasRoleSignals = hasAny(normalized, rolePatterns);
  const hasValidationSignals = hasAny(normalized, validationPatterns);
  const hasFailureSignals = hasAny(normalized, failurePatterns);
  const hasStateSignals = hasAny(normalized, statePatterns);
  const hasSyncSignals = hasAny(normalized, syncPatterns);
  const hasOwnershipSignals = hasAny(normalized, ownershipPatterns);
  const hasIntegrationSignals = hasAny(normalized, integrationPatterns);
  const mentionsMultipleActors =
    [/\badmin\b/, /\bguest\b/, /\bblocked\b/, /\buser\b/, /\bauthenticated\b/].filter(
      (pattern) => pattern.test(normalized)
    ).length >= 2;

  if (mentionsMultipleActors || (persona !== "all" && hasRoleSignals)) {
    const relatedRowIds = findRelatedRows(rolePatterns);
    predictions.push({
      id: "role-leakage",
      title: "Role leakage",
      severity: hasRoleSignals ? "medium" : "high",
      reason:
        "Multiple actor types or access boundaries are present, which often leads to hidden actions or data leaking across permissions.",
      requirementSignal: findSignalSentence(sentences, rolePatterns),
      suggestedTestFocus:
        "Verify authorized and unauthorized access, hidden actions, redirects, and restricted billing operations for each actor.",
      relatedRowIds,
      coverageStatus: toCoverageStatus(relatedRowIds),
    });
  } else {
    strengths.push("Role complexity looks limited, which lowers permission-related defect risk.");
  }

  if (!hasValidationSignals) {
    const relatedRowIds = findRelatedRows(validationPatterns);
    predictions.push({
      id: "validation-mismatch",
      title: "Validation mismatch",
      severity: "high",
      reason:
        "The requirement describes business actions but does not clearly define invalid input, missing fields, or rejection behavior.",
      requirementSignal: "No strong validation language was detected in the requirement.",
      suggestedTestFocus:
        "Probe missing fields, invalid card details, malformed input, and mismatched UI/API validation responses.",
      relatedRowIds,
      coverageStatus: toCoverageStatus(relatedRowIds),
    });
  } else {
    strengths.push("Validation language is present, which lowers mismatch risk between expected and actual checks.");
  }

  if (hasIntegrationSignals && !hasFailureSignals) {
    const relatedRowIds = findRelatedRows([
      ...failurePatterns,
      ...integrationPatterns,
    ]);
    predictions.push({
      id: "timeout-handling",
      title: "Timeout handling bug risk",
      severity: "high",
      reason:
        "External billing or payment behavior is implied, but failure, retry, and outage behavior is still underspecified.",
      requirementSignal: findSignalSentence(sentences, integrationPatterns),
      suggestedTestFocus:
        "Test service outages, timeouts, retry behavior, rollback safety, and user-facing error states.",
      relatedRowIds,
      coverageStatus: toCoverageStatus(relatedRowIds),
    });
  } else if (hasFailureSignals) {
    strengths.push("Failure-path language is present, which lowers timeout and recovery risk.");
  }

  if (hasStateSignals) {
    const relatedRowIds = findRelatedRows(statePatterns);
    predictions.push({
      id: "state-transition",
      title: "State sync issue",
      severity: "medium",
      reason:
        "State-based access and billing actions often drift between the source state, visible UI, and resulting backend behavior.",
      requirementSignal: findSignalSentence(sentences, statePatterns),
      suggestedTestFocus:
        "Validate state transitions, disabled actions, stale views, and consistency after account status changes.",
      relatedRowIds,
      coverageStatus: toCoverageStatus(relatedRowIds),
    });
  }

  if (hasSyncSignals && /update|manage|download/.test(normalized)) {
    const relatedRowIds = findRelatedRows(syncPatterns);
    predictions.push({
      id: "stale-ui",
      title: "Stale UI or dashboard sync risk",
      severity: "medium",
      reason:
        "Dashboards, payment methods, and billing history often fail to refresh consistently after writes or downstream changes.",
      requirementSignal: findSignalSentence(sentences, syncPatterns),
      suggestedTestFocus:
        "Verify dashboard refresh, updated payment details, invoice visibility, and cross-page consistency after changes.",
      relatedRowIds,
      coverageStatus: toCoverageStatus(relatedRowIds),
    });
  }

  if (/invoice|billing|payment/.test(normalized) && !hasOwnershipSignals) {
    const relatedRowIds = findRelatedRows([...ownershipPatterns, ...rolePatterns]);
    predictions.push({
      id: "ownership-visibility",
      title: "Ownership or visibility leak",
      severity: "medium",
      reason:
        "Billing and invoice flows often need explicit ownership constraints to avoid exposing another user's financial data.",
      requirementSignal: findSignalSentence(sentences, [/\binvoice\b/, /\bbilling\b/, /\bpayment\b/]),
      suggestedTestFocus:
        "Validate invoice ownership, account scoping, cross-user visibility, and access checks for direct URLs or shared sessions.",
      relatedRowIds,
      coverageStatus: toCoverageStatus(relatedRowIds),
    });
  } else if (hasOwnershipSignals) {
    strengths.push("Ownership language is present, which lowers billing visibility leak risk.");
  }

  if (persona !== "all" && !new RegExp(`\\b${persona.replace("-", "[- ]")}\\b`).test(normalized)) {
    const relatedRowIds = findRelatedRows([
      new RegExp(`\\b${persona.replace("-", "[- ]")}\\b`),
    ]);
    predictions.push({
      id: "persona-gap",
      title: `${personaLabel} journey mismatch`,
      severity: "medium",
      reason:
        `The selected ${personaLabel.toLowerCase()} journey is not explicit in the requirement, which raises implementation drift risk for that experience.`,
      requirementSignal: `No explicit ${personaLabel.toLowerCase()} behavior was detected in the current requirement text.`,
      suggestedTestFocus:
        `Test the ${personaLabel.toLowerCase()} journey end to end, especially permissions, messages, redirects, and restricted actions.`,
      relatedRowIds,
      coverageStatus: toCoverageStatus(relatedRowIds),
    });
  }

  const penalty = predictions.reduce((total, prediction) => {
    if (prediction.severity === "high") {
      return total + 18;
    }

    if (prediction.severity === "medium") {
      return total + 10;
    }

    return total + 5;
  }, 0);

  const score = Math.max(0, Math.min(100, 100 - penalty));
  const status = score >= 75 ? "contained" : score >= 45 ? "watch" : "hot";

  return {
    score,
    status,
    predictions,
    strengths,
  };
};
