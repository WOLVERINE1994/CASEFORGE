import { type Persona, toPersonaLabel } from "./workspace";

export type RiskSeverity = "high" | "medium" | "low";

export type RequirementRisk = {
  id: string;
  title: string;
  severity: RiskSeverity;
  summary: string;
  question: string;
};

export type RequirementRiskAnalysis = {
  score: number;
  status: "strong" | "watch" | "weak";
  risks: RequirementRisk[];
  strengths: string[];
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
  /\bclear error message\b/,
  /\bmust (?:show|display|return)\b.*\berror\b/,
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
  /\bredirect(?:ed)?\b/,
  /\bsign in\b/,
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

const actionPatterns = [
  /\bcreate\b/,
  /\bupdate\b/,
  /\bdelete\b/,
  /\bsubmit\b/,
  /\bsave\b/,
  /\bedit\b/,
  /\blogin\b/,
  /\bsearch\b/,
  /\bfilter\b/,
  /\bdownload\b/,
  /\bmanage\b/,
  /\baccess\b/,
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

export const analyzeRequirementRisk = (
  requirement: string,
  persona: Persona = "all"
): RequirementRiskAnalysis => {
  const normalized = requirement.trim().toLowerCase();

  if (!normalized) {
    return {
      score: 0,
      status: "weak",
      risks: [],
      strengths: [],
    };
  }

  const risks: RequirementRisk[] = [];
  const strengths: string[] = [];

  const hasValidation = hasAny(normalized, validationPatterns);

  const hasRoleInfo = hasAny(normalized, rolePatterns);

  const hasFailureBehavior = hasAny(normalized, failurePatterns);

  const hasStateRules = hasAny(normalized, statePatterns);

  const hasLimits = hasAny(normalized, limitPatterns);

  const hasActors = hasAny(normalized, actorPatterns);

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

  const hasActions = hasAny(normalized, actionPatterns);

  const mentionsIntegration = hasAny(normalized, integrationPatterns);

  if (!hasValidation) {
    risks.push({
      id: "validation-gap",
      title: "Validation rules are unclear",
      severity: "high",
      summary:
        "The requirement describes the feature, but not how invalid or incomplete input should be handled.",
      question:
        "What validations, required fields, and error messages should exist for this flow?",
    });
  } else {
    strengths.push("Validation-related behavior is at least partially described.");
  }

  if (!hasRoleInfo && hasActors) {
    risks.push({
      id: "role-gap",
      title: "Role and permission behavior is missing",
      severity: "high",
      summary:
        "Actors are mentioned, but access rules are not clearly defined.",
      question:
        "Who can perform this action, and what should happen for unauthorized users?",
    });
  } else if (hasRoleInfo) {
    strengths.push("The requirement references roles, access, or permission context.");
  }

  if (!hasPersonaSignals && persona !== "all") {
    risks.push({
      id: "persona-risk",
      title: `${personaLabel} expectations are not explicit`,
      severity: "medium",
      summary:
        `The requirement does not clearly describe how the ${personaLabel.toLowerCase()} experience should differ from general behavior.`,
      question:
        `What permissions, states, redirects, or messaging should apply specifically to the ${personaLabel.toLowerCase()}?`,
    });
  } else if (persona !== "all") {
    strengths.push(`${personaLabel} behavior is explicitly reflected in the requirement.`);
  }

  if (!hasFailureBehavior) {
    risks.push({
      id: "failure-gap",
      title: "Failure and recovery paths are not covered",
      severity: "medium",
      summary:
        "The happy path is clearer than the timeout, error, or blocked scenarios.",
      question:
        "What should users see when this action fails, times out, or is unavailable?",
    });
  } else {
    strengths.push("Failure behavior or fallback language appears in the requirement.");
  }

  if (!hasStateRules && hasActions) {
    risks.push({
      id: "state-gap",
      title: "Business state transitions are vague",
      severity: "medium",
      summary:
        "The requirement names actions but does not clearly define resulting states or status changes.",
      question:
        "What state changes happen before, during, and after the action completes?",
    });
  } else if (hasStateRules) {
    strengths.push("The requirement includes some state or status language.");
  }

  if (!hasLimits) {
    risks.push({
      id: "boundary-gap",
      title: "Boundary conditions are not specified",
      severity: "medium",
      summary:
        "No limits, ranges, or size constraints were detected, which often hides edge-case bugs.",
      question:
        "What are the minimum, maximum, empty, and unusually large values for this behavior?",
    });
  } else {
    strengths.push("Boundary or limit rules are mentioned.");
  }

  if (mentionsIntegration) {
    risks.push({
      id: "integration-risk",
      title: "Integration dependency needs explicit safeguards",
      severity: "medium",
      summary:
        "The requirement depends on an external or service boundary, which usually needs contract and outage handling.",
      question:
        "What should happen if the external dependency is slow, unavailable, or returns unexpected data?",
    });
  }

  if (normalized.length < 120) {
    risks.push({
      id: "thin-requirement",
      title: "Requirement may be too brief",
      severity: "low",
      summary:
        "Short requirements often omit business rules, edge cases, and downstream expectations.",
      question:
        "Can you add acceptance criteria, exceptions, and expected outcomes for this feature?",
    });
  } else {
    strengths.push("The requirement has enough detail to support deeper QA review.");
  }

  const penalty = risks.reduce((total, risk) => {
    if (risk.severity === "high") {
      return total + 22;
    }

    if (risk.severity === "medium") {
      return total + 12;
    }

    return total + 6;
  }, 0);

  const score = Math.max(0, Math.min(100, 100 - penalty));
  const status =
    score >= 75 ? "strong" : score >= 45 ? "watch" : "weak";

  return {
    score,
    status,
    risks,
    strengths,
  };
};
