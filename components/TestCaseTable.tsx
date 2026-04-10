"use client";

import Link from "next/link";
import { useState, type DragEvent } from "react";
import {
  automationProviderOptions,
  automationStatusLabels,
  executionResultLabels,
  priorityLabels,
  reviewStatusLabels,
  workflowStatusLabels,
  type CaseTemplate,
  type CaseReviewHistoryEntry,
  type ReviewerNotification,
  type TestDataSet,
  type TestCaseComment,
  type TestCaseWatcher,
  type TestCaseVersionEntry,
  type TestCaseExecutionResult,
  type TestCasePriority,
  type TestCaseRow,
  type TestCaseWorkflowStatus,
} from "../utils/workspace";
import { formatUtcDate } from "../utils/date-format";

type ReviewInsight = {
  whyThisExists: string;
  coveredRisk: string;
  mappedRequirementSentence: string;
  reasoning: string;
};

type IssueOption = {
  id: string;
  issueKey: string;
  summary: string;
};

type UserOption = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
};

const typeBadgeClassNames: Record<string, string> = {
  Functional:
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
  Regression:
    "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300",
  API:
    "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-300",
  UI:
    "border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-500/30 dark:bg-pink-500/10 dark:text-pink-300",
  Negative:
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
  Edge:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  Integration:
    "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300",
  Security:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
  Performance:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
};

const workflowTone: Record<TestCaseWorkflowStatus, string> = {
  backlog:
    "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
  todo: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
  "in-progress":
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  blocked:
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
  done: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
};

const priorityTone: Record<TestCasePriority, string> = {
  highest:
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
  high: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  medium:
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
  low: "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
};

const executionTone: Record<TestCaseExecutionResult, string> = {
  "not-run":
    "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
  passed:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  failed:
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
  blocked:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
};

const reviewTone: Record<NonNullable<TestCaseRow["reviewStatus"]>, string> = {
  draft:
    "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
  "in-review":
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
  approved:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  "changes-requested":
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
};

type Props = {
  rows: TestCaseRow[];
  traceabilityLinks: Record<
    string,
    {
      rowId: string;
      requirementSentence: string;
      riskArea: string;
      generationMode: string;
    }
  >;
  reviewInsights: Record<string, ReviewInsight>;
  issueOptions: IssueOption[];
  loadingIssueOptions: boolean;
  projectRouteRef: string | null;
  caseCommentsByRowId: Record<string, TestCaseComment[]>;
  caseWatchersByRowId: Record<string, TestCaseWatcher[]>;
  caseVersionHistoryByRowId: Record<string, TestCaseVersionEntry[]>;
  caseReviewHistoryByRowId: Record<string, CaseReviewHistoryEntry[]>;
  caseCommentDrafts: Record<string, string>;
  activeReviewerLabel: string;
  reviewerAttentionByRowId: Record<
    string,
    {
      unreadCount: number;
      mentionCount: number;
      watchCount: number;
      latestNotification?: ReviewerNotification;
    }
  >;
  testDataSets: TestDataSet[];
  caseTemplates: CaseTemplate[];
  userOptions: UserOption[];
  updateCell: (
    index: number,
    field: keyof TestCaseRow,
    value: string
  ) => void;
  onCaseCommentDraftChange: (rowId: string, value: string) => void;
  onAddCaseComment: (rowId: string) => void;
  onToggleCaseCommentResolved: (rowId: string, commentId: string) => void;
  onDeleteCaseComment: (rowId: string, commentId: string) => void;
  onToggleCaseWatch: (rowId: string) => void;
  onCloneRow: (rowId: string) => void;
  onSaveTemplateFromRow: (row: TestCaseRow) => void;
  onRestoreCaseVersion: (rowId: string, versionId: string) => void;
  deleteRow: (index: number) => void;
  regenerateRow: (index: number) => void;
  regeneratingIndex: number | null;
  loading: boolean;
  input: string;
  highlightedRowId: string | null;
  highlightedRowLabel: string | null;
  highlightedCommentId?: string | null;
  draggedIndex: number | null;
  dragOverIndex: number | null;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDrop: (fromIndex: number, toIndex: number) => void;
  onDragEnd: () => void;
  enableSelection?: boolean;
  selectedRowIds?: string[];
  onToggleRowSelection?: (rowId: string) => void;
  onToggleSelectAll?: () => void;
};

