import type { AmbiguityQuestionAnalysis } from "./ambiguity-questions";
import type { CoverageGapAnalysis } from "./coverage-gap-analysis";
import type { RequirementRiskAnalysis } from "./risk-analysis";
import type {
  CoverageDepth,
  GenerationMode,
  Persona,
  TestCaseRow,
} from "./workspace";

type CognitiveOrchestrationInput = {
  requirement: string;
  rows: TestCaseRow[];
  generationMode: GenerationMode;
  coverageDepth: CoverageDepth;
  persona: Persona;
  requirementRiskAnalysis: RequirementRiskAnalysis;
  ambiguityQuestionAnalysis: AmbiguityQuestionAnalysis;
  coverageGapAnalysis: CoverageGapAnalysis;
};

export type CognitiveOrchestrationPlan = {
  readiness: "draft" | "ready" | "review" | "automate";
  headline: string;
  summary: string;
  recommendedMode: GenerationMode;
  recommendedCoverage: CoverageDepth;
  recommendedPersona: Persona;
  focusAreas: string[];
  nextActions: string[];
  automationGuidance: string;
  promptDirective: string;
};

const hasAny = (content: string, patterns: RegExp[]) =>
  patterns.some((pattern) => pattern.test(content));

const unique = (items: string[]) =>
  Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).slice(
    0,
    5
  );

export const buildCognitiveOrchestrationPlan = ({
  requirement,
  rows,
  generationMode,
  coverageDepth,
  persona,
  requirementRiskAnalysis,
  ambiguityQuestionAnalysis,
  coverageGapAnalysis,
}: CognitiveOrchestrationInput): CognitiveOrchestrationPlan => {
  const normalized = requirement.trim().toLowerCase();
  const hasRequirement = normalized.length > 0;
  const hasRows = rows.length > 0;
  const mentionsApi = hasAny(normalized, [
    /\bapi\b/,
    /\bwebhook\b/,
    /\bintegration\b/,
    /\bendpoint\b/,
    /\bpayload\b/,
  ]);
  const mentionsUi = hasAny(normalized, [
    /\bscreen\b/,
    /\bpage\b/,
    /\bbutton\b/,
    /\bform\b/,
    /\bmodal\b/,
    /\bclick\b/,
    /\bkeyboard\b/,
    /\bfocus\b/,
  ]);
  const mentionsAccess = hasAny(normalized, [
    /\bsign ?in\b/,
    /\bsign ?up\b/,
    /\blogin\b/,
    /\bauth\b/,
    /\bpermission\b/,
    /\brole\b/,
    /\bunauthori[sz]ed\b/,
  ]);
  const mentionsLimits = hasAny(normalized, [
    /\blimit\b/,
    /\bmaximum\b/,
    /\bminimum\b/,
    /\bempty\b/,
    /\bboundary\b/,
    /\binvalid\b/,
  ]);
  const mentionsAccessibility = hasAny(normalized, [
    /\baccessibility\b/,
    /\bwcag\b/,
    /\bscreen reader\b/,
    /\bkeyboard\b/,
    /\bfocus\b/,
    /\bcontrast\b/,
  ]);

  const recommendedMode: GenerationMode = mentionsAccessibility
    ? "accessibility"
    : mentionsApi
    ? "api"
    : mentionsAccess
    ? "security"
    : mentionsLimits
    ? "edge"
    : mentionsUi
    ? "ui"
    : generationMode;

  const recommendedCoverage: CoverageDepth =
    requirementRiskAnalysis.score >= 70 ||
    ambiguityQuestionAnalysis.questions.some(
      (question) => question.priority === "high"
    ) ||
    coverageGapAnalysis.gaps.some((gap) => gap.severity === "high")
      ? "thorough"
      : coverageDepth === "basic" && hasRequirement
      ? "standard"
      : coverageDepth;

  const recommendedPersona: Persona = mentionsAccess
    ? "guest"
    : persona;

  const focusAreas = unique([
    ...requirementRiskAnalysis.risks
      .filter((risk) => risk.severity !== "low")
      .map((risk) => risk.title),
    ...coverageGapAnalysis.gaps
      .filter((gap) => gap.severity !== "low")
      .map((gap) => gap.title),
    ...ambiguityQuestionAnalysis.questions
      .filter((question) => question.priority === "high")
      .map((question) => question.category),
    mentionsAccessibility || mentionsUi ? "WCAG and keyboard evidence" : "",
    mentionsAccess ? "Auth and permission boundaries" : "",
  ]);

  const readiness: CognitiveOrchestrationPlan["readiness"] = !hasRequirement
    ? "draft"
    : !hasRows
    ? "ready"
    : coverageGapAnalysis.status === "weak" ||
      ambiguityQuestionAnalysis.status === "unclear"
    ? "review"
    : "automate";

  const headline =
    readiness === "draft"
      ? "Capture the story first"
      : readiness === "ready"
      ? "Generate orchestrated coverage"
      : readiness === "review"
      ? "Close coverage gaps before automation"
      : "Promote stable cases toward automation";

  const summary =
    readiness === "draft"
      ? "Paste a story and the orchestrator will pick the right case mix, risk depth, WCAG need, and next QA action."
      : readiness === "ready"
      ? `Recommended ${recommendedMode} generation with ${recommendedCoverage} coverage for the next pass.`
      : readiness === "review"
      ? "The suite exists, but the orchestrator still sees review or coverage work before automation should be trusted."
      : "The suite is ready for automation triage, execution readiness checks, and release confidence review.";

  const nextActions =
    readiness === "draft"
      ? ["Paste one story with actor, action, validation, and outcome."]
      : readiness === "ready"
      ? [
          "Apply the recommended mode and coverage.",
          "Generate the first draft.",
          "Review high-risk and WCAG evidence before saving.",
        ]
      : readiness === "review"
      ? [
          "Fill the highest-severity coverage gaps.",
          "Resolve unclear acceptance criteria.",
          "Merge duplicate or overlapping cases before automation.",
        ]
      : [
          "Rank stable cases for automation.",
          "Generate automation for high-value flows.",
          "Use execution results to triage defects, data issues, or script fixes.",
        ];

  const automationGuidance =
    readiness === "automate"
      ? "Start with stable functional, API, and regression cases that have clear data, deterministic expected results, and low ambiguity."
      : "Hold automation until the orchestrator sees enough stable case detail, test data, and review confidence.";

  return {
    readiness,
    headline,
    summary,
    recommendedMode,
    recommendedCoverage,
    recommendedPersona,
    focusAreas,
    nextActions,
    automationGuidance,
    promptDirective: [
      `Cognitive orchestration recommends ${recommendedMode} mode with ${recommendedCoverage} coverage for ${recommendedPersona}.`,
      focusAreas.length
        ? `Prioritize these focus areas: ${focusAreas.join(", ")}.`
        : "Prioritize the main user flow, clear validation, and observable outcomes.",
      automationGuidance,
    ].join(" "),
  };
};
