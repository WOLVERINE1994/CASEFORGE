"use client";

import { useMemo, useState } from "react";
import {
  automationStepTemplates,
  buildAutomationTemplateSteps,
} from "../utils/automation-step-templates";
import type {
  AutomationProvider,
  AutomationReusableBlock,
  AutomationSelectorPreset,
  AutomationStep,
  AutomationStepResult,
  AutomationValidationIssue,
} from "../utils/workspace";

type Props = {
  steps: AutomationStep[];
  onChange: (steps: AutomationStep[]) => void;
  reusableBlocks?: AutomationReusableBlock[];
  selectorPresets?: AutomationSelectorPreset[];
  provider?: AutomationProvider;
  validationIssues?: AutomationValidationIssue[];
  currentDebugStepId?: string | null;
  stepResults?: AutomationStepResult[];
};

type StepActionOption = {
  value: AutomationStep["action"];
  label: string;
  shortLabel: string;
  targetType?: AutomationStep["targetType"];
  targetLabel: string;
  valueLabel?: string;
  expectedLabel?: string;
};

const STEP_ACTIONS: StepActionOption[] = [
  {
    value: "goto",
    label: "Navigate",
    shortLabel: "Navigate",
    targetType: "url",
    targetLabel: "URL or route",
  },
  {
    value: "click",
    label: "Click",
    shortLabel: "Click",
    targetType: "selector",
    targetLabel: "Selector or element",
  },
  {
    value: "fill",
    label: "Fill",
    shortLabel: "Fill",
    targetType: "selector",
    targetLabel: "Selector or field",
    valueLabel: "Value to enter",
  },
  {
    value: "wait-for",
    label: "Wait",
    shortLabel: "Wait",
    targetType: "selector",
    targetLabel: "Selector or URL",
  },
  {
    value: "assert-visible",
    label: "Assert Visible",
    shortLabel: "Assert",
    targetType: "selector",
    targetLabel: "Selector or element",
    expectedLabel: "Expected state",
  },
  {
    value: "assert-text",
    label: "Assert Text",
    shortLabel: "Assert",
    targetType: "selector",
    targetLabel: "Selector or element",
    expectedLabel: "Expected text",
  },
  {
    value: "assert-url",
    label: "Assert URL",
    shortLabel: "Assert",
    targetType: "url",
    targetLabel: "Current URL",
    expectedLabel: "Expected URL fragment",
  },
  {
    value: "assert-value",
    label: "Assert Value",
    shortLabel: "Assert",
    targetType: "selector",
    targetLabel: "Selector or field",
    expectedLabel: "Expected value",
  },
  {
    value: "press",
    label: "Press Key",
    shortLabel: "Press",
    targetType: "key",
    targetLabel: "Selector or target",
    valueLabel: "Key to press",
  },
  {
    value: "run-block",
    label: "Run Shared Block",
    shortLabel: "Shared block",
    targetType: "shared-block",
    targetLabel: "Shared block",
  },
];

const emptyStep = (scriptId: string, order: number): AutomationStep => ({
  id: crypto.randomUUID(),
  scriptId,
  order,
  action: "goto",
  targetType: "url",
  targetValue: "",
  inputValue: "",
  expectedValue: "",
  timeoutMs: 5000,
  metaJson: {},
});

const getActionOption = (action: AutomationStep["action"]) =>
  STEP_ACTIONS.find((option) => option.value === action) ?? STEP_ACTIONS[0];

const getStepDescription = (step: AutomationStep) =>
  typeof step.metaJson?.description === "string" ? step.metaJson.description : "";

const getStepExpectedResult = (step: AutomationStep) =>
  typeof step.metaJson?.expectedResult === "string" ? step.metaJson.expectedResult : "";

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

