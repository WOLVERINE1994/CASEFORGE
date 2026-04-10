import { type Persona, toPersonaLabel } from "./workspace";

export type AcceptanceCriterion = {
  id: string;
  label: string;
  text: string;
  source: "explicit" | "inferred";
  priority: "high" | "medium" | "low";
};

export type AcceptanceCriteriaAnalysis = {
  status: "ready" | "needs-review" | "thin";
  score: number;
  summary: string;
  criteria: AcceptanceCriterion[];
  missingAreas: string[];
  hasAppliedCriteria: boolean;
  appliedCriteriaCount: number;
};

const normalizeCriterionLine = (line: string) =>
  line
    .replace(/^([-*]\s*)+/, "")
    .replace(/^(\d+\.\s*)+/, "")
    .trim();

const splitRequirementSections = (requirement: string) => {
  const existingPattern = /\n\s*acceptance criteria:\s*/i;
  const match = requirement.match(existingPattern);

  if (!match || match.index === undefined) {
    return {
      baseRequirement: requirement.trim(),
      existingCriteriaBlock: "",
    };
  }

  return {
    baseRequirement: requirement.slice(0, match.index).trim(),
    existingCriteriaBlock: requirement.slice(match.index).trim(),
  };
};

const splitRequirementIntoSentences = (requirement: string) =>
  requirement
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((item) => normalizeCriterionLine(item))
    .filter(
      (item) => item && !/^acceptance criteria:?$/i.test(item)
    );

const toCriterionText = (sentence: string) => {
  const cleaned = sentence.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
  if (!cleaned) {
    return "";
  }

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1) + ".";
};

const buildInferredCriterion = (
  id: string,
  label: string,
  text: string,
  priority: AcceptanceCriterion["priority"] = "medium"
): AcceptanceCriterion => ({
  id,
  label,
  text,
  source: "inferred",
  priority,
});

const isAcceptanceCriterion = (
  criterion: AcceptanceCriterion | null
): criterion is AcceptanceCriterion => criterion !== null;

export const buildRequirementWithAcceptanceCriteria = (
  requirement: string,
  analysis: AcceptanceCriteriaAnalysis
) => {
  const { baseRequirement } = splitRequirementSections(requirement);
  const criteriaLines = analysis.criteria.map((criterion) => `- ${criterion.text}`);

  if (criteriaLines.length === 0) {
    return baseRequirement;
  }

  const acceptanceCriteriaBlock = `Acceptance Criteria:\n${criteriaLines.join("\n")}`;

  if (!baseRequirement) {
    return acceptanceCriteriaBlock;
  }

  return `${baseRequirement}\n\n${acceptanceCriteriaBlock}`;
};

