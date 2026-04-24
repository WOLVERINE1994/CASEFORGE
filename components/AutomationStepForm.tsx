"use client";

import { useMemo } from "react";
import type { AutomationStepTemplateId } from "../utils/automation-step-templates";
import type {
  AutomationAction,
  AutomationProvider,
  AutomationReusableBlock,
  AutomationSelectorPreset,
  AutomationStep,
  AutomationStepResult,
  AutomationValidationIssue,
} from "../utils/workspace";

type Props = {
  steps: AutomationStep[];
  selectedStepId: string | null;
  onSelectStep: (stepId: string) => void;
  onChange: (steps: AutomationStep[]) => void;
  onAddStep: () => void;
  onDeleteStep: (stepId: string) => void;
  onMoveStep: (stepId: string, direction: "up" | "down") => void;
  onInsertTemplate: (templateId: AutomationStepTemplateId) => void;
  onInsertSharedBlock: (blockId: string) => void;
  onInsertAction?: (actionId: string) => void;
  actions?: AutomationAction[];
  reusableBlocks?: AutomationReusableBlock[];
  selectorPresets?: AutomationSelectorPreset[];
  provider?: AutomationProvider;
  validationIssues?: AutomationValidationIssue[];
  stepResults?: AutomationStepResult[];
  assistantSuggestions?: Array<{
    id: string;
    title: string;
    description: string;
    tone: "sky" | "amber" | "emerald";
    applyLabel?: string;
    onApply?: () => void;
  }>;
  onFixStep?: () => void;
  onImproveAutomation?: () => void;
  onGenerateFromCase?: () => void;
};

type StepActionOption = {
  value: AutomationStep["action"];
  label: string;
  targetType?: AutomationStep["targetType"];
  targetLabel: string;
  valueLabel?: string;
  expectedLabel?: string;
};

const STEP_ACTIONS: StepActionOption[] = [
  {
    value: "goto",
    label: "Navigate",
    targetType: "url",
    targetLabel: "URL or route",
  },
  {
    value: "click",
    label: "Click",
    targetType: "selector",
    targetLabel: "Selector or element",
  },
  {
    value: "fill",
    label: "Fill",
    targetType: "selector",
    targetLabel: "Selector or field",
    valueLabel: "Value to enter",
  },
  {
    value: "select",
    label: "Select Option",
    targetType: "selector",
    targetLabel: "Selector or dropdown",
    valueLabel: "Option value",
  },
  {
    value: "wait-for",
    label: "Wait",
    targetType: "selector",
    targetLabel: "Selector or URL",
  },
  {
    value: "assert-visible",
    label: "Assert Visible",
    targetType: "selector",
    targetLabel: "Selector or element",
    expectedLabel: "Expected state",
  },
  {
    value: "assert-text",
    label: "Assert Text",
    targetType: "selector",
    targetLabel: "Selector or element",
    expectedLabel: "Expected text",
  },
  {
    value: "assert-url",
    label: "Assert URL",
    targetType: "url",
    targetLabel: "Current URL",
    expectedLabel: "Expected URL fragment",
  },
  {
    value: "assert-value",
    label: "Assert Value",
    targetType: "selector",
    targetLabel: "Selector or field",
    expectedLabel: "Expected value",
  },
  {
    value: "press",
    label: "Press Key",
    targetType: "key",
    targetLabel: "Selector or target",
    valueLabel: "Key to press",
  },
  {
    value: "run-block",
    label: "Run Action",
    targetType: "shared-block",
    targetLabel: "Action",
  },
];

const fieldBaseClassName =
  "min-h-[44px] w-full rounded-2xl border bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition dark:bg-zinc-950 dark:text-zinc-100";

const resolveFieldClassName = (hasError: boolean) =>
  `${fieldBaseClassName} ${
    hasError
      ? "border-rose-300 focus:border-rose-400 focus:ring-4 focus:ring-rose-100 dark:border-rose-500/50 dark:focus:border-rose-500 dark:focus:ring-rose-500/10"
      : "border-zinc-200/80 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
  }`;

const resultPriority: Record<AutomationStepResult["status"], number> = {
  failed: 5,
  running: 4,
  blocked: 3,
  passed: 2,
  pending: 1,
  skipped: 0,
};

