type TestCaseRow = {
  id: string;
  type: string;
  title: string;
  preconditions: string;
  steps: string;
  expectedResult: string;
};

export type CaseQualitySeverity = "high" | "medium" | "low";

export type CaseQualityFinding = {
  id: string;
  severity: CaseQualitySeverity;
  type: "duplicate" | "overlap" | "vague" | "low-value" | "weak";
  title: string;
  summary: string;
  rowIds: string[];
  suggestion: string;
};

export type CaseQualityAnalysis = {
  score: number;
  status: "strong" | "watch" | "weak";
  findings: CaseQualityFinding[];
  strengths: string[];
};

const stopWords = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "when",
  "then",
  "than",
  "must",
  "should",
  "will",
  "user",
  "users",
  "can",
  "not",
  "are",
  "was",
  "were",
  "but",
  "all",
  "any",
  "its",
  "their",
  "them",
  "your",
  "you",
  "each",
  "page",
  "screen",
  "system",
  "verify",
  "check",
  "validate",
  "test",
]);

const toKeywords = (content: string) =>
  Array.from(
    new Set(
      content
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .map((word) => word.trim())
        .filter((word) => word.length > 2 && !stopWords.has(word))
    )
  );

const similarityScore = (left: string[], right: string[]) => {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const overlap = left.filter((item) => right.includes(item)).length;
  return overlap / Math.min(left.length, right.length);
};

const normalizeText = (content: string) =>
  content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const detectScenarioVariant = (row: TestCaseRow) => {
  const content = normalizeText(
    `${row.title} ${row.preconditions} ${row.steps} ${row.expectedResult}`
  );

  if (
    /\brole based visibility\b|\bvisibility\b|\bvisible\b|\bhidden\b|\bshow\b|\bhide\b|\bdisplay\b/.test(
      content
    )
  ) {
    return "visibility";
  }

  if (/\bempty\b|\bblank\b|\bmissing\b|\bnull\b/.test(content)) {
    return "empty";
  }

  if (
    /\bminimum\b|\bmin\b|\bshortest\b|\bone character\b|\blength 1\b|\bsmallest\b/.test(
      content
    )
  ) {
    return "minimum";
  }

  if (
    /\bmaximum\b|\bmax\b|\blongest\b|\bover limit\b|\btoo long\b/.test(content)
  ) {
    return "maximum";
  }

  if (/\binvalid\b|\bincorrect\b|\bmalformed\b|\bwrong\b/.test(content)) {
    return "invalid";
  }

  if (/\bexpired\b|\btimeout\b|\btimed out\b/.test(content)) {
    return "expired-or-timeout";
  }

  if (/\bauthori[sz]ed\b|\ballowed\b|\bpermitted\b/.test(content)) {
    return "authorized";
  }

  if (/\bunauthori[sz]ed\b|\bforbidden\b|\bdenied\b|\bpermission\b/.test(content)) {
    return "unauthorized";
  }

  if (/\bvalid\b|\bsuccess\b|\bsuccessful\b|\bhappy path\b/.test(content)) {
    return "valid";
  }

  return "general";
};

const isVagueTitle = (title: string) =>
  /^(verify|check|validate|test)\b.{0,22}$/i.test(title.trim()) ||
  title.trim().split(/\s+/).length <= 3;

const isLowValueRow = (row: TestCaseRow) => {
  const stepsCount = row.steps
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean).length;

  return stepsCount <= 1 || row.expectedResult.trim().length < 18;
};