const formatStepSummary = (step: AutomationStep) => {
  const option = getActionOption(step.action);
  if (step.action === "run-block") {
    return step.targetValue?.trim() || step.sharedBlockId?.trim() || "Choose a shared block";
  }
  if (step.action === "fill") {
    return `${step.targetValue?.trim() || "Choose a field"} ${
      step.inputValue?.trim() ? `-> ${step.inputValue.trim()}` : ""
    }`.trim();
  }
  if (step.action.startsWith("assert")) {
    return `${step.targetValue?.trim() || option.targetLabel} ${
      step.expectedValue?.trim() ? `= ${step.expectedValue.trim()}` : ""
    }`.trim();
  }
  return step.targetValue?.trim() || option.targetLabel;
};

export default function AutomationStepEditor({
  steps,
  onChange,
  reusableBlocks = [],
  selectorPresets = [],
  provider = "playwright",
  validationIssues = [],
  currentDebugStepId = null,
  stepResults = [],
}: Props) {
  const [selectedStepId, setSelectedStepId] = useState<string | null>(steps[0]?.id ?? null);
  const activeStepId =
    selectedStepId && steps.some((step) => step.id === selectedStepId)
      ? selectedStepId
      : steps[0]?.id ?? null;

  const selectedIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === activeStepId)
  );
  const selectedStep = steps[selectedIndex] ?? null;
  const selectedAction = selectedStep ? getActionOption(selectedStep.action) : STEP_ACTIONS[0];

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
  const selectedStepIssues =
    (selectedStep ? validationIssuesByStepId.get(selectedStep.id) : undefined) ?? [];
  const selectedStepRunResults =
    (selectedStep ? stepResultsBySourceStepId.get(selectedStep.id) : undefined) ?? [];
  const selectedStepResult = aggregateStepResult(selectedStepRunResults);

  const getFieldIssues = (stepId: string, fields: AutomationValidationIssue["field"][]) =>
    (validationIssuesByStepId.get(stepId) ?? []).filter((issue) =>
      fields.includes(issue.field)
    );
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
    onChange(
      steps.map((step, stepIndex) =>
        stepIndex === index ? updater(step) : step
      )
    );
  };

  const normalizeOrders = (nextSteps: AutomationStep[]) =>
    nextSteps.map((step, index) => ({ ...step, order: index }));

  const addStep = () => {
    const scriptId = steps[0]?.scriptId ?? selectedStep?.scriptId ?? "";
    const nextStep = emptyStep(scriptId, steps.length);
    onChange(normalizeOrders([...steps, nextStep]));
    setSelectedStepId(nextStep.id);
  };

  const insertTemplate = (templateId: (typeof automationStepTemplates)[number]["id"]) => {
    const scriptId = steps[0]?.scriptId ?? selectedStep?.scriptId ?? "";
    const nextSteps = [
      ...steps,
      ...buildAutomationTemplateSteps({
        templateId,
        provider,
        scriptId,
        startOrder: steps.length,
      }),
    ];
    const normalized = normalizeOrders(nextSteps);
    onChange(normalized);
    setSelectedStepId(normalized[steps.length]?.id ?? normalized[0]?.id ?? null);
  };

  const insertSharedBlockStep = (blockId: string) => {
    const scriptId = steps[0]?.scriptId ?? selectedStep?.scriptId ?? "";
    const nextStep = {
      id: crypto.randomUUID(),
      scriptId,
      order: steps.length,
      action: "run-block" as const,
      targetType: "shared-block" as const,
      targetValue: blockId,
      sharedBlockId: blockId,
      timeoutMs: 5000,
      metaJson: {},
    };
    const normalized = normalizeOrders([...steps, nextStep]);
    onChange(normalized);
    setSelectedStepId(nextStep.id);
  };

  const removeStep = (index: number) => {
    const nextSteps = normalizeOrders(steps.filter((_, stepIndex) => stepIndex !== index));
    onChange(nextSteps);
    setSelectedStepId(nextSteps[Math.max(0, index - 1)]?.id ?? nextSteps[0]?.id ?? null);
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= steps.length) {
      return;
    }
    const nextSteps = [...steps];
    const [moved] = nextSteps.splice(index, 1);
    nextSteps.splice(targetIndex, 0, moved);
    onChange(normalizeOrders(nextSteps));
  };

  const setAction = (action: AutomationStep["action"]) => {
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
      }
      if (action === "goto" && !nextStep.targetType) {
        nextStep.targetType = "url";
      }
      return nextStep;
    });
  };

  if (!selectedStep) {
    return (
      <div className="rounded-[24px] border border-dashed border-zinc-200 bg-white/90 p-4 dark:border-zinc-700 dark:bg-zinc-950/80">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Add a step to start building this automation flow.
        </p>
        <button
          type="button"
          onClick={addStep}
          className="mt-3 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Add Step
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-[24px] border border-zinc-200/80 bg-white/90 p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-950/82">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
            Visual Step Builder
          </p>
          <p className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            Build flows step by step without touching the underlying execution model.
          </p>
        </div>
        <button
          type="button"
          onClick={addStep}
          className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Add Step
        </button>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(260px,0.95fr)_minmax(0,1.45fr)]">
        <div className="rounded-[22px] border border-zinc-200/80 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/60">
          <div className="rounded-[18px] border border-zinc-200/80 bg-white/90 p-3 dark:border-zinc-700 dark:bg-zinc-950/80">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
              Templates
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {automationStepTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => insertTemplate(template.id)}
                  className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200 dark:hover:bg-sky-500/20"
                >
                  {template.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 rounded-[18px] border border-zinc-200/80 bg-white/90 p-3 dark:border-zinc-700 dark:bg-zinc-950/80">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                Shared Blocks
              </p>
              <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                {reusableBlocks.length}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {reusableBlocks.length === 0 ? (
                <span className="rounded-full border border-dashed border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  Save a reusable block below to reuse it here.
                </span>
              ) : (
                reusableBlocks.map((block) => (
                  <button
                    key={block.id}
                    type="button"
                    onClick={() => insertSharedBlockStep(block.id)}
                    className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Insert {block.name}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
              Flow Steps
            </p>
            <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
              {steps.length} total
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {steps.map((step, index) => {
              const option = getActionOption(step.action);
              const isActive = step.id === activeStepId;
              const isDebugActive = currentDebugStepId === step.id;
              const stepIssues = validationIssuesByStepId.get(step.id) ?? [];
              const aggregatedResult = aggregateStepResult(
                stepResultsBySourceStepId.get(step.id) ?? []
              );
              return (
                <div
                  key={step.id}
                  onClick={() => setSelectedStepId(step.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedStepId(step.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className={`w-full rounded-[20px] border px-3 py-3 text-left transition ${
                    isDebugActive
                      ? "border-amber-300 bg-amber-50/90 shadow-sm dark:border-amber-500/40 dark:bg-amber-500/10"
                      : isActive
                      ? "border-emerald-300 bg-emerald-50/90 shadow-sm dark:border-emerald-500/40 dark:bg-emerald-500/10"
                      : stepIssues.length > 0
                      ? "border-rose-200 bg-rose-50/80 dark:border-rose-500/30 dark:bg-rose-500/10"
                      : "border-zinc-200/80 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                          Step {index + 1}
                        </p>
                        {isDebugActive ? (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                            Running
                          </span>
                        ) : null}
                        {stepIssues.length > 0 ? (
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                            {stepIssues.length} error{stepIssues.length === 1 ? "" : "s"}
                          </span>
                        ) : null}
                        {aggregatedResult ? (
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                              aggregatedResult.status === "passed"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
                                : aggregatedResult.status === "running"
                                ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
                                : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
                            }`}
                          >
                            {aggregatedResult.status}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                        {option.label}
                      </p>
                      <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {formatStepSummary(step)}
                      </p>
                      {getStepDescription(step) ? (
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                          {getStepDescription(step)}
                        </p>
                      ) : null}
                      {getStepExpectedResult(step) ? (
                        <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-emerald-700 dark:text-emerald-300">
                          {getStepExpectedResult(step)}
                        </p>
                      ) : null}
                      {aggregatedResult?.detail ? (
                        <p
                          className={`mt-1 line-clamp-2 text-[11px] leading-5 ${
                            aggregatedResult.status === "passed"
                              ? "text-emerald-700 dark:text-emerald-300"
                              : aggregatedResult.status === "running"
                              ? "text-amber-700 dark:text-amber-200"
                              : "text-rose-700 dark:text-rose-300"
                          }`}
                        >
                          {aggregatedResult.detail}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          moveStep(index, -1);
                        }}
                        disabled={index === 0}
                        className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          moveStep(index, 1);
                        }}
                        disabled={index === steps.length - 1}
                        className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
                      >
                        Down
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-[22px] border border-zinc-200/80 bg-zinc-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/60">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                Step Editor
              </p>
              <p className="mt-1 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                Step {selectedIndex + 1}: {selectedAction.label}
              </p>
            </div>
            <button
              type="button"
              onClick={() => removeStep(selectedIndex)}
              className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
            >
              Delete Step
            </button>
          </div>

          {selectedStepIssues.length > 0 ? (
            <div className="mt-4 rounded-[18px] border border-rose-200 bg-rose-50/80 px-4 py-3 dark:border-rose-500/30 dark:bg-rose-500/10">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-700 dark:text-rose-200">
                Inline Validation
              </p>
              {renderIssueMessages(selectedStepIssues)}
            </div>
          ) : null}

          {selectedStepResult ? (
            <div
              className={`mt-4 rounded-[18px] border px-4 py-3 ${
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
                {selectedStepResult.nestedCount > 1 ? (
                  <span className="rounded-full border border-current/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
                    {selectedStepResult.nestedCount} nested
                  </span>
                ) : null}
              </div>
              {selectedStepResult.detail ? (
                <p className="mt-2 text-xs leading-5 text-zinc-700 dark:text-zinc-200">
                  {selectedStepResult.detail}
                </p>
              ) : null}
              {selectedStepRunResults.length > 1 ? (
                <div className="mt-3 space-y-2">
                  {selectedStepRunResults.map((result) => (
                    <div
                      key={`${result.stepId}-${result.stepIndex}`}
                      className="rounded-2xl border border-current/10 bg-white/60 px-3 py-2 dark:bg-zinc-950/30"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em]">
                        Nested Step {result.stepIndex + 1}
                      </p>
                      <p className="mt-1 text-xs leading-5">
                        {result.failureReason || result.message || result.status}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
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
                <option value="shared-block">Shared block</option>
              </select>
              {renderIssueMessages(getFieldIssues(selectedStep.id, ["targetType"]))}
            </label>

            {selectedStep.action === "run-block" ? (
              <label className="min-w-0 lg:col-span-2">
                <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                  Shared Block
                </span>
                <select
                  value={selectedStep.sharedBlockId ?? selectedStep.targetValue ?? ""}
                  onChange={(event) =>
                    updateStepAt(selectedIndex, (step) => ({
                      ...step,
                      targetType: "shared-block",
                      sharedBlockId: event.target.value || undefined,
                      targetValue: event.target.value,
                    }))
                  }
                  className={resolveFieldClassName(
                    getFieldIssues(selectedStep.id, ["sharedBlockId", "targetValue"]).length > 0
                  )}
                >
                  <option value="">Choose a shared block</option>
                  {reusableBlocks.map((block) => (
                    <option key={block.id} value={block.id}>
                      {block.name}
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
                        ? "e.g. login or dashboard"
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
                rows={3}
                value={getStepDescription(selectedStep)}
                onChange={(event) =>
                  updateStepAt(selectedIndex, (step) =>
                    updateMetaValue(step, "description", event.target.value)
                  )
                }
                placeholder="Explain what this step is trying to verify or why it exists"
                className={`${resolveFieldClassName(false)} min-h-[96px] resize-y py-2.5 placeholder:text-zinc-400`}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
