import type {
  GeneratedCaseSnapshot,
  GenerationFeedbackRecord,
  GenerationFeedbackSignal,
  Project,
  TestCaseExecutionResult,
  TestCaseRow,
} from "./workspace";

export const toGeneratedCaseSnapshot = (
  row: Pick<
    TestCaseRow,
    | "title"
    | "preconditions"
    | "steps"
    | "expectedResult"
    | "testData"
    | "type"
    | "testDomain"
    | "riskLevel"
    | "labels"
  >
): GeneratedCaseSnapshot => ({
  title: row.title || "",
  preconditions: row.preconditions || "",
  steps: row.steps || "",
  expectedResult: row.expectedResult || "",
  testData: row.testData || "",
  type: row.type || "",
  testDomain: row.testDomain || "",
  riskLevel: row.riskLevel || "",
  labels: row.labels ?? [],
});

export const buildEditDeltaSummary = (
  original: GeneratedCaseSnapshot | undefined,
  finalEdited: GeneratedCaseSnapshot
) => {
  if (!original) {
    return {
      changedFields: [] as string[],
      changedFieldCount: 0,
      editIntensity: "low" as const,
    };
  }

  const changedFields = [
    "title",
    "preconditions",
    "steps",
    "expectedResult",
    "testData",
    "type",
    "testDomain",
    "riskLevel",
  ].filter((field) => {
    const left = String(original[field as keyof GeneratedCaseSnapshot] ?? "").trim();
    const right = String(finalEdited[field as keyof GeneratedCaseSnapshot] ?? "").trim();
    return left !== right;
  });

  const editIntensity: "low" | "medium" | "high" =
    changedFields.length >= 5
      ? "high"
      : changedFields.length >= 2
      ? "medium"
      : "low";

  return {
    changedFields,
    changedFieldCount: changedFields.length,
    editIntensity,
  };
};

export const buildGenerationFeedbackRecord = ({
  row,
  existing,
  sourceRequirement,
  generationMode,
  signal,
  disposition,
}: {
  row: TestCaseRow;
  existing?: GenerationFeedbackRecord;
  sourceRequirement?: string;
  generationMode?: string;
  signal?: GenerationFeedbackSignal;
  disposition?: GenerationFeedbackRecord["disposition"];
}): GenerationFeedbackRecord => {
  const finalEdited = toGeneratedCaseSnapshot(row);
  const originalGenerated = existing?.originalGenerated ?? finalEdited;

  return {
    rowId: row.id,
    sourceRequirement: sourceRequirement ?? existing?.sourceRequirement,
    generationMode: generationMode ?? existing?.generationMode,
    generatedAt: existing?.generatedAt ?? row.createdAt ?? Date.now(),
    originalGenerated,
    finalEdited,
    editDeltaSummary: buildEditDeltaSummary(originalGenerated, finalEdited),
    reviewSignal: signal ?? existing?.reviewSignal,
    disposition: disposition ?? existing?.disposition ?? "accepted",
    duplicateRemoved: existing?.duplicateRemoved ?? false,
    executionOutcome:
      (row.executionResult as TestCaseExecutionResult | undefined) ??
      existing?.executionOutcome,
    linkedIssueId: row.issueId ?? existing?.linkedIssueId,
    linkedIssueKey: row.issueKey ?? existing?.linkedIssueKey,
    lastUpdatedAt: Date.now(),
  };
};

export const buildGenerationQualitySignals = (project: Project | null) => {
  const rows = project?.rows ?? [];
  const aiRows = rows.filter((row) => row.generationSource === "ai-generated");
  const feedback = aiRows
    .map((row) => row.generationFeedback)
    .filter((item): item is GenerationFeedbackRecord => Boolean(item));

  const accepted = feedback.filter((item) => item.disposition === "accepted").length;
  const rejected = feedback.filter((item) => item.disposition === "rejected").length;
  const regenerated = feedback.filter((item) => item.disposition === "regenerated").length;
  const duplicates = feedback.filter(
    (item) => item.reviewSignal === "duplicate" || item.duplicateRemoved
  ).length;
  const edited = feedback.filter(
    (item) => (item.editDeltaSummary?.changedFieldCount ?? 0) > 0
  );
  const downstreamFailures = feedback.filter(
    (item) => item.executionOutcome === "failed" || item.linkedIssueId
  ).length;
  const automationConverted = aiRows.filter(
    (row) => row.automationStatus === "automated"
  ).length;

  return {
    totalGenerated: aiRows.length,
    acceptanceRate:
      aiRows.length === 0 ? 0 : Math.round((accepted / aiRows.length) * 100),
    editIntensity:
      edited.length === 0
        ? 0
        : Math.round(
            edited.reduce(
              (sum, item) => sum + (item.editDeltaSummary?.changedFieldCount ?? 0),
              0
            ) / edited.length
          ),
    duplicateRemovalRate:
      aiRows.length === 0 ? 0 : Math.round((duplicates / aiRows.length) * 100),
    downstreamFailureCorrelation:
      aiRows.length === 0
        ? 0
        : Math.round((downstreamFailures / aiRows.length) * 100),
    automationConversionRate:
      aiRows.length === 0 ? 0 : Math.round((automationConverted / aiRows.length) * 100),
    regeneratedCount: regenerated,
    rejectedCount: rejected,
  };
};
