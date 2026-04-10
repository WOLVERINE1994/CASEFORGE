import type {
  Project,
  TestCaseExecutionResult,
  TestCaseRow,
  TestRunRecord,
} from "./workspace";

export type BugDraft = {
  title: string;
  description: string;
  priority: "highest" | "high" | "medium" | "low";
  labels: string[];
};

const suggestPriority = (
  executionResult: TestCaseExecutionResult,
  caseRow: TestCaseRow
): BugDraft["priority"] => {
  if (executionResult === "failed") {
    return caseRow.priority === "highest" ? "highest" : "high";
  }

  if (executionResult === "blocked") {
    return "medium";
  }

  return caseRow.priority ?? "medium";
};

export const buildBugDraftFromRunCase = ({
  project,
  run,
  caseRow,
  actualResult,
  executionNotes,
}: {
  project: Project;
  run: TestRunRecord;
  caseRow: TestCaseRow;
  actualResult: string;
  executionNotes: string;
}): BugDraft => {
  const executionResult = run.rowResults[caseRow.id] ?? caseRow.executionResult ?? "not-run";
  const titlePrefix = executionResult === "blocked" ? "[Run Blocked]" : "[Run Failure]";
  const title = `${titlePrefix} ${caseRow.title.trim() || caseRow.id}`;
  const labels = Array.from(
    new Set(
      ["run-failure", "qa", ...(caseRow.labels ?? [])].filter(Boolean)
    )
  );
  const expectedResult = caseRow.expectedResult.trim() || "Expected result not captured.";
  const actualResultText = actualResult.trim() || "Actual result not captured.";
  const steps = caseRow.steps.trim() || "No reproduction steps were stored on the source case.";
  const notes = executionNotes.trim() || "No additional execution notes were captured.";
  const linkedIssue = caseRow.issueKey?.trim() ? `Linked case issue: ${caseRow.issueKey}` : "Linked case issue: none";

  return {
    title,
    priority: suggestPriority(executionResult, caseRow),
    labels,
    description: [
      "Failure Summary",
      `Project: ${project.projectKey?.trim() || project.name}`,
      `Run: ${run.name}`,
      `Case: ${caseRow.id}`,
      linkedIssue,
      "",
      "Steps to Reproduce",
      steps,
      "",
      "Expected Result",
      expectedResult,
      "",
      "Actual Result",
      actualResultText,
      "",
      "Execution Notes",
      notes,
    ].join("\n"),
  };
};
