"use client";

import {
  PrimaryToolbar,
  QuickFilters,
  WorkflowShortcutsSection,
  compactBadgeClassName,
} from "./FilterWorkspaceSections";

type Props = {
  filteredRowCount: number;
  onResetCaseFilters: () => void;
  activeCaseQuickFilterCount: number;
  caseSearchQuery: string;
  onCaseSearchQueryChange: (value: string) => void;
  caseAssigneeFilter: string;
  onCaseAssigneeFilterChange: (value: string) => void;
  caseAssigneeOptions: string[];
  caseLinkedFilter: "all" | "linked" | "unlinked";
  onCaseLinkedFilterChange: (value: "all" | "linked" | "unlinked") => void;
  caseReviewHealthFilter: "" | "open-notes" | "history";
  onCaseReviewHealthFilterChange: (value: "" | "open-notes" | "history") => void;
  caseCollaborationFilter: "" | "watching" | "mentioned" | "attention";
  onCaseCollaborationFilterChange: (
    value: "" | "watching" | "mentioned" | "attention"
  ) => void;
  onOpenMyReviewQueue: () => void;
  onApplyFailedLinkedPreset: () => void;
  onApplyReviewQueue: () => void;
  onApplyStrongCandidates: () => void;
  onApplyReleaseBlocking: () => void;
  myReviewAttentionCount: number;
  reviewerAttentionOnlyCount: number;
  mentionedCasesCount: number;
  watchedCasesCount: number;
  casesWithOpenReviewNotesCount: number;
  casesWithReviewHistoryCount: number;
};

export default function CasesFilterToolbar(props: Props) {
  const {
    filteredRowCount,
    onResetCaseFilters,
    activeCaseQuickFilterCount,
    caseSearchQuery,
    onCaseSearchQueryChange,
    caseAssigneeFilter,
    onCaseAssigneeFilterChange,
    caseAssigneeOptions,
    caseLinkedFilter,
    onCaseLinkedFilterChange,
    caseReviewHealthFilter,
    onCaseReviewHealthFilterChange,
    caseCollaborationFilter,
    onCaseCollaborationFilterChange,
    onOpenMyReviewQueue,
    onApplyFailedLinkedPreset,
    onApplyReviewQueue,
    onApplyStrongCandidates,
    onApplyReleaseBlocking,
    myReviewAttentionCount,
    reviewerAttentionOnlyCount,
    mentionedCasesCount,
    watchedCasesCount,
    casesWithOpenReviewNotesCount,
    casesWithReviewHistoryCount,
  } = props;

  return (
    <>
      <PrimaryToolbar
        title="Primary search and quick filters"
        description="Search stays primary here, while only the highest-value case filters remain visible by default."
        actions={
          <>
            <span className={`${compactBadgeClassName} border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200`}>
              {filteredRowCount} visible
            </span>
            <button
              type="button"
              onClick={onResetCaseFilters}
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              Reset filters
            </button>
          </>
        }
      >
        <QuickFilters
          title="Quick filters"
          description="Keep only the highest-value review controls visible by default."
          actions={
            <span className={`${compactBadgeClassName} border border-zinc-200 bg-white px-3 py-1.5 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300`}>
              {activeCaseQuickFilterCount} quick active
            </span>
          }
        >
          <div className="grid gap-3 xl:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
            <input
              type="text"
              value={caseSearchQuery}
              onChange={(event) => onCaseSearchQueryChange(event.target.value)}
              placeholder="Search case id, title, issue key, assignee, labels..."
              className="min-h-[48px] rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-sm text-zinc-800 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
            />
            <select
              value={caseAssigneeFilter}
              onChange={(event) => onCaseAssigneeFilterChange(event.target.value)}
              className="min-h-[48px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
            >
              <option value="">All assignees</option>
              {caseAssigneeOptions.map((assignee) => (
                <option key={assignee} value={assignee}>
                  {assignee}
                </option>
              ))}
            </select>
            <select
              value={caseLinkedFilter}
              onChange={(event) =>
                onCaseLinkedFilterChange(
                  (event.target.value || "all") as "all" | "linked" | "unlinked"
                )
              }
              className="min-h-[48px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
            >
              <option value="all">All linkage</option>
              <option value="linked">Linked cases</option>
              <option value="unlinked">Unlinked cases</option>
            </select>
            <select
              value={caseReviewHealthFilter}
              onChange={(event) =>
                onCaseReviewHealthFilterChange(
                  (event.target.value || "") as "" | "open-notes" | "history"
                )
              }
              className="min-h-[48px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
            >
              <option value="">All review health</option>
              <option value="open-notes">Open review notes</option>
              <option value="history">Has review history</option>
            </select>
            <select
              value={caseCollaborationFilter}
              onChange={(event) =>
                onCaseCollaborationFilterChange(
                  (event.target.value || "") as
                    | ""
                    | "watching"
                    | "mentioned"
                    | "attention"
                )
              }
              className="min-h-[48px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
            >
              <option value="">All collaboration</option>
              <option value="watching">Cases I follow</option>
              <option value="mentioned">Mentioned in notes</option>
              <option value="attention">Reviewer attention only</option>
            </select>
          </div>
        </QuickFilters>
      </PrimaryToolbar>

      <WorkflowShortcutsSection
        title="Review queues and workflow shortcuts"
        description="Open the most common slices here so workflow shortcuts do not crowd search and filtering."
      >
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onOpenMyReviewQueue} className="rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20">
            My Review Queue ({myReviewAttentionCount})
          </button>
          <button type="button" onClick={() => onCaseCollaborationFilterChange("attention")} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20">
            Reviewer attention only ({reviewerAttentionOnlyCount})
          </button>
          <button type="button" onClick={() => onCaseCollaborationFilterChange("mentioned")} className="rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20">
            Mentioned in notes ({mentionedCasesCount})
          </button>
          <button type="button" onClick={() => onCaseCollaborationFilterChange("watching")} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20">
            Cases I follow ({watchedCasesCount})
          </button>
          <button type="button" onClick={onApplyFailedLinkedPreset} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20">
            Failed Linked Cases
          </button>
          <button type="button" onClick={onApplyReviewQueue} className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20">
            Review Queue
          </button>
          <button type="button" onClick={onApplyStrongCandidates} className="rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20">
            Strong Candidates
          </button>
          <button type="button" onClick={onApplyReleaseBlocking} className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20">
            Release Blocking
          </button>
          <button type="button" onClick={() => onCaseReviewHealthFilterChange("open-notes")} className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20">
            Needs review attention ({casesWithOpenReviewNotesCount})
          </button>
          <button type="button" onClick={() => onCaseReviewHealthFilterChange("history")} className="rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20">
            Reviewed cases ({casesWithReviewHistoryCount})
          </button>
        </div>
      </WorkflowShortcutsSection>
    </>
  );
}
