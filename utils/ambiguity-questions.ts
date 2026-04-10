import { type Persona, toPersonaLabel } from "./workspace";

export type AmbiguityPriority = "high" | "medium" | "low";

export type AmbiguityQuestion = {
  id: string;
  category: string;
  priority: AmbiguityPriority;
  question: string;
  reason: string;
};

export type AmbiguityQuestionAnalysis = {
  score: number;
  status: "clear" | "watch" | "unclear";
  questions: AmbiguityQuestion[];
  coveredAreas: string[];
};

const hasAny = (content: string, patterns: RegExp[]) =>
  patterns.some((pattern) => pattern.test(content));

const validationPatterns = [
  /\bvalidate\b/,
  /\bvalidation\b/,
  /\brequired\b/,
  /\binvalid\b/,
  /\berror\b/,
  /\bformat\b/,
  /\bmandatory\b/,
  /\brejected?\b/,
  /\bmissing\b/,
  /\bmust (?:show|display|return)\b.*\berror\b/,
  /\bmust be\b.*\b(valid|invalid)\b/,
  /\bclear error message\b/,
];

const rolePatterns = [
  /\badmin\b/,
  /\buser\b/,
  /\bguest\b/,
  /\brole\b/,
  /\bpermission\b/,
  /\bauthori[sz]ation\b/,
  /\bauthentication\b/,
  /\bauthenticated\b/,
  /\bunauthenticated\b/,
  /\baccess denied\b/,
  /\bsign in\b/,
  /\blog in\b/,
  /\bredirect(?:ed)?\b/,
];

const failurePatterns = [
  /\berror\b/,
  /\bfail\b/,
  /\bfailure\b/,
  /\btimeout\b/,
  /\btimes out?\b/,
  /\bretry\b/,
  /\bblocked\b/,
  /\bdenied\b/,
  /\bunavailable\b/,
  /\boutage\b/,
  /\brecover(?:y)?\b/,
  /\bfallback\b/,
  /\bservice\b.*\b(unavailable|fails?|down)\b/,
];

const limitPatterns = [
  /\bmax\b/,
  /\bmin\b/,
  /\blimit\b/,
  /\blength\b/,
  /\bcharacters\b/,
  /\bsize\b/,
  /\bmaximum\b/,
  /\bminimum\b/,
  /\blast \d+\b/,
  /\bonly\b.*\bmonths?\b/,
  /\bup to\b/,
  /\bat least\b/,
  /\bno more than\b/,
  /\bwithin\b.*\b(days|months|years|items|records)\b/,
];

const statePatterns = [
  /\bstatus\b/,
  /\bstate\b/,
  /\bactive\b/,
  /\binactive\b/,
  /\bdraft\b/,
  /\bpublished\b/,
  /\bsubmitted\b/,
  /\bapproved\b/,
  /\bcan only\b.*\bwhen\b/,
  /\bcannot\b.*\bwhen\b/,
  /\bview only\b/,
  /\baccount is\b/,
];

const integrationPatterns = [
  /\bapi\b/,
  /\bwebhook\b/,
  /\bthird[- ]party\b/,
  /\bpayment gateway\b/,
  /\bservice\b/,
  /\bintegration\b/,
  /\bbilling service\b/,
  /\bexternal dependency\b/,
];

const actorPatterns = [
  /\buser\b/,
  /\bcustomer\b/,
  /\badmin\b/,
  /\bmanager\b/,
  /\bagent\b/,
  /\bguest\b/,
  /\bmember\b/,
  /\bauthenticated\b/,
];

const acceptancePatterns = [
  /\bacceptance criteria\b/,
  /\bshould\b/,
  /\bmust\b/,
  /\bexpected\b/,
  /\bso that\b/,
  /\bmust see\b/,
  /\bmust be redirected\b/,
  /\bmust be able to\b/,
  /\bcan only\b/,
  /\bcannot\b/,
];