export const analyzeAcceptanceCriteria = (
  requirement: string,
  persona: Persona = "all"
): AcceptanceCriteriaAnalysis => {
  const trimmedRequirement = requirement.trim();
  if (!trimmedRequirement) {
    return {
      status: "thin",
      score: 0,
      summary: "Add a requirement to build testable acceptance criteria.",
      criteria: [],
      missingAreas: [],
      hasAppliedCriteria: false,
      appliedCriteriaCount: 0,
    };
  }

  const { baseRequirement, existingCriteriaBlock } =
    splitRequirementSections(trimmedRequirement);
  const analysisSource = (baseRequirement || existingCriteriaBlock).trim();
  const normalized = analysisSource.toLowerCase();
  const personaLabel = toPersonaLabel(persona);
  const explicitSource = existingCriteriaBlock || analysisSource;
  const sentences = splitRequirementIntoSentences(explicitSource);
  const explicitCriteria = sentences
    .map((sentence, index): AcceptanceCriterion | null => {
      const criterionText = toCriterionText(sentence);
      if (!criterionText) {
        return null;
      }

      return {
        id: `explicit-${index}`,
        label:
          /admin|guest|blocked|authenticated|access|redirect|denied/i.test(
            sentence
          )
            ? "Access"
            : /validate|required|invalid|format|error/i.test(sentence)
            ? "Validation"
            : /fail|timeout|unavailable|retry/i.test(sentence)
            ? "Failure Handling"
            : /active|inactive|state|status/i.test(sentence)
            ? "State"
            : /limit|minimum|maximum|last \d+/i.test(sentence)
            ? "Boundaries"
            : "Requirement",
        text: criterionText,
        source: "explicit" as const,
        priority:
          /must|denied|blocked|only|cannot|error|fail|timeout|required/i.test(
            sentence
          )
            ? ("high" as const)
            : /should|redirect|view|download|update/i.test(sentence)
            ? ("medium" as const)
            : ("low" as const),
      };
    })
    .filter(isAcceptanceCriterion);

  const dedupedExplicitCriteria = explicitCriteria.filter(
    (criterion, index, currentCriteria) =>
      currentCriteria.findIndex(
        (candidate) =>
          candidate.text.toLowerCase() === criterion.text.toLowerCase()
      ) === index
  );

  const missingAreas: string[] = [];
  const inferredCriteria: AcceptanceCriterion[] = [];

  const hasAccessRules = /\badmin\b|\bguest\b|\bblocked\b|\bauthenticated\b|\baccess\b|\bredirect\b|\bdenied\b/.test(
    normalized
  );
  const hasValidationRules = /\bvalidate\b|\bvalidation\b|\brequired\b|\binvalid\b|\berror\b|\bformat\b/.test(
    normalized
  );
  const hasFailureRules = /\bfail\b|\bfailure\b|\btimeout\b|\bunavailable\b|\bretry\b/.test(
    normalized
  );
  const hasBoundaryRules = /\blimit\b|\bmaximum\b|\bminimum\b|\blast \d+\b|\bonly\b/.test(
    normalized
  );
  const hasStateRules = /\bactive\b|\binactive\b|\bstate\b|\bstatus\b|\bsubmitted\b|\bapproved\b/.test(
    normalized
  );
  const hasExpectedOutcome = /\bmust\b|\bshould\b|\bsee\b|\bshows?\b|\bdisplay\b|\ballowed\b|\bblocked\b/.test(
    normalized
  );

  if (!hasAccessRules) {
    missingAreas.push("Access and persona boundaries");
    inferredCriteria.push(
      buildInferredCriterion(
        "access-boundaries",
        "Access",
        persona === "all"
          ? "Only the intended user roles can access this flow, and unauthorized users are redirected or denied safely."
          : `${personaLabel} can access only the actions intended for that persona, and restricted actions are clearly blocked.`,
        "high"
      )
    );
  }

  if (!hasValidationRules) {
    missingAreas.push("Validation and rejection rules");
    inferredCriteria.push(
      buildInferredCriterion(
        "validation-rules",
        "Validation",
        "Required fields, invalid input, and rejected updates must return clear validation feedback and prevent unsafe submission.",
        "high"
      )
    );
  }

  if (!hasFailureRules) {
    missingAreas.push("Failure and recovery behavior");
    inferredCriteria.push(
      buildInferredCriterion(
        "failure-rules",
        "Failure Handling",
        "If the flow fails, times out, or a dependency is unavailable, the user sees a clear error and no inconsistent data is created.",
        "high"
      )
    );
  }

  if (!hasBoundaryRules) {
    missingAreas.push("Limits and boundary conditions");
    inferredCriteria.push(
      buildInferredCriterion(
        "boundary-rules",
        "Boundaries",
        "The feature defines supported limits, empty states, and any minimum or maximum conditions that affect the behavior.",
        "medium"
      )
    );
  }

  if (!hasStateRules) {
    missingAreas.push("State-based behavior");
    inferredCriteria.push(
      buildInferredCriterion(
        "state-rules",
        "State",
        "Behavior stays consistent across relevant account or workflow states, including which actions remain available in each state.",
        "medium"
      )
    );
  }

  if (!hasExpectedOutcome) {
    missingAreas.push("Observable expected outcomes");
    inferredCriteria.push(
      buildInferredCriterion(
        "expected-outcome",
        "Outcome",
        "Each allowed action has a clear visible result so QA can confirm success without interpreting ambiguous system behavior.",
        "medium"
      )
    );
  }

  const criteria = [...dedupedExplicitCriteria, ...inferredCriteria]
    .filter(isAcceptanceCriterion)
    .slice(0, 8);
  const score = Math.min(
    100,
    dedupedExplicitCriteria.length * 18 + (6 - missingAreas.length) * 8
  );
  const status =
    criteria.length >= 5 && missingAreas.length <= 2
      ? "ready"
      : criteria.length >= 3
      ? "needs-review"
      : "thin";
  const summary =
    status === "ready"
      ? "The requirement already reads like a testable story. Review the suggested acceptance criteria and generate from them."
      : status === "needs-review"
      ? "The builder found a workable set of criteria, but a few QA-critical rules still need clearer acceptance language."
      : "The requirement is still thin. Use these criteria to make the feature testable before generation.";

  return {
    status,
    score,
    summary,
    criteria,
    missingAreas,
    hasAppliedCriteria: Boolean(existingCriteriaBlock.trim()),
    appliedCriteriaCount: dedupedExplicitCriteria.length,
  };
};