export default function TestCaseTable({
  rows,
  traceabilityLinks,
  reviewInsights,
  issueOptions,
  loadingIssueOptions,
  projectRouteRef,
  caseCommentsByRowId,
  caseWatchersByRowId,
  caseVersionHistoryByRowId,
  caseReviewHistoryByRowId,
  caseCommentDrafts,
  activeReviewerLabel,
  reviewerAttentionByRowId,
  testDataSets,
  caseTemplates,
  userOptions,
  updateCell,
  onCaseCommentDraftChange,
  onAddCaseComment,
  onToggleCaseCommentResolved,
  onDeleteCaseComment,
  onToggleCaseWatch,
  onCloneRow,
  onSaveTemplateFromRow,
  onRestoreCaseVersion,
  deleteRow,
  regenerateRow,
  regeneratingIndex,
  loading,
  input,
  highlightedRowId,
  highlightedRowLabel,
  highlightedCommentId = null,
  draggedIndex,
  dragOverIndex,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  enableSelection = false,
  selectedRowIds = [],
  onToggleRowSelection,
  onToggleSelectAll,
}: Props) {
  const [versionCompareSelections, setVersionCompareSelections] = useState<
    Record<string, string[]>
  >({});

  const handleDragOver = (
    event: DragEvent<HTMLTableRowElement>,
    index: number
  ) => {
    event.preventDefault();
    onDragOver(index);
  };

  const handleDrop = (index: number) => {
    if (draggedIndex === null) {
      return;
    }

    onDrop(draggedIndex, index);
    onDragEnd();
  };

  const toggleVersionCompareSelection = (rowId: string, versionId: string) => {
    setVersionCompareSelections((current) => {
      const existing = current[rowId] ?? [];
      const next = existing.includes(versionId)
        ? existing.filter((item) => item !== versionId)
        : [...existing.slice(-1), versionId];

      if (next.length === 0) {
        const rest = { ...current };
        delete rest[rowId];
        return rest;
      }

      return {
        ...current,
        [rowId]: next,
      };
    });
  };

  const clearVersionCompareSelection = (rowId: string) => {
    setVersionCompareSelections((current) => {
      const rest = { ...current };
      delete rest[rowId];
      return rest;
    });
  };

  return (
    <div className="overflow-hidden rounded-[24px] border border-zinc-200/80 bg-white/96 shadow-[0_26px_58px_-40px_rgba(15,23,42,0.24)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/94">
      <div className="border-b border-zinc-200/80 bg-zinc-50/85 px-5 py-4 dark:border-zinc-800 dark:bg-zinc-950/72">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
          Case Review Table
        </p>
        <p className="mt-1 text-base font-semibold text-zinc-800 dark:text-zinc-100">
          Review and edit generated cases
        </p>
        <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          Edit inline, improve weaker drafts, and drag rows using the grip beside the test case ID to set order.
        </p>
        {input.trim() && rows.length > 0 ? (
          <div className="mt-3 rounded-[18px] border border-emerald-200/80 bg-emerald-50/80 px-4 py-3 text-xs text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100">
            <p className="font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
              AI Draft Editing Guide
            </p>
            <p className="mt-1 leading-5 text-emerald-800/90 dark:text-emerald-100/80">
              Keep titles scenario-based, keep setup in Preconditions, keep actions in Steps, keep outcomes in Expected Result,
              and use Test Data for sample inputs that help execution.
            </p>
          </div>
        ) : null}
      </div>

      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[2080px] border-separate border-spacing-0 text-sm table-fixed">
          <colgroup>
            {enableSelection && <col className="w-[72px]" />}
            <col className="w-[280px]" />
            <col className="w-[190px]" />
            <col className="w-[320px]" />
            <col className="w-[280px]" />
            <col className="w-[230px]" />
            <col className="w-[280px]" />
            <col className="w-[230px]" />
            <col className="w-[300px]" />
            <col className="w-[140px]" />
          </colgroup>
          <thead className="bg-zinc-50/90 dark:bg-zinc-950/70">
            <tr>
              {enableSelection && (
                <th className="border-b border-zinc-200 px-4 py-3.5 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && rows.every((row) => selectedRowIds.includes(row.id))}
                    onChange={() => onToggleSelectAll?.()}
                    className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                    aria-label="Select all visible test cases"
                  />
                </th>
              )}
              <th className="border-b border-zinc-200 px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                Test Case
              </th>
              <th className="border-b border-zinc-200 px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                Type
              </th>
              <th className="border-b border-zinc-200 px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                Review Context
              </th>
              <th className="border-b border-zinc-200 px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                Title
              </th>
              <th className="border-b border-zinc-200 px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                Preconditions
              </th>
              <th className="border-b border-zinc-200 px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                Steps
              </th>
              <th className="border-b border-zinc-200 px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                Expected Result
              </th>
              <th className="border-b border-zinc-200 px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                Test Data
              </th>
              <th className="border-b border-zinc-200 px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                Actions
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, index) => {
              const isRegenerating = regeneratingIndex === index;
              const isDragged = draggedIndex === index;
              const isDragOver = dragOverIndex === index;
              const isHighlighted = highlightedRowId === row.id;
              const isSelected = selectedRowIds.includes(row.id);
              const traceability = traceabilityLinks[row.id];
                const reviewInsight = reviewInsights[row.id];
                const rowComments = caseCommentsByRowId[row.id] ?? [];
                const openReviewNotesCount = rowComments.filter(
                  (comment) => !comment.resolvedAt
                ).length;
                const rowWatchers = caseWatchersByRowId[row.id] ?? [];
                const rowVersionHistory = caseVersionHistoryByRowId[row.id] ?? [];
                const rowReviewHistory = caseReviewHistoryByRowId[row.id] ?? [];
                const reviewerAttention = reviewerAttentionByRowId[row.id];
                const draftStepCount = row.steps
                  .split(";")
                  .map((step) => step.trim())
                  .filter(Boolean).length;
                const draftReadinessSignals = [
                  row.title.trim().split(/\s+/).length < 4
                    ? "Needs stronger title"
                    : null,
                  draftStepCount < 3 ? "Needs more steps" : null,
                  row.expectedResult.trim().length < 24
                    ? "Expected result is thin"
                    : null,
                  !row.reviewOwner?.trim() ? "Assign review owner" : null,
                  openReviewNotesCount > 0 ? "Resolve review notes" : null,
                ].filter(Boolean) as string[];
                const draftRewriteTargets = [
                  row.title.trim().split(/\s+/).length < 4 ? "title" : null,
                  draftStepCount < 3 ? "steps" : null,
                  row.expectedResult.trim().length < 24 ? "expected result" : null,
                  !row.preconditions.trim() ? "preconditions" : null,
                  !row.testData?.trim() ||
                  row.testData.trim().toLowerCase() === "none"
                    ? "test data"
                    : null,
                ].filter(Boolean) as string[];
                const readyForApproval = draftReadinessSignals.length === 0;
                const canSendToReview =
                  readyForApproval &&
                  (row.reviewStatus ?? "draft") !== "in-review" &&
                  (row.reviewStatus ?? "draft") !== "approved";
                const selectedVersionIds = versionCompareSelections[row.id] ?? [];
                const selectedVersions = selectedVersionIds
                  .map((versionId) =>
                    rowVersionHistory.find((version) => version.id === versionId)
                  )
                  .filter(Boolean) as TestCaseVersionEntry[];
                const summarizeVersionDiff = (snapshot: TestCaseRow) => {
                  const changedFields = [
                    snapshot.title !== row.title ? "title" : null,
                    snapshot.preconditions !== row.preconditions ? "preconditions" : null,
                    snapshot.steps !== row.steps ? "steps" : null,
                    snapshot.expectedResult !== row.expectedResult
                      ? "expected result"
                      : null,
                    (snapshot.testData ?? "") !== (row.testData ?? "")
                      ? "test data"
                      : null,
                    (snapshot.workflowStatus ?? "backlog") !==
                    (row.workflowStatus ?? "backlog")
                      ? "workflow"
                      : null,
                    (snapshot.priority ?? "medium") !== (row.priority ?? "medium")
                      ? "priority"
                      : null,
                    (snapshot.executionResult ?? "not-run") !==
                    (row.executionResult ?? "not-run")
                      ? "execution"
                      : null,
                    (snapshot.reviewStatus ?? "draft") !==
                    (row.reviewStatus ?? "draft")
                      ? "review"
                      : null,
                    (snapshot.reviewOwner ?? "") !== (row.reviewOwner ?? "")
                      ? "review owner"
                      : null,
                    (snapshot.assignee ?? "") !== (row.assignee ?? "")
                      ? "assignee"
                      : null,
                  ].filter(Boolean) as string[];

                  if (changedFields.length === 0) {
                    return "Matches the current case state.";
                  }

                  const preview = changedFields.slice(0, 4).join(", ");
                  return changedFields.length > 4
                    ? `${changedFields.length} fields differ: ${preview}, and more.`
                    : `${changedFields.length} field${changedFields.length === 1 ? "" : "s"} differ: ${preview}.`;
                };
                const buildVersionComparisons = (
                  leftSnapshot: TestCaseRow,
                  rightSnapshot: TestCaseRow
                ) =>
                  [
                    {
                      label: "Title",
                      left: leftSnapshot.title || "Not set",
                      right: rightSnapshot.title || "Not set",
                    },
                    {
                      label: "Preconditions",
                      left: leftSnapshot.preconditions || "Not set",
                      right: rightSnapshot.preconditions || "Not set",
                    },
                    {
                      label: "Steps",
                      left: leftSnapshot.steps || "Not set",
                      right: rightSnapshot.steps || "Not set",
                    },
                    {
                      label: "Expected Result",
                      left: leftSnapshot.expectedResult || "Not set",
                      right: rightSnapshot.expectedResult || "Not set",
                    },
                    {
                      label: "Test Data",
                      left: leftSnapshot.testData || "Not set",
                      right: rightSnapshot.testData || "Not set",
                    },
                    {
                      label: "Workflow",
                      left:
                        workflowStatusLabels[leftSnapshot.workflowStatus ?? "backlog"],
                      right:
                        workflowStatusLabels[rightSnapshot.workflowStatus ?? "backlog"],
                    },
                    {
                      label: "Priority",
                      left: priorityLabels[leftSnapshot.priority ?? "medium"],
                      right: priorityLabels[rightSnapshot.priority ?? "medium"],
                    },
                    {
                      label: "Execution",
                      left:
                        executionResultLabels[
                          leftSnapshot.executionResult ?? "not-run"
                        ],
                      right:
                        executionResultLabels[
                          rightSnapshot.executionResult ?? "not-run"
                        ],
                    },
                    {
                      label: "Review",
                      left: reviewStatusLabels[leftSnapshot.reviewStatus ?? "draft"],
                      right: reviewStatusLabels[rightSnapshot.reviewStatus ?? "draft"],
                    },
                    {
                      label: "Review Owner",
                      left: leftSnapshot.reviewOwner || "Not assigned",
                      right: rightSnapshot.reviewOwner || "Not assigned",
                    },
                    {
                      label: "Assignee",
                      left: leftSnapshot.assignee || "Unassigned",
                      right: rightSnapshot.assignee || "Unassigned",
                    },
                  ].filter((field) => field.left !== field.right);

                return (
                <tr
                  key={`${row.id}-${index}`}
                  id={`test-case-row-${row.id}`}
                  className={`group align-top transition-all duration-150 ${
                    isDragged ? "scale-[0.995] opacity-50" : ""
                  } ${
                    isHighlighted
                      ? "bg-emerald-50/80 dark:bg-emerald-500/10"
                      : isDragOver
                      ? "bg-amber-50/60 dark:bg-zinc-950"
                      : "bg-white/65 dark:bg-transparent"
                  }`}
                  onDragOver={(event) => handleDragOver(event, index)}
                  onDrop={() => handleDrop(index)}
                >
                  {enableSelection && (
                    <td className="border-b border-zinc-200/80 p-4 align-top text-center dark:border-zinc-800">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleRowSelection?.(row.id)}
                        className="mt-3 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                        aria-label={`Select ${row.id}`}
                      />
                    </td>
                  )}
                  <td className="border-b border-zinc-200/80 p-4 align-top dark:border-zinc-800">
                    <div className="flex min-w-[180px] items-start gap-3">
                      <button
                        type="button"
                        draggable={regeneratingIndex === null}
                        onDragStart={() => onDragStart(index)}
                        onDragEnd={onDragEnd}
                        className="mt-1 inline-flex h-10 w-10 shrink-0 cursor-grab items-center justify-center rounded-2xl border border-zinc-200/80 bg-white text-zinc-400 shadow-sm transition hover:border-zinc-300 hover:text-zinc-700 active:cursor-grabbing dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-500 dark:hover:border-zinc-600 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
                        title="Drag to reorder"
                      >
                        <span className="text-lg leading-none">::</span>
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex items-center gap-2">
                          {isDragOver && (
                            <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                              Drop here
                            </span>
                          )}
                          {isHighlighted && (
                            <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                              {highlightedRowLabel || "Focused row"}
                            </span>
                          )}
                          {row.gapSourceLabel && (
                            <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                              {row.gapSourceMethod === "manual"
                                ? "Manual gap draft"
                                : "Added for gap"}: {row.gapSourceLabel}
                            </span>
                          )}
                          {row.predictionSourceLabel && (
                            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                              {row.predictionSourceMethod === "manual"
                                ? "Manual defect draft"
                                : "Added for defect"}: {row.predictionSourceLabel}
                            </span>
                          )}
                          {row.changeSourceLabel && (
                            <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
                              {row.changeSourceType === "updated"
                                ? "Updated from change"
                                : "New from change"}: {row.changeSourceLabel}
                            </span>
                          )}
                          {row.lifecycleStatus && (
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                row.lifecycleStatus === "obsolete"
                                  ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
                                  : row.lifecycleStatus === "new"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                                  : row.lifecycleStatus === "keep"
                                  ? "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                                  : row.lifecycleStatus === "needs-update"
                                  ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                                  : "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300"
                              }`}
                            >
                              {row.lifecycleStatus === "obsolete"
                                ? "Obsolete"
                                : row.lifecycleStatus === "new"
                                ? "New"
                                : row.lifecycleStatus === "keep"
                                ? "Keep"
                                : row.lifecycleStatus === "needs-update"
                                ? "Needs Update"
                                : "Needs Review"}
                            </span>
                          )}
                          {traceability && (
                            <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
                              Traced to requirement
                            </span>
                          )}
                        </div>
                        {traceability && (
                          <div className="mb-3 rounded-2xl border border-zinc-200/80 bg-zinc-50/90 px-3 py-3 text-xs leading-5 text-zinc-600 shadow-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                            <div>
                              <span className="font-semibold text-zinc-700 dark:text-zinc-100">
                                Requirement:
                              </span>{" "}
                              {traceability.requirementSentence}
                            </div>
                            <div className="mt-1">
                              <span className="font-semibold text-zinc-700 dark:text-zinc-100">
                                Risk area:
                              </span>{" "}
                              {traceability.riskArea}
                            </div>
                            <div className="mt-1">
                              <span className="font-semibold text-zinc-700 dark:text-zinc-100">
                                Mode:
                              </span>{" "}
                              {traceability.generationMode}
                            </div>
                            {reviewInsight && (
                              <>
                                <div className="mt-1">
                                  <span className="font-semibold text-zinc-700 dark:text-zinc-100">
                                    Why this exists:
                                  </span>{" "}
                                  {reviewInsight.whyThisExists}
                                </div>
                                <div className="mt-1">
                                  <span className="font-semibold text-zinc-700 dark:text-zinc-100">
                                    Review reasoning:
                                  </span>{" "}
                                  {reviewInsight.reasoning}
                                </div>
                              </>
                            )}
                          </div>
                        )}

                        <textarea
                          className="min-h-[84px] w-full resize-y overflow-auto rounded-2xl border border-zinc-200/80 bg-white px-3 py-2.5 font-mono text-sm leading-6 text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                          rows={2}
                          value={row.id}
                          onChange={(e) =>
                            updateCell(index, "id", e.target.value)
                          }
                        />
                      </div>
                    </div>
                  </td>

                  <td className="border-b border-zinc-200/80 p-4 align-top dark:border-zinc-800">
                    <div className="min-w-0">
                      <span
                        className={`inline-flex min-h-[52px] w-full items-center justify-center rounded-2xl border px-4 py-2 text-center text-sm font-semibold shadow-sm ${typeBadgeClassNames[row.type] ?? typeBadgeClassNames.Functional}`}
                      >
                        {row.type}
                      </span>
                    </div>
                  </td>

                  <td className="border-b border-zinc-200/80 p-4 align-top dark:border-zinc-800">
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {row.issueKey && (
                            row.issueId && projectRouteRef ? (
                              <Link
                                href={`/projects/${encodeURIComponent(projectRouteRef)}/issues?issueId=${encodeURIComponent(row.issueId)}`}
                                className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 transition hover:brightness-95 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300"
                              >
                                Linked: {row.issueKey}
                              </Link>
                            ) : (
                              <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
                                Linked: {row.issueKey}
                              </span>
                            )
                          )}
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${workflowTone[row.workflowStatus ?? "backlog"]}`}
                          >
                          {workflowStatusLabels[row.workflowStatus ?? "backlog"]}
                        </span>
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${priorityTone[row.priority ?? "medium"]}`}
                        >
                          {priorityLabels[row.priority ?? "medium"]}
                        </span>
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${executionTone[row.executionResult ?? "not-run"]}`}
                        >
                          {executionResultLabels[row.executionResult ?? "not-run"]}
                        </span>
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${reviewTone[row.reviewStatus ?? "draft"]}`}
                        >
                          {reviewStatusLabels[row.reviewStatus ?? "draft"]}
                        </span>
                        {rowComments.length > 0 && (
                          <span className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                            {rowComments.length} review note{rowComments.length === 1 ? "" : "s"}
                          </span>
                        )}
                        {row.reviewOwner?.trim() && (
                          <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                            Owner: {row.reviewOwner}
                          </span>
                        )}
                        {rowVersionHistory.length > 0 && (
                          <span className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                            {rowVersionHistory.length} version{rowVersionHistory.length === 1 ? "" : "s"}
                          </span>
                        )}
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                            readyForApproval
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                              : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                          }`}
                        >
                          {readyForApproval ? "Ready to approve" : "Needs review cleanup"}
                        </span>
                      </div>

                      <div className="rounded-[22px] border border-zinc-200/80 bg-zinc-50/90 p-3 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-950/70">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                            Draft Readiness
                          </p>
                          <span className="font-medium text-zinc-500 dark:text-zinc-400">
                            Approval needs an owner and no open notes
                          </span>
                        </div>
                        {draftReadinessSignals.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {draftReadinessSignals.map((signal) => (
                              <span
                                key={`${row.id}-${signal}`}
                                className="inline-flex rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-zinc-900 dark:text-amber-200"
                              >
                                {signal}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-3 text-sm leading-6 text-emerald-700 dark:text-emerald-300">
                            This draft is structured enough to move into review or approval.
                          </p>
                        )}
                        {draftReadinessSignals.length > 0 && (
                          <p className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                            {draftRewriteTargets.length > 0
                              ? `Use Improve Draft to tighten the ${draftRewriteTargets.join(", ")} automatically, then make any final edits inline.`
                              : "Use Improve Draft to sharpen the wording if needed. Approval still needs an owner and resolved notes."}
                          </p>
                        )}
                      </div>

                      <select
                        value={row.issueId ?? ""}
                        onChange={(e) => updateCell(index, "issueId", e.target.value)}
                        className="min-h-[44px] w-full rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                      >
                        <option value="">
                          {loadingIssueOptions ? "Loading issues..." : "No linked issue"}
                        </option>
                        {issueOptions.map((issue) => (
                          <option key={issue.id} value={issue.id}>
                            {issue.issueKey} - {issue.summary}
                          </option>
                        ))}
                      </select>

                      <select
                        value={row.workflowStatus ?? "backlog"}
                        onChange={(e) =>
                          updateCell(index, "workflowStatus", e.target.value)
                        }
                        className="min-h-[44px] w-full rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                      >
                        <option value="backlog">Backlog</option>
                        <option value="todo">To Do</option>
                        <option value="in-progress">In Progress</option>
                        <option value="blocked">Blocked</option>
                        <option value="done">Done</option>
                      </select>

                      <select
                        value={row.priority ?? "medium"}
                        onChange={(e) =>
                          updateCell(index, "priority", e.target.value)
                        }
                        className="min-h-[44px] w-full rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                      >
                        <option value="highest">Highest Priority</option>
                        <option value="high">High Priority</option>
                        <option value="medium">Medium Priority</option>
                        <option value="low">Low Priority</option>
                      </select>

                      <select
                        value={row.executionResult ?? "not-run"}
                        onChange={(e) =>
                          updateCell(index, "executionResult", e.target.value)
                        }
                        className="min-h-[44px] w-full rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                      >
                        <option value="not-run">Not Run</option>
                        <option value="passed">Passed</option>
                        <option value="failed">Failed</option>
                        <option value="blocked">Blocked</option>
                      </select>

                      <select
                        value={row.reviewStatus ?? "draft"}
                        onChange={(e) =>
                          updateCell(index, "reviewStatus", e.target.value)
                        }
                        className="min-h-[44px] w-full rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                      >
                        <option value="draft">Draft</option>
                        <option value="in-review">In Review</option>
                        <option value="approved">Approved</option>
                        <option value="changes-requested">Changes Requested</option>
                      </select>

                      <input
                        type="text"
                        value={row.assignee ?? ""}
                        onChange={(e) =>
                          updateCell(index, "assignee", e.target.value)
                        }
                        placeholder="Assignee"
                        className="min-h-[44px] w-full rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                      />

                      {userOptions.length > 0 ? (
                        <select
                          value={row.reviewOwner ?? ""}
                          onChange={(e) =>
                            updateCell(index, "reviewOwner", e.target.value)
                          }
                          className="min-h-[44px] w-full rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                        >
                          <option value="">No review owner</option>
                          {userOptions.map((user) => (
                            <option key={user.id} value={user.name || user.email}>
                              {user.name} ({user.email})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={row.reviewOwner ?? ""}
                          onChange={(e) =>
                            updateCell(index, "reviewOwner", e.target.value)
                          }
                          placeholder="Review owner"
                          className="min-h-[44px] w-full rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                        />
                      )}

                      <input
                        type="text"
                        value={row.suiteName ?? ""}
                        onChange={(e) =>
                          updateCell(index, "suiteName", e.target.value)
                        }
                        placeholder="Suite / folder"
                        className="min-h-[44px] w-full rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                      />

                      <input
                        type="text"
                        value={row.componentArea ?? ""}
                        onChange={(e) =>
                          updateCell(index, "componentArea", e.target.value)
                        }
                        placeholder="Component / module"
                        className="min-h-[44px] w-full rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                      />

                      <select
                        value={row.testDataSetId ?? ""}
                        onChange={(e) =>
                          updateCell(index, "testDataSetId", e.target.value)
                        }
                        className="min-h-[44px] w-full rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                      >
                        <option value="">No reusable data set</option>
                        {testDataSets.map((set) => (
                          <option key={set.id} value={set.id}>
                            {set.name}
                          </option>
                        ))}
                      </select>

                      <select
                        value={row.automationStatus ?? "manual"}
                        onChange={(e) =>
                          updateCell(index, "automationStatus", e.target.value)
                        }
                        className="min-h-[44px] w-full rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                      >
                        <option value="manual">{automationStatusLabels.manual}</option>
                        <option value="candidate">{automationStatusLabels.candidate}</option>
                        <option value="automated">{automationStatusLabels.automated}</option>
                      </select>

                      <select
                        value={row.automationProvider ?? ""}
                        onChange={(e) =>
                          updateCell(index, "automationProvider", e.target.value)
                        }
                        className="min-h-[44px] w-full rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                      >
                        <option value="">Auto-detect provider</option>
                        {automationProviderOptions.map((provider) => (
                          <option key={provider} value={provider}>
                            {provider}
                          </option>
                        ))}
                      </select>

                      <input
                        type="text"
                        value={row.automationReference ?? ""}
                        onChange={(e) =>
                          updateCell(index, "automationReference", e.target.value)
                        }
                        placeholder="Automation ref / script id"
                        className="min-h-[44px] w-full rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                      />

                      <label className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                        <input
                          type="checkbox"
                          checked={Boolean(row.archived)}
                          onChange={(e) =>
                            updateCell(index, "archived", e.target.checked ? "true" : "false")
                          }
                          className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        Archived
                      </label>

                      <input
                        type="text"
                        value={row.labels?.join(", ") ?? ""}
                        onChange={(e) => updateCell(index, "labels", e.target.value)}
                        placeholder="Labels: smoke, auth, checkout"
                        className="min-h-[44px] w-full rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                      />

                      <div className="rounded-[22px] border border-zinc-200/80 bg-zinc-50/90 p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-950/70">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                              Watchers
                            </p>
                            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                              People following updates on this case
                            </p>
                          </div>
                          <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                            {rowWatchers.length} follower{rowWatchers.length === 1 ? "" : "s"}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => onToggleCaseWatch(row.id)}
                            className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20"
                          >
                            Follow / Unfollow Case
                          </button>
                          {rowWatchers.slice(0, 4).map((watcher) => (
                            <span
                              key={watcher.id}
                              className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                            >
                              {watcher.name || watcher.email || "Watcher"}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-[22px] border border-zinc-200/80 bg-zinc-50/90 p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-950/70">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                              Review Thread
                            </p>
                            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                              Notes from {activeReviewerLabel}
                            </p>
                          </div>
                          <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                            {rowComments.length} note{rowComments.length === 1 ? "" : "s"}
                          </span>
                        </div>

                        {rowComments.length > 0 ? (
                          <div className="mt-3 space-y-2">
                            {rowComments.slice(0, 3).map((comment) => (
                              <div
                                key={comment.id}
                                id={`test-case-comment-${comment.id}`}
                                className={`rounded-2xl border px-3 py-2.5 text-xs text-zinc-700 dark:text-zinc-200 ${
                                  highlightedCommentId === comment.id
                                    ? "border-sky-300 bg-sky-50/90 dark:border-sky-500/40 dark:bg-sky-500/10"
                                    : "border-zinc-200/80 bg-white dark:border-zinc-700 dark:bg-zinc-900"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                                  <span>{comment.authorName || comment.authorEmail || "Reviewer"}</span>
                                  <span>{formatUtcDate(comment.createdAt)}</span>
                                </div>
                                <p className="mt-2 whitespace-pre-wrap leading-5">
                                  {comment.body}
                                </p>
                                {comment.mentions && comment.mentions.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {comment.mentions.map((mention) => (
                                      <span
                                        key={`${comment.id}-${mention.label}`}
                                        className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300"
                                      >
                                        Mention {mention.label}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onToggleCaseCommentResolved(row.id, comment.id)
                                    }
                                    className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                  >
                                    {comment.resolvedAt ? "Reopen" : "Resolve"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onDeleteCaseComment(row.id, comment.id)}
                                    className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                                  >
                                    Delete
                                  </button>
                                  {comment.resolvedAt && (
                                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                                      Resolved by {comment.resolvedBy?.name || comment.resolvedBy?.email || "reviewer"}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-3 rounded-2xl border border-dashed border-zinc-200 px-3 py-3 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                            No review notes yet. Use this thread to request changes, approve readiness, or capture edge-case feedback.
                          </p>
                        )}

                        <textarea
                          value={caseCommentDrafts[row.id] ?? ""}
                          onChange={(event) =>
                            onCaseCommentDraftChange(row.id, event.target.value)
                          }
                          rows={3}
                          placeholder="Add a review note for this case..."
                          className="mt-3 min-h-[90px] w-full resize-y rounded-2xl border border-zinc-200/80 bg-white px-3 py-2.5 text-sm text-zinc-800 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                        />
                        <button
                          type="button"
                          onClick={() => onAddCaseComment(row.id)}
                          className="mt-3 inline-flex min-h-[40px] items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20"
                        >
                          Post Review Note
                        </button>
                      </div>

                      <div className="rounded-[22px] border border-zinc-200/80 bg-zinc-50/90 p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-950/70">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                              Approval Timeline
                            </p>
                            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                              Recent review ownership, note, and approval events
                            </p>
                          </div>
                          <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                            {rowReviewHistory.length} event{rowReviewHistory.length === 1 ? "" : "s"}
                          </span>
                        </div>

                        {rowReviewHistory.length > 0 ? (
                          <div className="mt-3 space-y-2">
                            {rowReviewHistory.slice(0, 4).map((entry) => (
                              <div
                                key={entry.id}
                                className="rounded-2xl border border-zinc-200/80 bg-white px-3 py-2.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                              >
                                <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                                  <span>{entry.actorName || entry.actorEmail || "Reviewer"}</span>
                                  <span>{formatUtcDate(entry.createdAt)}</span>
                                </div>
                                <p className="mt-2 font-semibold text-zinc-800 dark:text-zinc-100">
                                  {entry.action}
                                </p>
                                <p className="mt-1 leading-5 text-zinc-600 dark:text-zinc-400">
                                  {entry.detail}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-3 rounded-2xl border border-dashed border-zinc-200 px-3 py-3 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                            No approval timeline yet. Review ownership and status changes will start showing up here.
                          </p>
                        )}
                      </div>

                      <div className="rounded-[22px] border border-zinc-200/80 bg-zinc-50/90 p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-950/70">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                              Reviewer Attention
                            </p>
                            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                              Notifications aimed at {activeReviewerLabel}
                            </p>
                          </div>
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                              reviewerAttention?.unreadCount
                                ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                                : "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                            }`}
                          >
                            {reviewerAttention?.unreadCount ?? 0} unread
                          </span>
                        </div>

                        {reviewerAttention ? (
                          <div className="mt-3 space-y-3">
                            <div className="flex flex-wrap gap-2">
                              {reviewerAttention.mentionCount > 0 ? (
                                <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                                  {reviewerAttention.mentionCount} mention
                                  {reviewerAttention.mentionCount === 1 ? "" : "s"}
                                </span>
                              ) : null}
                              {reviewerAttention.watchCount > 0 ? (
                                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                                  {reviewerAttention.watchCount} watch alert
                                  {reviewerAttention.watchCount === 1 ? "" : "s"}
                                </span>
                              ) : null}
                            </div>
                            {reviewerAttention.latestNotification ? (
                              <div className="rounded-2xl border border-zinc-200/80 bg-white px-3 py-2.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                                <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                                  <span>
                                    {reviewerAttention.latestNotification.type === "case-mention"
                                      ? "Latest mention"
                                      : "Latest watch alert"}
                                  </span>
                                  <span>
                                    {formatUtcDate(
                                      reviewerAttention.latestNotification.createdAt
                                    )}
                                  </span>
                                </div>
                                <p className="mt-2 font-semibold text-zinc-800 dark:text-zinc-100">
                                  {reviewerAttention.latestNotification.title}
                                </p>
                                <p className="mt-1 leading-5 text-zinc-600 dark:text-zinc-400">
                                  {reviewerAttention.latestNotification.detail}
                                </p>
                                {projectRouteRef ? (
                                  <div className="mt-3">
                                    <Link
                                      href={`/projects/${projectRouteRef}/notifications?rowId=${encodeURIComponent(
                                        row.id
                                      )}${
                                        reviewerAttention.latestNotification.type ===
                                        "case-mention"
                                          ? "&type=case-mention&unread=1"
                                          : "&type=case-watch&unread=1"
                                      }`}
                                      className="inline-flex rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                    >
                                      Open Matching Inbox Slice
                                    </Link>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <p className="mt-3 rounded-2xl border border-dashed border-zinc-200 px-3 py-3 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                            No active reviewer alerts on this case right now.
                          </p>
                        )}
                      </div>

                      <div className="rounded-[22px] border border-zinc-200/80 bg-zinc-50/90 p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-950/70">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                          Reuse & Automation
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => onCloneRow(row.id)}
                            className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          >
                            Clone Case
                          </button>
                          <button
                            type="button"
                            onClick={() => onSaveTemplateFromRow(row)}
                            className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          >
                            Save as Template
                          </button>
                        </div>
                        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                          {caseTemplates.length} saved template{caseTemplates.length === 1 ? "" : "s"} available for reuse.
                        </p>
                        {caseTemplates.some((template) => template.category === "provider-starter") ? (
                          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                            Provider starter templates are pinned near the top of the template list.
                          </p>
                        ) : null}
                        {caseTemplates.some(
                          (template) => template.sourceProjectName?.trim()
                        ) ? (
                          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                            Imported template packs keep their source project visible in the template picker.
                          </p>
                        ) : null}
                        {caseTemplates.some(
                          (template) => template.externalTemplateId?.trim()
                        ) ? (
                          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                            Reusable templates now preserve external ids and pack versions for safer upgrades.
                          </p>
                        ) : null}
                        {row.automationProvider?.trim() ? (
                          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                            This case can seed a {row.automationProvider.trim()}-specific template.
                          </p>
                        ) : null}
                      </div>

                      <div className="rounded-[22px] border border-zinc-200/80 bg-zinc-50/90 p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-950/70">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                              Version History
                            </p>
                            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                              Recent saved edits for this case
                            </p>
                          </div>
                          <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                            {rowVersionHistory.length} entry{rowVersionHistory.length === 1 ? "" : "ies"}
                          </span>
                        </div>

                        {rowVersionHistory.length > 0 ? (
                          <div className="mt-3 space-y-2">
                            {selectedVersions.length === 2 && (
                              <div className="rounded-2xl border border-sky-200 bg-sky-50/80 px-3 py-3 text-xs dark:border-sky-500/20 dark:bg-sky-500/10">
                                <div className="flex items-center justify-between gap-2">
                                  <div>
                                    <p className="font-semibold text-sky-900 dark:text-sky-100">
                                      Version Compare View
                                    </p>
                                    <p className="mt-1 text-[11px] text-sky-800/80 dark:text-sky-200/80">
                                      Comparing {selectedVersions[0]?.reason} and {selectedVersions[1]?.reason}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => clearVersionCompareSelection(row.id)}
                                    className="rounded-2xl border border-sky-200 bg-white px-3 py-2 text-[11px] font-semibold text-sky-800 transition hover:bg-sky-100 dark:border-sky-500/20 dark:bg-zinc-900 dark:text-sky-200 dark:hover:bg-zinc-800"
                                  >
                                    Clear Compare
                                  </button>
                                </div>
                                <div className="mt-3 space-y-2">
                                  {buildVersionComparisons(
                                    selectedVersions[0].rowSnapshot,
                                    selectedVersions[1].rowSnapshot
                                  ).length > 0 ? (
                                    buildVersionComparisons(
                                      selectedVersions[0].rowSnapshot,
                                      selectedVersions[1].rowSnapshot
                                    ).map((field) => (
                                      <div
                                        key={field.label}
                                        className="rounded-2xl border border-sky-200/70 bg-white px-3 py-2 dark:border-sky-500/20 dark:bg-zinc-950"
                                      >
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700 dark:text-sky-300">
                                          {field.label}
                                        </p>
                                        <div className="mt-2 grid gap-2 xl:grid-cols-2">
                                          <div className="rounded-xl border border-zinc-200/80 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                                              Older selection
                                            </p>
                                            <p className="mt-1 whitespace-pre-wrap break-words text-zinc-700 dark:text-zinc-200">
                                              {field.left}
                                            </p>
                                          </div>
                                          <div className="rounded-xl border border-zinc-200/80 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                                              Newer selection
                                            </p>
                                            <p className="mt-1 whitespace-pre-wrap break-words text-zinc-700 dark:text-zinc-200">
                                              {field.right}
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="rounded-2xl border border-dashed border-sky-200 px-3 py-3 text-sky-800/80 dark:border-sky-500/20 dark:text-sky-200/80">
                                      These two saved versions match on the tracked comparison fields.
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                            {rowVersionHistory.slice(0, 4).map((version) => (
                              <div
                                key={version.id}
                                className="rounded-2xl border border-zinc-200/80 bg-white px-3 py-2.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                              >
                                <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                                  <span>{version.actorName || version.actorEmail || "Reviewer"}</span>
                                  <span>{formatUtcDate(version.createdAt)}</span>
                                </div>
                                <p className="mt-2 font-semibold text-zinc-800 dark:text-zinc-100">
                                  {version.reason}
                                </p>
                                <p className="mt-1 line-clamp-2 leading-5 text-zinc-600 dark:text-zinc-400">
                                  {version.rowSnapshot.title || version.rowSnapshot.expectedResult || "Snapshot stored"}
                                </p>
                                <p className="mt-2 rounded-2xl border border-zinc-200/80 bg-zinc-50 px-3 py-2 text-[11px] leading-5 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                                  {summarizeVersionDiff(version.rowSnapshot)}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleVersionCompareSelection(row.id, version.id)
                                    }
                                    className={`rounded-2xl border px-3 py-2 text-[11px] font-semibold transition ${
                                      selectedVersionIds.includes(version.id)
                                        ? "border-sky-300 bg-sky-100 text-sky-900 hover:bg-sky-200 dark:border-sky-400/30 dark:bg-sky-500/20 dark:text-sky-100 dark:hover:bg-sky-500/30"
                                        : "border-sky-200 bg-white text-sky-800 hover:bg-sky-50 dark:border-sky-500/20 dark:bg-zinc-900 dark:text-sky-200 dark:hover:bg-zinc-800"
                                    }`}
                                  >
                                    {selectedVersionIds.includes(version.id)
                                      ? "Selected for Compare"
                                      : "Select to Compare"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onRestoreCaseVersion(row.id, version.id)}
                                    className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20"
                                  >
                                    Restore This Version
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-3 rounded-2xl border border-dashed border-zinc-200 px-3 py-3 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                            No versions captured yet. Once this case changes, a short edit history will appear here.
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="border-b border-zinc-200/80 p-4 dark:border-zinc-800">
                    <textarea
                      className="min-h-[132px] w-full resize-y overflow-auto rounded-2xl border border-zinc-200/80 bg-white px-3 py-3 text-sm leading-6 text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                      rows={3}
                      placeholder="Name the scenario and outcome in one clear line"
                      value={row.title}
                      onChange={(e) =>
                        updateCell(index, "title", e.target.value)
                      }
                    />
                  </td>

                  <td className="border-b border-zinc-200/80 p-4 dark:border-zinc-800">
                    <textarea
                      className="min-h-[132px] w-full resize-y overflow-auto rounded-2xl border border-zinc-200/80 bg-white px-3 py-3 text-sm leading-6 text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                      rows={4}
                      placeholder="List only setup, permissions, or starting data"
                      value={row.preconditions}
                      onChange={(e) =>
                        updateCell(index, "preconditions", e.target.value)
                      }
                    />
                  </td>

                  <td className="border-b border-zinc-200/80 p-4 dark:border-zinc-800">
                    <textarea
                      className="min-h-[132px] w-full resize-y overflow-auto rounded-2xl border border-zinc-200/80 bg-white px-3 py-3 text-sm leading-6 text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                      rows={5}
                      placeholder="Use action-oriented steps separated by semicolons"
                      value={row.steps}
                      onChange={(e) =>
                        updateCell(index, "steps", e.target.value)
                      }
                    />
                  </td>

                  <td className="border-b border-zinc-200/80 p-4 dark:border-zinc-800">
                    <textarea
                      className="min-h-[132px] w-full resize-y overflow-auto rounded-2xl border border-zinc-200/80 bg-white px-3 py-3 text-sm leading-6 text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                      rows={4}
                      placeholder="Describe the final observable outcome"
                      value={row.expectedResult}
                      onChange={(e) =>
                        updateCell(index, "expectedResult", e.target.value)
                      }
                    />
                  </td>

                  <td className="border-b border-zinc-200/80 p-4 dark:border-zinc-800">
                    <textarea
                      className="min-h-[132px] w-full resize-y overflow-auto rounded-2xl border border-zinc-200/80 bg-white px-3 py-3 text-sm leading-6 text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                      rows={4}
                      placeholder="Capture sample values, payloads, or environment setup"
                      value={row.testData ?? ""}
                      onChange={(e) =>
                        updateCell(index, "testData", e.target.value)
                      }
                    />
                  </td>

                  <td className="border-b border-zinc-200/80 p-4 dark:border-zinc-800">
                    <div className="flex min-w-[132px] flex-col gap-2">
                      <button
                        onClick={() => regenerateRow(index)}
                        disabled={loading || isRegenerating || !input.trim()}
                        className="rounded-xl bg-[linear-gradient(135deg,_#d97706_0%,_#f59e0b_100%)] px-3 py-2.5 text-sm font-semibold text-white shadow-[0_16px_30px_-18px_rgba(217,119,6,0.5)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isRegenerating
                          ? "Working..."
                          : draftRewriteTargets.length > 0
                          ? "Improve Weak Draft"
                          : "Refine Draft"}
                      </button>
                      {draftReadinessSignals.length > 0 && (
                        <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                          {draftRewriteTargets.length > 0
                            ? `Targets ${draftRewriteTargets.join(", ")}.`
                            : "Best for wording cleanup before review handoff."}
                        </p>
                      )}
                      {canSendToReview && (
                        <button
                          onClick={() => updateCell(index, "reviewStatus", "in-review")}
                          className="rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 dark:border-emerald-500/30 dark:bg-zinc-950 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                        >
                          Send To Review
                        </button>
                      )}
                      {canSendToReview && (
                        <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                          This draft is ready for reviewer handoff.
                        </p>
                      )}

                      <button
                        onClick={() => deleteRow(index)}
                        className="rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 dark:border-rose-500/30 dark:bg-zinc-950 dark:text-rose-300 dark:hover:bg-rose-500/10"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