export const analyzeAmbiguityQuestions = (
  requirement: string,
  persona: Persona = "all"
): AmbiguityQuestionAnalysis => {
  const normalized = requirement.trim().toLowerCase();

  if (!normalized) {
    return {
      score: 0,
      status: "unclear",
      questions: [],
      coveredAreas: [],
    };
  }

  const questions: AmbiguityQuestion[] = [];
  const coveredAreas: string[] = [];

  const hasValidation = hasAny(normalized, validationPatterns);
  const hasRoles = hasAny(normalized, rolePatterns);
  const hasFailureBehavior = hasAny(normalized, failurePatterns);
  const hasLimits = hasAny(normalized, limitPatterns);
  const hasStateRules = hasAny(normalized, statePatterns);
  const hasIntegration = hasAny(normalized, integrationPatterns);
  const hasActors = hasAny(normalized, actorPatterns);
  const hasAcceptanceCriteria = hasAny(normalized, acceptancePatterns);
  const personaLabel = toPersonaLabel(persona);
  const personaKeywords =
    persona === "first-time-user"
      ? [/\bfirst[- ]time\b/, /\bonboarding\b/, /\bnew user\b/, /\bempty state\b/]
      : persona === "returning-user"
      ? [/\breturning\b/, /\bexisting\b/, /\bsaved\b/, /\bprevious\b/, /\bresume\b/]
      : persona === "blocked-user"
      ? [/\bblocked\b/, /\brestricted\b/, /\bsuspended\b/, /\bdenied\b/]
      : persona === "all"
      ? []
      : [new RegExp(`\\b${persona.replace("-", "[- ]")}\\b`)];
  const hasPersonaSignals =
    persona === "all" ? true : hasAny(normalized, personaKeywords);

  if (!hasValidation) {
    questions.push({
      id: "validation-question",
      category: "Validation",
      priority: "high",
      question:
        "What validations, required fields, and error messages should apply to this flow?",
      reason:
        "The requirement does not clearly define how invalid or incomplete input should be handled.",
    });
  } else {
    coveredAreas.push("Validation rules are mentioned.");
  }

  if (!hasRoles && hasActors) {
    questions.push({
      id: "access-question",
      category: "Access",
      priority: "high",
      question:
        "Who can access this action, and what should happen for unauthorized users?",
      reason:
        "The requirement mentions actors but does not clearly define role or permission behavior.",
    });
  } else if (hasRoles) {
    coveredAreas.push("Role or permission context is described.");
  }

  if (!hasPersonaSignals && persona !== "all") {
    questions.push({
      id: "persona-question",
      category: "Persona",
      priority: "medium",
      question: `What should be different for the ${personaLabel.toLowerCase()} in this flow?`,
      reason:
        `The requirement does not clearly define the ${personaLabel.toLowerCase()} journey, restrictions, or expected outcome.`,
    });
  } else if (persona !== "all") {
    coveredAreas.push(`${personaLabel} expectations are described.`);
  }

  if (!hasFailureBehavior) {
    questions.push({
      id: "failure-question",
      category: "Failure Paths",
      priority: "high",
      question:
        "What should happen on timeout, service failure, or an unavailable dependency?",
      reason:
        "The happy path is clearer than the failure and recovery experience.",
    });
  } else {
    coveredAreas.push("Failure handling is at least partially described.");
  }

  if (!hasLimits) {
    questions.push({
      id: "boundary-question",
      category: "Boundaries",
      priority: "medium",
      question:
        "What are the minimum, maximum, empty, and unusually large values for this behavior?",
      reason:
        "No clear limits or boundary conditions were detected in the requirement.",
    });
  } else {
    coveredAreas.push("Boundary limits are mentioned.");
  }

  if (!hasStateRules) {
    questions.push({
      id: "state-question",
      category: "State",
      priority: "medium",
      question:
        "How should behavior change across statuses or states like draft, active, inactive, or submitted?",
      reason:
        "The requirement does not clearly define state transitions or status-based behavior.",
    });
  } else {
    coveredAreas.push("State or status changes are described.");
  }

  if (hasIntegration) {
    questions.push({
      id: "integration-question",
      category: "Integration",
      priority: "medium",
      question:
        "What contract, retry, and fallback behavior should apply when the external dependency returns unexpected data?",
      reason:
        "External integrations usually need explicit safeguards beyond the basic success path.",
    });
  } else {
    coveredAreas.push("No external dependency signals were detected.");
  }

  if (!hasAcceptanceCriteria) {
    questions.push({
      id: "acceptance-question",
      category: "Acceptance Criteria",
      priority: "low",
      question:
        "What specific acceptance criteria would confirm this feature is complete and correct?",
      reason:
        "The requirement could benefit from clearer success conditions and testable outcomes.",
    });
  } else {
    coveredAreas.push("The requirement includes some outcome-oriented language.");
  }

  if (normalized.length < 120) {
    questions.push({
      id: "scope-question",
      category: "Scope",
      priority: "low",
      question:
        "Are there any exceptions, alternate flows, or business rules that should be added before test generation?",
      reason:
        "Short requirements often omit important edge cases and decision logic.",
    });
  }

  const penalty = questions.reduce((total, question) => {
    if (question.priority === "high") {
      return total + 18;
    }

    if (question.priority === "medium") {
      return total + 10;
    }

    return total + 5;
  }, 0);

  const score = Math.max(0, Math.min(100, 100 - penalty));
  const status = score >= 75 ? "clear" : score >= 45 ? "watch" : "unclear";

  return {
    score,
    status,
    questions,
    coveredAreas,
  };
};
