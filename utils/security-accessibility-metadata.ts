import type { GenerationMode, TestCaseRow } from "./workspace";

const getCombinedText = (row: Pick<TestCaseRow, "title" | "preconditions" | "steps" | "expectedResult">) =>
  [row.title, row.preconditions, row.steps, row.expectedResult]
    .join(" ")
    .toLowerCase();

const pushLabel = (labels: string[], value: string) => {
  if (!labels.includes(value)) {
    labels.push(value);
  }
};

const detectSecurityCategory = (content: string): TestCaseRow["securityCategory"] => {
  if (/\b(role|permission|admin|forbidden|unauthorized|access control|privilege)\b/.test(content)) {
    return "authorization";
  }
  if (/\b(session|timeout|logout|cookie|remember me|token refresh)\b/.test(content)) {
    return "session";
  }
  if (/\b(upload|file type|file size|attachment|malware|document)\b/.test(content)) {
    return "upload-safety";
  }
  if (/\b(api|endpoint|token|header|response code|schema)\b/.test(content)) {
    return "api-security";
  }
  if (/\b(encrypt|sensitive|masked|exposure|pii|secret|password reset|leak)\b/.test(content)) {
    return "data-protection";
  }
  if (/\b(rate limit|brute force|lockout|retry|abuse|throttle)\b/.test(content)) {
    return "abuse-resistance";
  }
  if (/\b(authentication|login|sign in|mfa|otp|password)\b/.test(content)) {
    return "auth";
  }
  if (/\b(validation|invalid input|sanit|boundary|format|required field)\b/.test(content)) {
    return "validation";
  }
  if (/\b(workflow abuse|business rule|duplicate order|duplicate payment|sequence)\b/.test(content)) {
    return "business-logic";
  }
  return "validation";
};

const detectAccessibilityCategory = (
  content: string
): TestCaseRow["accessibilityCategory"] => {
  if (/\b(screen reader|aria-live|announcement|accessible name|voiceover|nvda|jaws)\b/.test(content)) {
    return "screen-reader";
  }
  if (/\b(focus|tab order|focus trap|modal|keyboard shortcut)\b/.test(content)) {
    return "focus-management";
  }
  if (/\b(keyboard|tab|enter|space|escape)\b/.test(content)) {
    return "keyboard-navigation";
  }
  if (/\b(label|form|field|error association|required field|helper text)\b/.test(content)) {
    return "forms";
  }
  if (/\b(heading|semantic|table|list|landmark|button text|link text)\b/.test(content)) {
    return "semantics";
  }
  if (/\b(contrast|color|visual indicator)\b/.test(content)) {
    return "contrast";
  }
  if (/\b(zoom|reflow|resize|320px|responsive)\b/.test(content)) {
    return "zoom-reflow";
  }
  if (/\b(error message|status message|validation message|announcement)\b/.test(content)) {
    return "error-handling";
  }
  if (/\b(video|audio|caption|transcript|animation|motion|alt text|image)\b/.test(content)) {
    return "media-content";
  }
  return "keyboard-navigation";
};

export const enrichGeneratedRowsWithDomainMetadata = (
  rows: TestCaseRow[],
  mode: GenerationMode
) =>
  rows.map((row) => {
    const content = getCombinedText(row);
    const labels = [...(row.labels ?? [])];

    if (mode === "security") {
      const securityCategory = detectSecurityCategory(content);
      pushLabel(labels, "security");
      pushLabel(labels, securityCategory ?? "security");

      return {
        ...row,
        testDomain: "security" as const,
        securityCategory,
        riskLevel:
          securityCategory === "auth" ||
          securityCategory === "authorization" ||
          securityCategory === "data-protection"
            ? ("high" as const)
            : ("medium" as const),
        automationPotential:
          securityCategory === "validation" || securityCategory === "api-security"
            ? ("medium" as const)
            : ("low" as const),
        labels,
      };
    }

    if (mode === "accessibility") {
      const accessibilityCategory = detectAccessibilityCategory(content);
      pushLabel(labels, "accessibility");
      pushLabel(labels, accessibilityCategory ?? "accessibility");

      return {
        ...row,
        testDomain: "accessibility" as const,
        accessibilityCategory,
        complianceReference: "WCAG 2.2 review",
        riskLevel:
          accessibilityCategory === "forms" ||
          accessibilityCategory === "keyboard-navigation" ||
          accessibilityCategory === "screen-reader"
            ? ("high" as const)
            : ("medium" as const),
        automationPotential:
          accessibilityCategory === "contrast" || accessibilityCategory === "semantics"
            ? ("medium" as const)
            : ("low" as const),
        labels,
      };
    }

    const defaultDomainMap: Record<
      Exclude<GenerationMode, "security" | "accessibility">,
      NonNullable<TestCaseRow["testDomain"]>
    > = {
      functional: "functional",
      regression: "regression",
      api: "api",
      ui: "ui",
      negative: "negative",
      edge: "edge",
      salesforce: "functional",
    };

    return {
      ...row,
      testDomain: row.testDomain ?? defaultDomainMap[mode],
    };
  });
