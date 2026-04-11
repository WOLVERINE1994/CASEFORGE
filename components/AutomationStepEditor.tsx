"use client";

import type { AutomationStep } from "../utils/workspace";

type Props = {
  steps: AutomationStep[];
  onChange: (steps: AutomationStep[]) => void;
};

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
});

export default function AutomationStepEditor({ steps, onChange }: Props) {
  const updateStep = (
    index: number,
    field: keyof AutomationStep,
    value: string | number | Record<string, unknown> | undefined
  ) => {
    onChange(
      steps.map((step, stepIndex) =>
        stepIndex === index ? { ...step, [field]: value } : step
      )
    );
  };

  const addStep = () => {
    const scriptId = steps[0]?.scriptId ?? "";
    onChange([...steps, emptyStep(scriptId, steps.length)]);
  };

  const removeStep = (index: number) => {
    onChange(
      steps
        .filter((_, stepIndex) => stepIndex !== index)
        .map((step, stepIndex) => ({ ...step, order: stepIndex }))
    );
  };

  return (
    <div className="space-y-3">
      {steps.map((step, index) => (
        <div
          key={step.id}
          className="rounded-[20px] border border-zinc-200/80 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-950"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              Step {index + 1}
            </p>
            <button
              type="button"
              onClick={() => removeStep(index)}
              className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
            >
              Remove
            </button>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <select
              value={step.action}
              onChange={(event) =>
                updateStep(index, "action", event.target.value as AutomationStep["action"])
              }
              className="min-h-[42px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="goto">Go to URL</option>
              <option value="click">Click</option>
              <option value="fill">Fill</option>
              <option value="press">Press key</option>
              <option value="wait-for">Wait for</option>
              <option value="assert-text">Assert text</option>
              <option value="assert-visible">Assert visible</option>
              <option value="assert-url">Assert URL</option>
              <option value="assert-value">Assert value</option>
            </select>
            <select
              value={step.targetType ?? ""}
              onChange={(event) =>
                updateStep(
                  index,
                  "targetType",
                  (event.target.value || undefined) as AutomationStep["targetType"]
                )
              }
              className="min-h-[42px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="">Target type</option>
              <option value="selector">Selector</option>
              <option value="url">URL</option>
              <option value="text">Text</option>
              <option value="value">Value</option>
              <option value="key">Key</option>
              <option value="endpoint">Endpoint</option>
            </select>
            <input
              type="text"
              value={step.targetValue ?? ""}
              onChange={(event) => updateStep(index, "targetValue", event.target.value)}
              placeholder="Target selector or URL"
              className="min-h-[42px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
            <input
              type="text"
              value={step.inputValue ?? ""}
              onChange={(event) => updateStep(index, "inputValue", event.target.value)}
              placeholder="Input value or key"
              className="min-h-[42px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
            <input
              type="text"
              value={step.expectedValue ?? ""}
              onChange={(event) => updateStep(index, "expectedValue", event.target.value)}
              placeholder="Expected value"
              className="min-h-[42px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
            <input
              type="number"
              min={0}
              value={step.timeoutMs ?? 5000}
              onChange={(event) =>
                updateStep(index, "timeoutMs", Number(event.target.value) || 0)
              }
              placeholder="Timeout (ms)"
              className="min-h-[42px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addStep}
        className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        Add Step
      </button>
    </div>
  );
}
