"use client";

type Props = {
  requirementReady: boolean;
  generatedCases: number;
  automatedCases: number;
  runHealthLabel: string;
  releaseReadinessLabel: string;
};

const stepTone = (active: boolean) =>
  active
    ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
    : "border-zinc-200 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300";

export default function WorkflowValuePath({
  requirementReady,
  generatedCases,
  automatedCases,
  runHealthLabel,
  releaseReadinessLabel,
}: Props) {
  const steps = [
    {
      label: "Requirement",
      detail: requirementReady ? "Requirement is ready for generation" : "Add requirement context",
      active: requirementReady,
    },
    {
      label: "Coverage",
      detail: generatedCases > 0 ? `${generatedCases} cases generated` : "Generate structured coverage",
      active: generatedCases > 0,
    },
    {
      label: "Review",
      detail: generatedCases > 0 ? "Tighten and approve the draft" : "Review starts after generation",
      active: generatedCases > 0,
    },
    {
      label: "Automation",
      detail: automatedCases > 0 ? `${automatedCases} cases automated` : "Promote repeatable coverage",
      active: automatedCases > 0,
    },
    {
      label: "Run Results",
      detail: runHealthLabel,
      active: runHealthLabel !== "No runs yet",
    },
    {
      label: "Release",
      detail: releaseReadinessLabel,
      active: releaseReadinessLabel !== "Not assessed yet",
    },
  ];

  return (
    <section className="rounded-[24px] border border-zinc-200/80 bg-zinc-50/85 px-5 py-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/72">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
            Value Path
          </p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Requirement to coverage to automation to release confidence
          </h3>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            This workspace is designed to move one requirement into review-ready coverage, reusable automation, evidence from runs, and a clear ship decision.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 2xl:grid-cols-6">
        {steps.map((step) => (
          <article
            key={step.label}
            className={`rounded-[22px] border px-4 py-4 shadow-sm ${stepTone(step.active)}`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">
              {step.label}
            </p>
            <p className="mt-2 text-sm font-semibold">{step.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

