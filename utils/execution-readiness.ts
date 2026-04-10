import { type Persona, toPersonaLabel } from "./workspace";

export type TestCaseRow = {
  id: string;
  type: string;
  title: string;
  preconditions: string;
  steps: string;
  expectedResult: string;
  testData?: string;
};

export type ReadinessArea = "clarity" | "completeness" | "actionability";
export type ReadinessSeverity = "high" | "medium" | "low";

export type ExecutionReadinessFinding = {
  id: string;
  area: ReadinessArea;
  severity: ReadinessSeverity;
  title: string;
  summary: string;
};

export type ExecutionReadinessAnalysis = {
  score: number;
  status: "strong" | "watch" | "weak";
  clarityScore: number;
  completenessScore: number;
  actionabilityScore: number;
  findings: ExecutionReadinessFinding[];
  strengths: string[];
  nextStep: string;
};

const clamp = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, value));

const average = (values: number[]) =>
  values.length === 0
    ? 0
    : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);

const hasAny = (content: string, patterns: RegExp[]) =>
  patterns.some((pattern) => pattern.test(content));

export const analyzeExecutionReadiness = (
  rows: TestCaseRow[],
  mode: string,
  persona: Persona = "all"
): ExecutionReadinessAnalysis => {
  if (rows.length === 0) {
    return {
      score: 0,
      status: "weak",
      clarityScore: 0,
      completenessScore: 0,
      actionabilityScore: 0,
      findings: [],
      strengths: [],
      nextStep: "Generate or add test cases first so the workspace can assess execution readiness.",
    };
  }

  const findings: ExecutionReadinessFinding[] = [];
  const strengths: string[] = [];

  let clarityPenalty = 0;
  let actionabilityPenalty = 0;

  rows.forEach((row) => {
    const titleWords = row.title.trim().split(/\s+/).filter(Boolean).length;
    const stepCount = row.steps
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean).length;
    const hasPreconditions = row.preconditions.trim().length >= 10;
    const hasExpectedResult = row.expectedResult.trim().length >= 20;
    const hasTestData = (row.testData ?? "").trim().length >= 10;

    if (titleWords <= 3) {
      clarityPenalty += 8;
    }

    if (stepCount <= 1) {
      clarityPenalty += 10;
      actionabilityPenalty += 10;
    }

    if (!hasExpectedResult) {
      clarityPenalty += 10;
      actionabilityPenalty += 12;
    }

    if (!hasPreconditions) {
      actionabilityPenalty += 8;
    }

    if (!hasTestData) {
      actionabilityPenalty += 9;
    }
  });

  const clarityScore = clamp(100 - Math.round(clarityPenalty / rows.length));
  const actionabilityScore = clamp(
    100 - Math.round(actionabilityPenalty / rows.length)
  );

  const content = rows
    .map((row) =>
      [
        row.type,
        row.title,
        row.preconditions,
        row.steps,
        row.expectedResult,
        row.testData ?? "",
      ].join(" ")
    )
    .join(" ")
    .toLowerCase();

  const types = new Set(rows.map((row) => row.type.trim()).filter(Boolean));
  let completenessScore = 100;

  const hasNegativeCoverage =
    types.has("Negative") ||
    hasAny(content, [/\binvalid\b/, /\breject\b/, /\berror\b/, /\bfail\b/]);
  const hasEdgeCoverage =
    types.has("Edge") ||
    hasAny(content, [/\bminimum\b/, /\bmaximum\b/, /\bboundary\b/, /\bempty\b/]);
  const hasFailureCoverage = hasAny(content, [
    /\btimeout\b/,
    /\bretry\b/,
    /\bfallback\b/,
    /\bservice unavailable\b/,
    /\berror message\b/,
  ]);
  const hasRoleCoverage = hasAny(content, [
    /\bpermission\b/,
    /\brole\b/,
    /\bauthori[sz]ed\b/,
    /\bunauthori[sz]ed\b/,
    /\badmin\b/,
    /\bguest\b/,
  ]);
  const hasStateCoverage = hasAny(content, [
    /\bstatus\b/,
    /\bstate\b/,
    /\bdraft\b/,
    /\bactive\b/,
    /\binactive\b/,
    /\bapproved\b/,
    /\bsubmitted\b/,
  ]);
  const hasConcreteDataCoverage = hasAny(content, [
    /\bemail\b/,
    /\bpayload\b/,
    /\btoken\b/,
    /\bjson\b/,
    /\bminimum\b/,
    /\bmaximum\b/,
    /\bvalid\b/,
    /\binvalid\b/,
  ]);
  const hasPersonaCoverage =
    persona === "all"
      ? true
      : persona === "first-time-user"
      ? hasAny(content, [/\bfirst[- ]time\b/, /\bonboarding\b/, /\bempty state\b/, /\bnew user\b/])
      : persona === "returning-user"
      ? hasAny(content, [/\breturning\b/, /\bexisting\b/, /\bsaved\b/, /\bresume\b/])
      : persona === "blocked-user"
      ? hasAny(content, [/\bblocked\b/, /\brestricted\b/, /\bsuspended\b/, /\bdenied\b/])
      : hasAny(content, [new RegExp(`\\b${persona.replace("-", "[- ]")}\\b`)]);

  if (!hasNegativeCoverage) {
    completenessScore -= 14;
  }
  if (!hasEdgeCoverage) {
    completenessScore -= 12;
  }
  if (!hasFailureCoverage) {
    completenessScore -= 10;
  }
  if (!hasRoleCoverage) {
    completenessScore -= 8;
  }
  if (!hasStateCoverage) {
    completenessScore -= 6;
  }
  if (!hasConcreteDataCoverage) {
    completenessScore -= 10;
  }
  if (!hasPersonaCoverage && persona !== "all") {
    completenessScore -= 12;
  }

  if (mode === "api" && !types.has("API")) {
    completenessScore -= 18;
  }
  if (mode === "ui" && !types.has("UI")) {
    completenessScore -= 18;
  }
  if (mode === "regression" && !types.has("Regression")) {
    completenessScore -= 16;
  }
  if (mode === "negative" && !types.has("Negative")) {
    completenessScore -= 16;
  }
  if (mode === "edge" && !types.has("Edge")) {
    completenessScore -= 16;
  }

  completenessScore = clamp(completenessScore);

  const score = average([clarityScore, completenessScore, actionabilityScore]);
  const status =
    score >= 80 ? "strong" : score >= 60 ? "watch" : "weak";

  if (clarityScore < 75) {
    findings.push({
      id: "clarity-weak",
      area: "clarity",
      severity: clarityScore < 55 ? "high" : "medium",
      title: "Several rows still need clearer wording",
      summary:
        "Some titles, steps, or expected results are still too thin for confident review and execution.",
    });
  }

  if (completenessScore < 75) {
    findings.push({
      id: "coverage-thin",
      area: "completeness",
      severity: completenessScore < 55 ? "high" : "medium",
      title: "The suite still has meaningful coverage gaps",
      summary:
        `Important QA angles such as negative paths, boundaries, failure handling, permissions,${persona === "all" ? "" : ` ${toPersonaLabel(persona).toLowerCase()} behavior,`} or mode-specific intent are still light.`,
    });
  }

  if (actionabilityScore < 75) {
    findings.push({
      id: "actionability-thin",
      area: "actionability",
      severity: actionabilityScore < 55 ? "high" : "medium",
      title: "Some cases are not execution-ready yet",
      summary:
        "A number of rows still need better preconditions, richer expected results, or concrete test data before handoff.",
    });
  }

  if (clarityScore >= 80) {
    strengths.push("Case titles and expected outcomes are specific enough for review.");
  }
  if (completenessScore >= 80) {
    strengths.push("The suite reflects a balanced mix of business paths and QA coverage areas.");
  }
  if (actionabilityScore >= 80) {
    strengths.push("Most cases include enough detail to move into execution with little extra prep.");
  }
  if (persona !== "all" && hasPersonaCoverage) {
    strengths.push(`${toPersonaLabel(persona)} context is visible in the suite, which improves execution realism.`);
  }
  if (
    rows.filter((row) => (row.testData ?? "").trim().length >= 10).length >=
    Math.max(2, Math.ceil(rows.length * 0.7))
  ) {
    strengths.push("Test data is present for most rows, which makes the suite easier to execute.");
  }

  const nextStep =
    score >= 85
      ? "This suite looks ready for review, export, and execution planning."
      : completenessScore < clarityScore && completenessScore < actionabilityScore
      ? "Close the remaining coverage gaps first, then re-check readiness before export."
      : actionabilityScore <= clarityScore
      ? "Tighten preconditions, expected results, and test data so the suite is easier to execute."
      : "Clarify vague wording and strengthen thin rows before sharing the suite.";

  return {
    score,
    status,
    clarityScore,
    completenessScore,
    actionabilityScore,
    findings,
    strengths,
    nextStep,
  };
};