const getActionOption = (action: AutomationStep["action"]) =>
  STEP_ACTIONS.find((option) => option.value === action) ?? STEP_ACTIONS[0];

const getStepDescription = (step: AutomationStep) =>
  typeof step.metaJson?.description === "string" ? step.metaJson.description : "";

const getStepExpectedResult = (step: AutomationStep) =>
  typeof step.metaJson?.expectedResult === "string" ? step.metaJson.expectedResult : "";

const getMetaTextValue = (step: AutomationStep, key: string) =>
  typeof step.metaJson?.[key] === "string" ? (step.metaJson[key] as string) : "";

const getActionCallMeta = (step: AutomationStep) => {
  const value = step.metaJson?.actionCall;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as {
    actionId?: string;
    actionName?: string;
    parameterBindings?: Record<string, string>;
  };
};

const updateMetaValue = (
  step: AutomationStep,
  key: string,
  value: string | undefined
): AutomationStep => {
  const nextMeta = { ...(step.metaJson ?? {}) };
  if (value && value.trim()) {
    nextMeta[key] = value;
  } else {
    delete nextMeta[key];
  }

  return {
    ...step,
    metaJson: Object.keys(nextMeta).length > 0 ? nextMeta : undefined,
  };
};

const aggregateStepResult = (results: AutomationStepResult[]) => {
  const primary = [...results].sort(
    (left, right) =>
      resultPriority[right.status] - resultPriority[left.status] ||
      right.stepIndex - left.stepIndex
  )[0];

  if (!primary) {
    return null;
  }

  if (results.length === 1) {
    return {
      ...primary,
      detail: primary.failureReason || primary.message,
      nestedCount: 1,
    };
  }

  const passedCount = results.filter((result) => result.status === "passed").length;
  const failedCount = results.filter((result) => result.status === "failed").length;
  const runningCount = results.filter((result) => result.status === "running").length;

  return {
    ...primary,
    detail:
      failedCount > 0
        ? `${failedCount} nested step${failedCount === 1 ? "" : "s"} failed.`
        : runningCount > 0
          ? `${runningCount} nested step${runningCount === 1 ? "" : "s"} running.`
          : `${passedCount} nested step${passedCount === 1 ? "" : "s"} passed.`,
    nestedCount: results.length,
  };
};

