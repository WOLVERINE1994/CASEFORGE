"use client";

import type { CasesSavedView } from "../utils/workspace";
import { compactBadgeClassName, compactEyebrowClassName } from "./FilterWorkspaceSections";

type Props = {
  casesSavedViews: CasesSavedView[];
  orderedCasesSavedViews: CasesSavedView[];
  activeSavedCasesView: CasesSavedView | null;
  editingCasesViewId: string | null;
  editingCasesViewName: string;
  onEditingCasesViewNameChange: (value: string) => void;
  onRenameCasesView: () => void;
  onCancelEditingCasesView: () => void;
  onApplySavedCasesView: (view: CasesSavedView) => void;
  onTogglePinCasesView: (viewId: string) => void;
  onSetDefaultCasesSavedView: (viewId: string) => void;
  onStartEditingCasesView: (viewId: string, name: string) => void;
  onDeleteCasesView: (viewId: string) => void;
};

export default function CasesSavedViewList({
  casesSavedViews,
  orderedCasesSavedViews,
  activeSavedCasesView,
  editingCasesViewId,
  editingCasesViewName,
  onEditingCasesViewNameChange,
  onRenameCasesView,
  onCancelEditingCasesView,
  onApplySavedCasesView,
  onTogglePinCasesView,
  onSetDefaultCasesSavedView,
  onStartEditingCasesView,
  onDeleteCasesView,
}: Props) {
  return (
    <div className="mt-4 rounded-[20px] border border-zinc-200/80 bg-zinc-50/70 p-4 dark:border-zinc-700 dark:bg-zinc-950/70">
      <p className={compactEyebrowClassName}>
        Saved views
      </p>
      {casesSavedViews.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {orderedCasesSavedViews.map((view) => (
            <div
              key={view.id}
            className={`flex min-w-[14rem] max-w-full flex-wrap items-center gap-2 rounded-2xl border px-3 py-2 text-sm ${
                activeSavedCasesView?.id === view.id
                  ? "border-violet-300 bg-violet-50 dark:border-violet-500/30 dark:bg-violet-500/10"
                  : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
              }`}
            >
              {editingCasesViewId === view.id ? (
                <>
                  <input
                    type="text"
                    value={editingCasesViewName}
                    onChange={(event) => onEditingCasesViewNameChange(event.target.value)}
                    className="min-h-[34px] min-w-[180px] rounded-xl border border-zinc-200/80 bg-white px-3 py-1.5 text-sm text-zinc-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  />
                  <button
                    type="button"
                    onClick={onRenameCasesView}
                    className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={onCancelEditingCasesView}
                    className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onApplySavedCasesView(view)}
                    className="font-semibold text-zinc-800 transition hover:text-emerald-700 dark:text-zinc-100 dark:hover:text-emerald-300"
                  >
                    {view.name}
                  </button>
                  {view.pinned ? (
                    <span className={`${compactBadgeClassName} border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300`}>
                      Pinned
                    </span>
                  ) : null}
                  {activeSavedCasesView?.id === view.id ? (
                    <span className={`${compactBadgeClassName} border border-violet-200 bg-violet-100 px-2 py-0.5 text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/20 dark:text-violet-200`}>
                      Active
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onTogglePinCasesView(view.id)}
                    className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
                  >
                    {view.pinned ? "Unpin" : "Pin"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetDefaultCasesSavedView(view.id)}
                    className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                  >
                    Default
                  </button>
                  <button
                    type="button"
                    onClick={() => onStartEditingCasesView(view.id, view.name)}
                    className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteCasesView(view.id)}
                    className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-2xl border border-dashed border-zinc-200 px-3 py-3 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          No custom case views saved yet. Save the current slice once you have a workflow worth reusing.
        </p>
      )}
    </div>
  );
}