export const analyzeCaseQuality = (
  rows: TestCaseRow[],
  ignoredFindingIds: string[] = []
): CaseQualityAnalysis => {
  if (rows.length === 0) {
    return {
      score: 0,
      status: "weak",
      findings: [],
      strengths: [],
    };
  }

  const findings: CaseQualityFinding[] = [];
  const strengths: string[] = [];
  const rowWeakSignals = new Map<
    string,
    Array<Pick<CaseQualityFinding, "severity" | "type" | "summary" | "suggestion">>
  >();
  const pairCandidates: Array<
    CaseQualityFinding & {
      score: number;
    }
  > = [];

  rows.forEach((row, index) => {
    const titleKeywords = toKeywords(row.title);
    const bodyKeywords = toKeywords(
      `${row.preconditions} ${row.steps} ${row.expectedResult}`
    );
    const normalizedTitle = normalizeText(row.title);

    if (isVagueTitle(row.title)) {
      const existingSignals = rowWeakSignals.get(row.id) ?? [];
      existingSignals.push({
        severity: "medium",
        type: "vague",
        summary: `${row.id} uses a broad or generic title that may be unclear during review or execution.`,
        suggestion:
          "Rewrite the title to describe the scenario, condition, and expected behavior more specifically.",
      });
      rowWeakSignals.set(row.id, existingSignals);
    }

    if (isLowValueRow(row)) {
      const existingSignals = rowWeakSignals.get(row.id) ?? [];
      existingSignals.push({
        severity: "low",
        type: "low-value",
        summary: `${row.id} may be too thin to provide strong execution or review value.`,
        suggestion:
          "Add more concrete steps, clearer data conditions, and a stronger expected result.",
      });
      rowWeakSignals.set(row.id, existingSignals);
    }

    rows.slice(index + 1).forEach((otherRow) => {
      const pairId = [row.id, otherRow.id].sort().join(":");
      const otherTitleKeywords = toKeywords(otherRow.title);
      const otherBodyKeywords = toKeywords(
        `${otherRow.preconditions} ${otherRow.steps} ${otherRow.expectedResult}`
      );
      const titleScore = similarityScore(titleKeywords, otherTitleKeywords);
      const bodyScore = similarityScore(bodyKeywords, otherBodyKeywords);
      const sharedTitleKeywords = titleKeywords.filter((item) =>
        otherTitleKeywords.includes(item)
      ).length;
      const sameType = row.type === otherRow.type;
      const exactSameTitle =
        normalizedTitle.length > 0 &&
        normalizedTitle === normalizeText(otherRow.title);
      const rowVariant = detectScenarioVariant(row);
      const otherRowVariant = detectScenarioVariant(otherRow);
      const sameVariant = rowVariant === otherRowVariant;
      const bothGeneralVariants =
        rowVariant === "general" && otherRowVariant === "general";

      if (
        sameType &&
        (sameVariant || bothGeneralVariants) &&
        ((exactSameTitle && bodyScore >= 0.45) ||
          (titleScore >= 0.75 &&
            bodyScore >= 0.6 &&
            sharedTitleKeywords >= 2))
      ) {
        pairCandidates.push({
          id: `duplicate-${pairId}`,
          severity: "high",
          type: "duplicate",
          title: "Near-duplicate test cases detected",
          summary: `${row.id} and ${otherRow.id} appear to test almost the same scenario with very similar language.`,
          rowIds: [row.id, otherRow.id],
          suggestion:
            "Keep the stronger case and merge or delete the weaker duplicate to reduce noise.",
          score: titleScore * 0.6 + bodyScore * 0.4 + (exactSameTitle ? 0.2 : 0),
        });
        return;
      }

      if (
        sameType &&
        (sameVariant || bothGeneralVariants) &&
        titleScore >= 0.58 &&
        bodyScore >= 0.42 &&
        sharedTitleKeywords >= 2
      ) {
        pairCandidates.push({
          id: `overlap-${pairId}`,
          severity: "medium",
          type: "overlap",
          title: "Overlapping coverage detected",
          summary: `${row.id} and ${otherRow.id} share significant coverage and may overlap more than necessary.`,
          rowIds: [row.id, otherRow.id],
          suggestion:
            "Differentiate the scenarios more clearly or consolidate them into one stronger case.",
          score: titleScore * 0.55 + bodyScore * 0.45,
        });
      }
    });
  });

  const claimedRows = new Set<string>();

  pairCandidates
    .sort((left, right) => right.score - left.score)
    .forEach(({ score: _score, ...candidate }) => {
      if (ignoredFindingIds.includes(candidate.id)) {
        return;
      }

      if (candidate.rowIds.some((rowId) => claimedRows.has(rowId))) {
        return;
      }

      candidate.rowIds.forEach((rowId) => claimedRows.add(rowId));
      findings.push(candidate);
    });

  rowWeakSignals.forEach((signals, rowId) => {
    const uniqueSuggestions = Array.from(
      new Set(signals.map((signal) => signal.suggestion))
    );
    const combinedTypes = new Set(signals.map((signal) => signal.type));
    const severity: CaseQualitySeverity = combinedTypes.has("vague")
      ? "medium"
      : "low";
    const title =
      combinedTypes.size > 1
        ? "Weak test case needs rewrite"
        : combinedTypes.has("vague")
        ? "Vague test case title"
        : "Low-value test case structure";
    const summary =
      signals.length > 1
        ? `${rowId} has multiple quality issues that make the case harder to review and execute confidently.`
        : signals[0]?.summary ?? `${rowId} needs improvement.`;

    findings.push({
      id: `weak-${rowId}`,
      severity,
      type: combinedTypes.size > 1 ? "weak" : signals[0]?.type ?? "weak",
      title,
      summary,
      rowIds: [rowId],
      suggestion:
        uniqueSuggestions.length > 1
          ? uniqueSuggestions.join(" ")
          : uniqueSuggestions[0] ??
            "Rewrite the row to improve clarity, structure, and execution detail.",
    });
  });

  const filteredFindings = findings.filter(
    (finding) => !ignoredFindingIds.includes(finding.id)
  );

  if (!filteredFindings.some((item) => item.type === "duplicate")) {
    strengths.push("No strong duplicate patterns were detected.");
  }

  if (!filteredFindings.some((item) => item.type === "vague")) {
    strengths.push("Titles are mostly specific enough for review.");
  }

  if (
    !filteredFindings.some(
      (item) => item.type === "low-value" || item.type === "weak"
    )
  ) {
    strengths.push("Most rows contain meaningful execution detail.");
  }

  const penalty = filteredFindings.reduce((total, item) => {
    if (item.severity === "high") {
      return total + 16;
    }

    if (item.severity === "medium") {
      return total + 9;
    }

    return total + 4;
  }, 0);

  const score = Math.max(0, Math.min(100, 100 - penalty));
  const status = score >= 75 ? "strong" : score >= 45 ? "watch" : "weak";

  return {
    score,
    status,
    findings: filteredFindings,
    strengths,
  };
};