export default function AutomationStepForm({
  steps,
  selectedStepId,
  onSelectStep,
  onChange,
  onAddStep,
  onDeleteStep,
  onMoveStep,
  onInsertTemplate,
  onInsertSharedBlock,
  onInsertAction,
  actions = [],
  reusableBlocks = [],
  selectorPresets = [],
  provider = "playwright",
  validationIssues = [],
  stepResults = [],
  assistantSuggestions = [],
  onFixStep,
  onImproveAutomation,
  onGenerateFromCase,
}: Props) {
  const selectedStep =
    (selectedStepId ? steps.find((step) => step.id === selectedStepId) : null) ?? steps[0] ?? null;
  const selectedIndex = selectedStep ? steps.findIndex((step) => step.id === selectedStep.id) : -1;
  const selectedAction = selectedStep ? getActionOption(selectedStep.action) : STEP_ACTIONS[0];
  const actionOptions = useMemo(
    () =>
      actions.map((action) => ({
        ...action,
        blockId: action.backingBlockId ?? action.id,
      })),
    [actions]
  );
  const actionByReference = useMemo(() => {
    const entries = actionOptions.flatMap((action) => [
      [action.id, action] as const,
      [action.blockId, action] as const,
    ]);
    return new Map(entries);
  }, [actionOptions]);
  const selectorPresetOptions = useMemo(
    () => selectorPresets.map((preset) => ({ id: preset.id, name: preset.name })),
    [selectorPresets]
  );
  const validationIssuesByStepId = useMemo(() => {
    const grouped = new Map<string, AutomationValidationIssue[]>();
    validationIssues.forEach((issue) => {
      if (!issue.stepId) {
        return;
      }
      const existing = grouped.get(issue.stepId) ?? [];
      existing.push(issue);
      grouped.set(issue.stepId, existing);
    });
    return grouped;
  }, [validationIssues]);
  const stepResultsBySourceStepId = useMemo(() => {
    const grouped = new Map<string, AutomationStepResult[]>();
    stepResults.forEach((result) => {
      const key = result.sourceStepId ?? result.stepId;
      const existing = grouped.get(key) ?? [];
      existing.push(result);
      grouped.set(key, existing);
    });
    return grouped;
  }, [stepResults]);

  const getFieldIssues = (stepId: string, fields: AutomationValidationIssue["field"][]) =>
    (validationIssuesByStepId.get(stepId) ?? []).filter((issue) => fields.includes(issue.field));

  const selectedActionCallMeta = selectedStep ? getActionCallMeta(selectedStep) : null;
  const selectedBoundAction =
    selectedStep?.action === "run-block"
      ? actionByReference.get(
          selectedActionCallMeta?.actionId ??
            selectedStep.sharedBlockId ??
            selectedStep.targetValue ??
            ""
        ) ?? null
      : null;
  const selectedParameterBindings = selectedActionCallMeta?.parameterBindings ?? {};

  const renderIssueMessages = (issues: AutomationValidationIssue[]) =>
    issues.length > 0 ? (
      <div className="mt-2 space-y-1">
        {issues.map((issue) => (
          <p
            key={`${issue.code}-${issue.message}`}
            className="text-xs leading-5 text-rose-600 dark:text-rose-300"
          >
            {issue.message}
          </p>
        ))}
      </div>
    ) : null;

  const updateStepAt = (index: number, updater: (step: AutomationStep) => AutomationStep) => {
    onChange(steps.map((step, stepIndex) => (stepIndex === index ? updater(step) : step)));
  };

  const updateActionCallSelection = (referenceId: string) => {
    if (!selectedStep || selectedIndex < 0) {
      return;
    }

    const action = actionByReference.get(referenceId) ?? null;
    updateStepAt(selectedIndex, (step) => {
      const nextMeta = { ...(step.metaJson ?? {}) };
      nextMeta.actionCall = {
        actionId: action?.id ?? referenceId,
        actionName: action?.name ?? action?.description ?? referenceId,
        parameterBindings:
          getActionCallMeta(step)?.parameterBindings ?? {},
      };

      return {
        ...step,
        action: "run-block",
        targetType: "shared-block",
        sharedBlockId: (action?.blockId ?? referenceId) || undefined,
        targetValue: action?.blockId ?? referenceId,
        metaJson: nextMeta,
      };
    });
  };

  const updateActionParameterBinding = (parameterName: string, value: string) => {
    if (!selectedStep || selectedIndex < 0) {
      return;
    }

    updateStepAt(selectedIndex, (step) => {
      const nextMeta = { ...(step.metaJson ?? {}) };
      const actionCall = {
        ...(getActionCallMeta(step) ?? {}),
        actionId:
          getActionCallMeta(step)?.actionId ??
          selectedBoundAction?.id ??
          step.sharedBlockId ??
          step.targetValue,
        actionName:
          getActionCallMeta(step)?.actionName ?? selectedBoundAction?.name,
        parameterBindings: {
          ...(getActionCallMeta(step)?.parameterBindings ?? {}),
          [parameterName]: value,
        },
      };

      if (!value.trim()) {
        delete actionCall.parameterBindings[parameterName];
      }

      nextMeta.actionCall = actionCall;
      return {
        ...step,
        metaJson: nextMeta,
      };
    });
  };

  const setAction = (action: AutomationStep["action"]) => {
    if (!selectedStep || selectedIndex < 0) {
      return;
    }

    updateStepAt(selectedIndex, (step) => {
      const option = getActionOption(action);
      const nextStep: AutomationStep = {
        ...step,
        action,
        targetType: step.targetType ?? option.targetType,
      };
      if (action === "run-block") {
        nextStep.targetType = "shared-block";
        nextStep.sharedBlockId = step.sharedBlockId ?? step.targetValue ?? "";
        nextStep.metaJson = {
          ...(step.metaJson ?? {}),
          actionCall: getActionCallMeta(step) ?? {
            actionId: step.sharedBlockId ?? step.targetValue ?? "",
            actionName: "",
            parameterBindings: {},
          },
        };
      }
      if (action === "goto" && !nextStep.targetType) {
        nextStep.targetType = "url";
      }
      return nextStep;
    });
  };

  if (!selectedStep || selectedIndex < 0) {
    return (
      <div className="flex h-full min-h-[340px] flex-col items-center justify-center rounded-[28px] border border-dashed border-zinc-200 bg-white/80 px-6 py-10 text-center dark:border-zinc-700 dark:bg-zinc-950/80">
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
          No step selected
        </p>
        <p className="mt-2 max-w-xs text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          Add a step or pick one from the step list to edit action-specific details.
        </p>
        <button
          type="button"
          onClick={onAddStep}
          className="mt-4 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Add Step
        </button>
      </div>
    );
  }

  const selectedStepIssues = validationIssuesByStepId.get(selectedStep.id) ?? [];
  const selectedStepResults = stepResultsBySourceStepId.get(selectedStep.id) ?? [];
  const selectedStepResult = aggregateStepResult(selectedStepResults);

  return (
    <div className="flex h-full min-h-[340px] min-w-0 flex-col overflow-hidden rounded-[28px] border border-zinc-200/80 bg-white/92 dark:border-zinc-700 dark:bg-zinc-950/88">
      <div className="flex flex-col gap-4 border-b border-zinc-200/80 px-5 py-4 dark:border-zinc-800 2xl:flex-row 2xl:items-start 2xl:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
            Step Editor
          </p>
          <p className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            Step {selectedIndex + 1}: {selectedAction.label}
          </p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Edit dynamic fields for the selected automation step.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:flex 2xl:flex-wrap">
          <select
            defaultValue=""
            onChange={(event) => {
              if (!event.target.value) {
                return;
              }
              onInsertTemplate(event.target.value as AutomationStepTemplateId);
              event.target.value = "";
            }}
            className="min-h-[40px] rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            <option value="">Insert template</option>
            <option value="login-flow">Login Flow</option>
            <option value="create-record">Create Record</option>
            <option value="search">Search</option>
            <option value="submit-form">Submit Form</option>
            <option value="validate-message">Validate Message</option>
          </select>
          <select
            defaultValue=""
            onChange={(event) => {
              if (!event.target.value) {
                return;
              }
              if (actions.length > 0) {
                (onInsertAction ?? onInsertSharedBlock)(event.target.value);
              } else {
                onInsertSharedBlock(event.target.value);
              }
              event.target.value = "";
            }}
            className="min-h-[40px] rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            <option value="">
              {actions.length > 0 ? "Insert action" : "Insert shared block"}
            </option>
            {(actions.length > 0
              ? actionOptions.map((action) => ({
                  id: action.id,
                  label: action.name,
                }))
              : reusableBlocks.map((block) => ({
                  id: block.id,
                  label: block.name,
                }))
            ).map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onAddStep}
            className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Add Step
          </button>
          <button
            type="button"
            onClick={() => onMoveStep(selectedStep.id, "up")}
            disabled={selectedIndex <= 0}
            className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Move Up
          </button>
          <button
            type="button"
            onClick={() => onMoveStep(selectedStep.id, "down")}
            disabled={selectedIndex >= steps.length - 1}
            className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Move Down
          </button>
          <button
            type="button"
            onClick={() => onDeleteStep(selectedStep.id)}
            className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-5 py-5">
        {selectedStepIssues.length > 0 ? (
          <div className="rounded-[22px] border border-rose-200 bg-rose-50/80 px-4 py-3 dark:border-rose-500/30 dark:bg-rose-500/10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-700 dark:text-rose-200">
              Inline Validation
            </p>
            {renderIssueMessages(selectedStepIssues)}
          </div>
        ) : null}

        {selectedStepResult ? (
          <div
            className={`mt-4 rounded-[22px] border px-4 py-3 ${
              selectedStepResult.status === "passed"
                ? "border-emerald-200 bg-emerald-50/80 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                : selectedStepResult.status === "running"
                  ? "border-amber-200 bg-amber-50/80 dark:border-amber-500/30 dark:bg-amber-500/10"
                  : "border-rose-200 bg-rose-50/80 dark:border-rose-500/30 dark:bg-rose-500/10"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-700 dark:text-zinc-100">
                Step Result
              </p>
              <span className="rounded-full border border-current/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
                {selectedStepResult.status}
              </span>
            </div>
            {selectedStepResult.detail ? (
              <p className="mt-2 text-xs leading-5 text-zinc-700 dark:text-zinc-200">
                {selectedStepResult.detail}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <label className="min-w-0">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
              Action Type
            </span>
            <select
              value={selectedStep.action}
              onChange={(event) => setAction(event.target.value as AutomationStep["action"])}
              className={resolveFieldClassName(
                getFieldIssues(selectedStep.id, ["action"]).length > 0
              )}
            >
              {STEP_ACTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {renderIssueMessages(getFieldIssues(selectedStep.id, ["action"]))}
          </label>

          <label className="min-w-0">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
              Target Mode
            </span>
            <select
              value={selectedStep.targetType ?? selectedAction.targetType ?? ""}
              onChange={(event) =>
                updateStepAt(selectedIndex, (step) => ({
                  ...step,
                  targetType: (event.target.value || undefined) as AutomationStep["targetType"],
                }))
              }
              className={resolveFieldClassName(
                getFieldIssues(selectedStep.id, ["targetType"]).length > 0
              )}
            >
              <option value="">Choose target mode</option>
              <option value="selector">Selector</option>
              <option value="selector-preset">Logical element preset</option>
              <option value="url">URL</option>
              <option value="route">Route preset</option>
              <option value="text">Text</option>
              <option value="value">Value</option>
              <option value="key">Key</option>
              <option value="endpoint">Endpoint</option>
              <option value="shared-block">Action</option>
            </select>
            {renderIssueMessages(getFieldIssues(selectedStep.id, ["targetType"]))}
          </label>

          {selectedStep.action === "run-block" ? (
            <label className="min-w-0 lg:col-span-2">
              <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                Automation Action
              </span>
              <select
                value={
                  selectedBoundAction?.id ??
                  selectedStep.sharedBlockId ??
                  selectedStep.targetValue ??
                  ""
                }
                onChange={(event) => updateActionCallSelection(event.target.value)}
                className={resolveFieldClassName(
                  getFieldIssues(selectedStep.id, ["sharedBlockId", "targetValue"]).length > 0
                )}
              >
                <option value="">
                  {actions.length > 0 ? "Choose an action" : "Choose a shared block"}
                </option>
                {(actions.length > 0
                  ? actionOptions.map((action) => ({
                      id: action.id,
                      label: action.name,
                    }))
                  : reusableBlocks.map((block) => ({
                      id: block.id,
                      label: block.name,
                    }))
                ).map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
              {renderIssueMessages(
                getFieldIssues(selectedStep.id, ["sharedBlockId", "targetValue"])
              )}
            </label>
          ) : (
            <label className="min-w-0 lg:col-span-2">
              <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                {selectedAction.targetLabel}
              </span>
              {selectedStep.targetType === "selector-preset" ? (
                <>
                  <select
                    value={selectedStep.selectorPresetId ?? selectedStep.targetValue ?? ""}
                    onChange={(event) =>
                      updateStepAt(selectedIndex, (step) => ({
                        ...step,
                        selectorPresetId: event.target.value || undefined,
                        targetValue: event.target.value,
                      }))
                    }
                    className={resolveFieldClassName(
                      getFieldIssues(selectedStep.id, ["selectorPresetId", "targetValue"])
                        .length > 0
                    )}
                  >
                    <option value="">Choose a logical element preset</option>
                    {selectorPresetOptions.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name}
                      </option>
                    ))}
                  </select>
                  {renderIssueMessages(
                    getFieldIssues(selectedStep.id, ["selectorPresetId", "targetValue"])
                  )}
                </>
              ) : (
                <input
                  type="text"
                  value={selectedStep.targetValue ?? ""}
                  onChange={(event) =>
                    updateStepAt(selectedIndex, (step) => ({
                      ...step,
                      targetValue: event.target.value,
                    }))
                  }
                  placeholder={
                    selectedStep.targetType === "route"
                      ? provider === "api"
                        ? "e.g. /v1/session"
                        : "e.g. login or dashboard"
                      : `Enter ${selectedAction.targetLabel.toLowerCase()}`
                  }
                  className={`${resolveFieldClassName(
                    getFieldIssues(selectedStep.id, ["targetValue"]).length > 0
                  )} placeholder:text-zinc-400`}
                />
              )}
              {selectedStep.targetType !== "selector-preset"
                ? renderIssueMessages(getFieldIssues(selectedStep.id, ["targetValue"]))
                : null}
            </label>
          )}

          {selectedStep.action === "run-block" && selectedBoundAction?.parameters?.length ? (
            <div className="min-w-0 lg:col-span-2">
              <div className="rounded-[22px] border border-zinc-200/80 bg-zinc-50/70 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                      Action Inputs
                    </p>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                      Map scenario variables or literal values into reusable action parameters.
                    </p>
                  </div>
                  <span className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                    {selectedBoundAction.parameters.length} parameter(s)
                  </span>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {selectedBoundAction.parameters.map((parameter) => (
                    <label key={parameter.id} className="min-w-0">
                      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                        {parameter.name}
                        {parameter.required ? " *" : ""}
                      </span>
                      <input
                        type="text"
                        value={selectedParameterBindings[parameter.name] ?? parameter.defaultValue ?? ""}
                        onChange={(event) =>
                          updateActionParameterBinding(parameter.name, event.target.value)
                        }
                        placeholder={
                          parameter.defaultValue?.trim()
                            ? parameter.defaultValue
                            : `e.g. {{${parameter.name}}}`
                        }
                        className={`${resolveFieldClassName(false)} placeholder:text-zinc-400`}
                      />
                      {parameter.description ? (
                        <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                          {parameter.description}
                        </p>
                      ) : null}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {selectedAction.valueLabel ? (
            <label className="min-w-0">
              <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                {selectedAction.valueLabel}
              </span>
              <input
                type="text"
                value={selectedStep.inputValue ?? ""}
                onChange={(event) =>
                  updateStepAt(selectedIndex, (step) => ({
                    ...step,
                    inputValue: event.target.value,
                  }))
                }
                placeholder={`Enter ${selectedAction.valueLabel.toLowerCase()}`}
                className={`${resolveFieldClassName(
                  getFieldIssues(selectedStep.id, ["inputValue"]).length > 0
                )} placeholder:text-zinc-400`}
              />
              {renderIssueMessages(getFieldIssues(selectedStep.id, ["inputValue"]))}
            </label>
          ) : null}

          {selectedAction.expectedLabel ? (
            <label className="min-w-0">
              <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                Expected Result
              </span>
              <input
                type="text"
                value={
                  selectedStep.action === "assert-visible" && !selectedStep.expectedValue
                    ? "Element is visible"
                    : selectedStep.expectedValue ?? ""
                }
                onChange={(event) =>
                  updateStepAt(selectedIndex, (step) => ({
                    ...step,
                    expectedValue: event.target.value,
                  }))
                }
                placeholder={selectedAction.expectedLabel}
                className={`${resolveFieldClassName(
                  getFieldIssues(selectedStep.id, ["expectedValue"]).length > 0
                )} placeholder:text-zinc-400`}
              />
              {renderIssueMessages(getFieldIssues(selectedStep.id, ["expectedValue"]))}
            </label>
          ) : null}

          {!selectedAction.expectedLabel ? (
            <label className="min-w-0">
              <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                Expected Result
              </span>
              <input
                type="text"
                value={getStepExpectedResult(selectedStep)}
                onChange={(event) =>
                  updateStepAt(selectedIndex, (step) =>
                    updateMetaValue(step, "expectedResult", event.target.value)
                  )
                }
                placeholder="Describe the intended visible or logical outcome"
                className={`${resolveFieldClassName(false)} placeholder:text-zinc-400`}
              />
            </label>
          ) : null}

          <label className="min-w-0">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
              Timeout (ms)
            </span>
            <input
              type="number"
              min={0}
              value={selectedStep.timeoutMs ?? 5000}
              onChange={(event) =>
                updateStepAt(selectedIndex, (step) => ({
                  ...step,
                  timeoutMs: Number(event.target.value) || 0,
                }))
              }
              className={resolveFieldClassName(
                getFieldIssues(selectedStep.id, ["timeoutMs"]).length > 0
              )}
            />
            {renderIssueMessages(getFieldIssues(selectedStep.id, ["timeoutMs"]))}
          </label>

          <label className="min-w-0 lg:col-span-2">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
              Optional Description
            </span>
            <textarea
              rows={4}
              value={getStepDescription(selectedStep)}
              onChange={(event) =>
                updateStepAt(selectedIndex, (step) =>
                  updateMetaValue(step, "description", event.target.value)
                )
              }
              placeholder="Explain what this step is trying to verify or why it exists"
              className={`${resolveFieldClassName(false)} min-h-[112px] resize-y py-2.5 placeholder:text-zinc-400`}
            />
          </label>

          {selectedStep.action !== "run-block" &&
          (selectedStep.targetType === "selector" ||
            selectedStep.targetType === "selector-preset" ||
            selectedStep.targetType === "text") ? (
            <label className="min-w-0 lg:col-span-2">
              <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                Selector Settings
              </span>
              <textarea
                rows={3}
                value={getMetaTextValue(selectedStep, "selectorNotes")}
                onChange={(event) =>
                  updateStepAt(selectedIndex, (step) =>
                    updateMetaValue(step, "selectorNotes", event.target.value)
                  )
                }
                placeholder="Document selector strategy, fallback locators, or element stability notes"
                className={`${resolveFieldClassName(false)} min-h-[96px] resize-y py-2.5 placeholder:text-zinc-400`}
              />
            </label>
          ) : null}

          {selectedStep.action.startsWith("assert") ? (
            <label className="min-w-0 lg:col-span-2">
              <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                Assertion Notes
              </span>
              <textarea
                rows={3}
                value={getMetaTextValue(selectedStep, "assertionNotes")}
                onChange={(event) =>
                  updateStepAt(selectedIndex, (step) =>
                    updateMetaValue(step, "assertionNotes", event.target.value)
                  )
                }
                placeholder="Capture assertion intent, tolerance, or visible business rule context"
                className={`${resolveFieldClassName(false)} min-h-[96px] resize-y py-2.5 placeholder:text-zinc-400`}
              />
            </label>
          ) : null}

          <label className="min-w-0 lg:col-span-2">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
              Advanced JS
            </span>
            <textarea
              rows={4}
              value={getMetaTextValue(selectedStep, "advancedJs")}
              onChange={(event) =>
                updateStepAt(selectedIndex, (step) =>
                  updateMetaValue(step, "advancedJs", event.target.value)
                )
              }
              placeholder="Optional helper snippet or execution note for complex setup, transformation, or inspection logic"
              className={`${resolveFieldClassName(false)} min-h-[112px] resize-y py-2.5 font-mono text-xs placeholder:text-zinc-400`}
            />
          </label>

          <div className="min-w-0 lg:col-span-2">
            <div className="rounded-[22px] border border-zinc-200/80 bg-zinc-50/70 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900/60">
              <div className="flex flex-col gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                    AI Suggestions
                  </p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                    Keep repair, improvement, and generation actions inside the step editor while you author the scenario.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={onFixStep}
                    className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  >
                    Fix Step
                  </button>
                  <button
                    type="button"
                    onClick={onImproveAutomation}
                    className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  >
                    Improve Automation
                  </button>
                  <button
                    type="button"
                    onClick={onGenerateFromCase}
                    className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  >
                    Generate From Case
                  </button>
                </div>
                {assistantSuggestions.length > 0 ? (
                  <div className="space-y-3">
                    {assistantSuggestions.map((suggestion) => (
                      <div
                        key={suggestion.id}
                        className={`rounded-[20px] border px-4 py-4 ${
                          suggestion.tone === "emerald"
                            ? "border-emerald-200 bg-emerald-50/85 text-emerald-900 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-100"
                            : suggestion.tone === "amber"
                              ? "border-amber-200 bg-amber-50/85 text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100"
                              : "border-sky-200 bg-sky-50/85 text-sky-900 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-100"
                        }`}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="max-w-xl">
                            <p className="text-sm font-semibold">{suggestion.title}</p>
                            <p className="mt-1 text-sm leading-6 opacity-85">{suggestion.description}</p>
                          </div>
                          {suggestion.onApply ? (
                            <button
                              type="button"
                              onClick={suggestion.onApply}
                              className="rounded-2xl border border-current/20 bg-white/70 px-3 py-2 text-xs font-semibold shadow-sm transition hover:bg-white dark:bg-zinc-950/40 dark:hover:bg-zinc-950/60"
                            >
                              {suggestion.applyLabel ?? "Apply"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[20px] border border-dashed border-zinc-200 bg-white/70 px-4 py-4 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950/40 dark:text-zinc-400">
                    AI guidance will appear here after repair, improvement, or generation actions.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
