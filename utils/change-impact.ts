import { type Persona, toPersonaLabel } from "./workspace";

type TestCaseRow = {
  id: string;
  type: string;
  title: string;
  preconditions: string;
  steps: string;
  expectedResult: string;
};

type TraceabilityLink = {
  rowId: string;
  requirementSentence: string;
  riskArea: string;
  generationMode: string;
};

export type RequirementChange = {
  id: string;
  type: "added" | "removed" | "changed";
  oldSentence?: string;
  newSentence?: string;
  summary: string;
};

export type SuggestedRegressionCase = {
  title: string;
  reason: string;
};

export type ChangeImpactAnalysis = {
  score: number;
  status: "stable" | "watch" | "high-impact";
  changes: RequirementChange[];
  impactedRowIds: string[];
  impactedRows: Array<{
    id: string;
    title: string;
    riskArea: string;
    recommendedAction: "obsolete" | "needs-review" | "needs-update";
    reason: string;
  }>;
  suggestedRegressionCases: SuggestedRegressionCase[];
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
  "able",
  "have",
  "has",
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
  "flow",
  "page",
  "screen",
  "system",
]);

const normalizeText = (content: string) =>
  content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const toKeywords = (content: string) =>
  Array.from(
    new Set(
      normalizeText(content)
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
  return overlap / Math.max(left.length, right.length);
};

const splitRequirementIntoSentences = (requirement: string) =>
  requirement
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const findRelatedRowIds = (
  relevantSentence: string,
  rows: TestCaseRow[],
  traceabilityLinks: Record<string, TraceabilityLink>
) => {
  const tracedRowIds = Object.values(traceabilityLinks)
    .filter((link) => link.requirementSentence === relevantSentence)
    .map((link) => link.rowId);

  if (tracedRowIds.length > 0) {
    return tracedRowIds;
  }

  const sentenceKeywords = toKeywords(relevantSentence);

  return rows
    .map((row) => {
      const rowKeywords = toKeywords(
        `${row.title} ${row.preconditions} ${row.steps} ${row.expectedResult}`
      );

      return {
        rowId: row.id,
        score: similarityScore(sentenceKeywords, rowKeywords),
      };
    })
    .filter((item) => item.score >= 0.22)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((item) => item.rowId);
};

const findFallbackImpactedRowIds = (
  changes: RequirementChange[],
  rows: TestCaseRow[],
  traceabilityLinks: Record<string, TraceabilityLink>
) => {
  if (changes.length === 0 || rows.length === 0) {
    return [];
  }

  const combinedChangeText = changes
    .map((change) =>
      [change.oldSentence, change.newSentence, change.summary]
        .filter(Boolean)
        .join(" ")
    )
    .join(" ");

  const combinedChangeKeywords = toKeywords(combinedChangeText);

  const scoredRows = rows
    .map((row) => {
      const rowKeywords = toKeywords(
        [
          row.title,
          row.preconditions,
          row.steps,
          row.expectedResult,
          traceabilityLinks[row.id]?.requirementSentence ?? "",
          traceabilityLinks[row.id]?.riskArea ?? "",
        ].join(" ")
      );

      return {
        rowId: row.id,
        score: similarityScore(combinedChangeKeywords, rowKeywords),
      };
    })
    .sort((left, right) => right.score - left.score);

  const strongMatches = scoredRows
    .filter((item) => item.score >= 0.12)
    .slice(0, 5)
    .map((item) => item.rowId);

  if (strongMatches.length > 0) {
    return strongMatches;
  }

  return scoredRows.slice(0, Math.min(3, scoredRows.length)).map((item) => item.rowId);
};

const buildChangeSummary = (
  type: "added" | "removed" | "changed",
  oldSentence?: string,
  newSentence?: string
) => {
  if (type === "added" && newSentence) {
    return `New behavior introduced: ${newSentence}`;
  }

  if (type === "removed" && oldSentence) {
    return `Previous behavior removed or no longer stated: ${oldSentence}`;
  }

  return `Requirement behavior changed from "${oldSentence}" to "${newSentence}"`;
};

export const analyzeChangeImpact = (
  oldRequirement: string,
  newRequirement: string,
  rows: TestCaseRow[],
  traceabilityLinks: Record<string, TraceabilityLink>,
  persona: Persona = "all"
): ChangeImpactAnalysis => {
  const oldSentences = splitRequirementIntoSentences(oldRequirement);
  const newSentences = splitRequirementIntoSentences(newRequirement);

  if (!oldRequirement.trim() || !newRequirement.trim()) {
    return {
      score: 0,
      status: "stable",
      changes: [],
      impactedRowIds: [],
      impactedRows: [],
      suggestedRegressionCases: [],
    };
  }

  const changes: RequirementChange[] = [];
  const matchedOldIndexes = new Set<number>();
  const matchedNewIndexes = new Set<number>();

  oldSentences.forEach((oldSentence, oldIndex) => {
    const oldKeywords = toKeywords(oldSentence);
    let bestMatchIndex = -1;
    let bestScore = 0;

    newSentences.forEach((newSentence, newIndex) => {
      if (matchedNewIndexes.has(newIndex)) {
        return;
      }

      const score = similarityScore(oldKeywords, toKeywords(newSentence));
      if (score > bestScore) {
        bestScore = score;
        bestMatchIndex = newIndex;
      }
    });

    if (bestMatchIndex >= 0 && bestScore >= 0.8) {
      matchedOldIndexes.add(oldIndex);
      matchedNewIndexes.add(bestMatchIndex);
      return;
    }

    if (bestMatchIndex >= 0 && bestScore >= 0.35) {
      matchedOldIndexes.add(oldIndex);
      matchedNewIndexes.add(bestMatchIndex);
      changes.push({
        id: `changed-${oldIndex}-${bestMatchIndex}`,
        type: "changed",
        oldSentence,
        newSentence: newSentences[bestMatchIndex],
        summary: buildChangeSummary(
          "changed",
          oldSentence,
          newSentences[bestMatchIndex]
        ),
      });
      return;
    }

    changes.push({
      id: `removed-${oldIndex}`,
      type: "removed",
      oldSentence,
      summary: buildChangeSummary("removed", oldSentence),
    });
  });

  newSentences.forEach((newSentence, newIndex) => {
    if (matchedNewIndexes.has(newIndex)) {
      return;
    }

    changes.push({
      id: `added-${newIndex}`,
      type: "added",
      newSentence,
      summary: buildChangeSummary("added", undefined, newSentence),
    });
  });

  let impactedRowIds = Array.from(
    new Set(
      changes.flatMap((change) => {
        const relevantSentence = change.oldSentence || change.newSentence || "";
        return findRelatedRowIds(relevantSentence, rows, traceabilityLinks);
      })
    )
  );

  if (impactedRowIds.length === 0 && changes.length > 0 && rows.length > 0) {
    impactedRowIds = findFallbackImpactedRowIds(
      changes,
      rows,
      traceabilityLinks
    );
  }

  const rowChangeMap = new Map<
    string,
    Array<{
      type: RequirementChange["type"];
      summary: string;
    }>
  >();

  changes.forEach((change) => {
    const relevantSentence = change.oldSentence || change.newSentence || "";
    findRelatedRowIds(relevantSentence, rows, traceabilityLinks).forEach(
      (rowId) => {
        const existing = rowChangeMap.get(rowId) ?? [];
        existing.push({ type: change.type, summary: change.summary });
        rowChangeMap.set(rowId, existing);
      }
    );
  });

  if (rowChangeMap.size === 0 && impactedRowIds.length > 0) {
    impactedRowIds.forEach((rowId) => {
      rowChangeMap.set(
        rowId,
        changes.map((change) => ({
          type: change.type,
          summary: change.summary,
        }))
      );
    });
  }

  const impactedRows = rows
    .filter((row) => impactedRowIds.includes(row.id))
    .map((row) => {
      const relatedChanges = rowChangeMap.get(row.id) ?? [];
      const hasRemoved = relatedChanges.some((change) => change.type === "removed");
      const hasChanged = relatedChanges.some((change) => change.type === "changed");

      const recommendedAction: "obsolete" | "needs-review" | "needs-update" =
        hasRemoved
          ? "obsolete"
          : hasChanged
          ? "needs-update"
          : "needs-review";

      const reason = hasRemoved
        ? "The original requirement behavior appears removed, so this case may no longer be valid."
        : hasChanged
        ? "The linked behavior changed, so this case likely needs updates before reuse."
        : "A nearby requirement change was detected, so this case should be reviewed for continued relevance.";

      return {
        id: row.id,
        title: row.title,
        riskArea:
          traceabilityLinks[row.id]?.riskArea ?? "Core functional behavior",
        recommendedAction,
        reason,
      };
    });

  const suggestedRegressionCases = changes.map((change) => {
    const basis = change.newSentence || change.oldSentence || "updated behavior";
    const normalized = basis.replace(/[.?!]+$/, "");

    return {
      title:
        change.type === "added"
          ? `Verify new behavior for ${persona === "all" ? "" : `${toPersonaLabel(persona).toLowerCase()} `}${normalized}`.replace(/\s+/g, " ")
          : change.type === "removed"
          ? `Verify removed or deprecated behavior no longer appears for ${persona === "all" ? "" : `${toPersonaLabel(persona).toLowerCase()} `}${normalized}`.replace(/\s+/g, " ")
          : `Verify updated behavior after requirement change for ${persona === "all" ? "" : `${toPersonaLabel(persona).toLowerCase()} `}${normalized}`.replace(/\s+/g, " "),
      reason:
        change.type === "added"
          ? `A new behavior was introduced and needs fresh coverage${persona === "all" ? "." : ` for the ${toPersonaLabel(persona).toLowerCase()}.`}`
          : change.type === "removed"
          ? `Existing coverage may need regression checks to confirm old behavior is gone${persona === "all" ? "." : ` for the ${toPersonaLabel(persona).toLowerCase()}.`}`
          : `Changed behavior needs regression validation against the updated expectation${persona === "all" ? "." : ` for the ${toPersonaLabel(persona).toLowerCase()}.`}`,
    };
  });

  const penalty = changes.reduce((total, change) => {
    if (change.type === "changed") {
      return total + 18;
    }

    return total + 10;
  }, 0);

  const score = Math.max(0, Math.min(100, 100 - penalty));
  const status =
    changes.length === 0
      ? "stable"
      : changes.some((change) => change.type === "changed")
      ? "high-impact"
      : "watch";

  return {
    score,
    status,
    changes,
    impactedRowIds,
    impactedRows,
    suggestedRegressionCases,
  };
};
