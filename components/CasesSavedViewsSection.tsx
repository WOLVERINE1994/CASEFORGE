"use client";

import {
  CollapsibleSecondarySection,
  SavedViewsSection,
} from "./FilterWorkspaceSections";
import CasesSavedViewList from "./CasesSavedViewList";
import { compactBadgeClassName } from "./FilterWorkspaceSections";
import type { CasesSavedView } from "../utils/workspace";

type Props = {
  newCasesViewName: string;
  onNewCasesViewNameChange: (value: string) => void;
  onSaveCurrentCasesView: () => void;
  onApplyDefaultView: () => void;
  onSetCurrentAsDefault: () => void;
  activePresetLabel: string;
  defaultPresetLabel: string;
  defaultSavedViewName: string | null;
  activeSavedViewName: string | null;
  providerFocusedCandidateViews: Array<{ provider: string }>;
  onSaveMyReviewQueue: () => void;
  onSetMyReviewQueueAsDefault: () => void;
  onSaveStrongCandidates: () => void;
  onSetStrongCandidatesAsDefault: () => void;
  onSaveSecurityHighRisk: () => void;
  onSaveAccessibilityReviewQueue: () => void;
  onSaveProviderCandidates: (provider: string) => void;
  onSetProviderCandidatesAsDefault: (provider: string) => void;
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

export default function CasesSavedViewsSection({
  newCasesViewName,
  onNewCasesViewNameChange,
  onSaveCurrentCasesView,
  onApplyDefaultView,
  onSetCurrentAsDefault,
  activePresetLabel,
  defaultPresetLabel,
  defaultSavedViewName,
  activeSavedViewName,
  providerFocusedCandidateViews,
  onSaveMyReviewQueue,
  onSetMyReviewQueueAsDefault,
  onSaveStrongCandidates,
  onSetStrongCandidatesAsDefault,
  onSaveSecurityHighRisk,
  onSaveAccessibilityReviewQueue,
  onSaveProviderCandidates,
  onSetProviderCandidatesAsDefault,
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
    <SavedViewsSection
      title="Saved views and presets"
      description="Preset status and saved-view management now sit in their own lighter section."
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="rounded-[20px] border border-zinc-200/80 bg-zinc-50/70 p-4 dark:border-zinc-700 dark:bg-zinc-950/70">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <input
              type="text"
              value={newCasesViewName}
              onChange={(event) => onNewCasesViewNameChange(event.target.value)}
              placeholder="Save current case view as..."
              className="min-h-[44px] flex-1 rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
            />
            <button
              type="button"
              onClick={onSaveCurrentCasesView}
              className="rounded-2xl bg-[linear-gradient(135deg,_#1d4ed8_0%,_#0f766e_100%)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
            >
              Save View
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onApplyDefaultView}
              className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Default View
            </button>
            <button
              type="button"
              onClick={onSetCurrentAsDefault}
              className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
            >
              Set Current As Default
            </button>
          </div>
        </div>
        <div className="rounded-[20px] border border-zinc-200/80 bg-zinc-50/70 p-4 dark:border-zinc-700 dark:bg-zinc-950/70">
          <div className="flex flex-wrap gap-2">
            <span className={`${compactBadgeClassName} border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300`}>
              Active preset: {activePresetLabel}
            </span>
            <span className={`${compactBadgeClassName} border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300`}>
              Default preset: {defaultPresetLabel}
            </span>
            {defaultSavedViewName ? (
              <span className={`${compactBadgeClassName} border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300`}>
                Default saved view: {defaultSavedViewName}
              </span>
            ) : null}
            {activeSavedViewName ? (
              <span className={`${compactBadgeClassName} border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300`}>
                Active saved view: {activeSavedViewName}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <CollapsibleSecondarySection
        className="mt-4"
        eyebrow="Saved View Actions"
        title="Reusable view actions"
        description="Common named-view shortcuts stay available, but they only expand when you are actively managing them."
        summary={
          <span className={`${compactBadgeClassName} border border-zinc-200 bg-white px-3 py-1.5 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300`}>
            {4 + providerFocusedCandidateViews.length + (providerFocusedCandidateViews[0] ? 1 : 0)} shortcuts
          </span>
        }
      >
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onSaveMyReviewQueue} className="rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20">
            Save My Review Queue
          </button>
          <button type="button" onClick={onSetMyReviewQueueAsDefault} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20">
            Set My Review Queue As Default
          </button>
          <button type="button" onClick={onSaveStrongCandidates} className="rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20">
            Save Strong Candidates
          </button>
          <button type="button" onClick={onSetStrongCandidatesAsDefault} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20">
            Set Strong Candidates As Default
          </button>
          <button type="button" onClick={onSaveSecurityHighRisk} className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20">
            Save Security High Risk
          </button>
          <button type="button" onClick={onSaveAccessibilityReviewQueue} className="rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20">
            Save Accessibility Review Queue
          </button>
          {providerFocusedCandidateViews.map((entry) => (
            <button
              key={`save-provider-${entry.provider}`}
              type="button"
              onClick={() => onSaveProviderCandidates(entry.provider)}
              className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-100 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-300 dark:hover:bg-cyan-500/20"
            >
              Save {entry.provider} Candidates
            </button>
          ))}
          {providerFocusedCandidateViews[0] ? (
            <button
              type="button"
              onClick={() =>
                onSetProviderCandidatesAsDefault(providerFocusedCandidateViews[0].provider)
              }
              className="rounded-full border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-700 transition hover:bg-teal-100 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-300 dark:hover:bg-teal-500/20"
            >
              Set {providerFocusedCandidateViews[0].provider} Candidates As Default
            </button>
          ) : null}
        </div>
      </CollapsibleSecondarySection>

      <CasesSavedViewList
        casesSavedViews={casesSavedViews}
        orderedCasesSavedViews={orderedCasesSavedViews}
        activeSavedCasesView={activeSavedCasesView}
        editingCasesViewId={editingCasesViewId}
        editingCasesViewName={editingCasesViewName}
        onEditingCasesViewNameChange={onEditingCasesViewNameChange}
        onRenameCasesView={onRenameCasesView}
        onCancelEditingCasesView={onCancelEditingCasesView}
        onApplySavedCasesView={onApplySavedCasesView}
        onTogglePinCasesView={onTogglePinCasesView}
        onSetDefaultCasesSavedView={onSetDefaultCasesSavedView}
        onStartEditingCasesView={onStartEditingCasesView}
        onDeleteCasesView={onDeleteCasesView}
      />
    </SavedViewsSection>
  );
}
