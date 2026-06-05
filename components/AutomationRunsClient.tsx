"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type RunStatus = "queued" | "running" | "passed" | "failed" | "blocked" | "canceled";

type AutomationRun = {
  id: string;
  scenarioId?: string | null;
  sessionId?: string | null;
  status: RunStatus;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt?: string;
  summary: Record<string, unknown>;
};

type AutomationArtifact = {
  id: string;
  type: string;
  label: string;
  uri: string;
  downloadUrl?: string | null;
  encrypted: boolean;
  metadata: Record<string, unknown>;
};

type Props = {
  projectKey: string;
};

const statusStyles: Record<RunStatus, string> = {
  blocked: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
  canceled: "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300",
  failed: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
  passed: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
  queued: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200",
  running: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200",
};

function formatTime(value?: string | null) {
  if (!value) return "Not started";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function stepResults(summary: Record<string, unknown>) {
  return Array.isArray(summary.stepResults)
    ? summary.stepResults.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      )
    : [];
}

export default function AutomationRunsClient({ projectKey }: Props) {
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [artifacts, setArtifacts] = useState<AutomationArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const encodedProjectKey = encodeURIComponent(projectKey);
  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? runs[0] ?? null,
    [runs, selectedRunId],
  );

  const loadRuns = useCallback(async () => {
    const response = await fetch(
      `/api/automation/projects/${encodedProjectKey}/runs`,
      { cache: "no-store" },
    );
    const data = (await response.json()) as {
      error?: string;
      runs?: AutomationRun[];
    };
    if (!response.ok) throw new Error(data.error || "Could not load runs.");
    setRuns(data.runs ?? []);
    if (!selectedRunId && data.runs?.[0]) setSelectedRunId(data.runs[0].id);
  }, [encodedProjectKey, selectedRunId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve()
      .then(loadRuns)
      .then(() => {
        if (!cancelled) setError("");
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load runs.");
          setRuns([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadRuns]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedRun) {
      void Promise.resolve().then(() => {
        if (!cancelled) setArtifacts([]);
      });
      return;
    }
    void fetch(
      `/api/automation/projects/${encodedProjectKey}/runs/${encodeURIComponent(selectedRun.id)}/artifacts`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        const data = (await response.json()) as {
          artifacts?: AutomationArtifact[];
        };
        if (!cancelled) setArtifacts(data.artifacts ?? []);
      })
      .catch(() => {
        if (!cancelled) setArtifacts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [encodedProjectKey, selectedRun]);

  const cancelRun = async (runId: string) => {
    await fetch(
      `/api/automation/projects/${encodedProjectKey}/runs/${encodeURIComponent(runId)}/cancel`,
      { method: "POST" },
    );
    await loadRuns();
  };

  const rerun = async (runId: string) => {
    const response = await fetch(
      `/api/automation/projects/${encodedProjectKey}/runs/${encodeURIComponent(runId)}/rerun`,
      { method: "POST" },
    );
    const data = (await response.json()) as { run?: AutomationRun };
    await loadRuns();
    if (data.run) setSelectedRunId(data.run.id);
  };

  return (
    <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="overflow-hidden rounded-[16px] border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div>
            <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
              Automation Runs
            </h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Durable execution history with trace, video, logs, screenshots, and network evidence.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadRuns()}
            className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Refresh
          </button>
        </div>
        {error ? (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            {error}
          </div>
        ) : null}
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {loading ? (
            <div className="px-4 py-10 text-center text-sm text-zinc-500">Loading runs...</div>
          ) : runs.length ? (
            runs.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => setSelectedRunId(run.id)}
                className={`grid w-full gap-3 px-4 py-3 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-900 md:grid-cols-[160px_minmax(0,1fr)_120px] ${
                  selectedRun?.id === run.id ? "bg-emerald-50/70 dark:bg-emerald-500/10" : ""
                }`}
              >
                <span
                  className={`w-fit rounded-full border px-2 py-1 text-xs font-semibold ${statusStyles[run.status]}`}
                >
                  {run.status}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {run.summary?.name?.toString() || run.id}
                  </span>
                  <span className="mt-1 block truncate text-xs text-zinc-500 dark:text-zinc-400">
                    Scenario {run.scenarioId || "unlinked"} | {formatTime(run.createdAt)}
                  </span>
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {stepResults(run.summary).length} steps
                </span>
              </button>
            ))
          ) : (
            <div className="px-4 py-10 text-center text-sm text-zinc-500">
              No automation runs yet. Run a scenario to capture evidence.
            </div>
          )}
        </div>
      </section>

      <aside className="rounded-[16px] border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        {selectedRun ? (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span
                  className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusStyles[selectedRun.status]}`}
                >
                  {selectedRun.status}
                </span>
                <h3 className="mt-3 break-all text-base font-semibold text-zinc-950 dark:text-zinc-50">
                  {selectedRun.summary?.name?.toString() || selectedRun.id}
                </h3>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Started {formatTime(selectedRun.startedAt)}
                </p>
              </div>
              <div className="flex gap-2">
                {selectedRun.status === "queued" || selectedRun.status === "running" ? (
                  <button
                    type="button"
                    onClick={() => void cancelRun(selectedRun.id)}
                    className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  >
                    Cancel
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void rerun(selectedRun.id)}
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  Rerun
                </button>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
                Step Results
              </h4>
              <div className="mt-2 space-y-2">
                {stepResults(selectedRun.summary).length ? (
                  stepResults(selectedRun.summary).map((step, index) => (
                    <div
                      key={`${step.id || index}`}
                      className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {step.label?.toString() || `Step ${index + 1}`}
                        </span>
                        <span>{step.status?.toString() || "queued"}</span>
                      </div>
                      <div className="mt-1 text-zinc-500 dark:text-zinc-400">
                        {step.startedAt?.toString() || "pending"} - {step.finishedAt?.toString() || "pending"}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
                    Step timing will appear when the worker reports execution progress.
                  </p>
                )}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
                Artefacts
              </h4>
              <div className="mt-2 grid gap-2">
                {artifacts.map((artifact) => (
                  <a
                    key={artifact.id}
                    href={artifact.downloadUrl || artifact.uri}
                    className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm transition hover:bg-white dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-950"
                  >
                    <span className="block font-semibold capitalize text-zinc-950 dark:text-zinc-50">
                      {artifact.label || artifact.type}
                    </span>
                    <span className="mt-1 block truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {artifact.encrypted ? "encrypted reference" : artifact.uri}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[380px] items-center justify-center text-center text-sm text-zinc-500">
            Select a run to inspect evidence.
          </div>
        )}
      </aside>
    </div>
  );
}
