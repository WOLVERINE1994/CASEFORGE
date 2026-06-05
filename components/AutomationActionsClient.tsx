"use client";

import { useEffect, useMemo, useState } from "react";

import type { AutomationStep } from "./AutomationScenariosClient";

type AutomationAction = {
  createdFromScenarioId?: string | null;
  description: string;
  id: string;
  name: string;
  steps?: AutomationStep[];
  tags: string[];
  updatedAt: string;
  version: number;
};

type Props = {
  projectKey: string;
};

async function readApiJson<T>(response: Response): Promise<T & { error?: string }> {
  const text = await response.text();
  if (!text.trim()) return {} as T & { error?: string };
  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    return { error: "Server returned an invalid response." } as T & { error?: string };
  }
}

function formatUpdated(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function actionStepSignature(steps: AutomationStep[] = []) {
  return steps
    .map((step) =>
      [
        step.action,
        step.target?.locatorType || "",
        step.target?.value || "",
        step.inputValue || "",
        step.expectedValue || "",
        step.commandText || step.description || "",
      ]
        .join(":")
        .toLowerCase(),
    )
    .join("|");
}

export default function AutomationActionsClient({ projectKey }: Props) {
  const [actions, setActions] = useState<AutomationAction[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const actionsApi = `/api/automation/projects/${encodeURIComponent(projectKey)}/actions`;

  useEffect(() => {
    let cancelled = false;
    async function loadActions() {
      try {
        setLoading(true);
        const response = await fetch(actionsApi, { cache: "no-store" });
        const data = await readApiJson<{ actions?: AutomationAction[] }>(response);
        if (!response.ok) throw new Error(data.error || "Could not load actions.");
        if (!cancelled) {
          setActions(data.actions ?? []);
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) {
          setActions([]);
          setError(loadError instanceof Error ? loadError.message : "Could not load actions.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadActions();
    return () => {
      cancelled = true;
    };
  }, [actionsApi]);

  const filteredActions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const seen = new Set<string>();
    return actions.filter((action) => {
      const duplicateKey = [
        action.createdFromScenarioId || "",
        actionStepSignature(action.steps),
      ].join("::");
      if (seen.has(duplicateKey)) return false;
      seen.add(duplicateKey);
      if (!normalizedQuery) return true;
      return (
        action.name.toLowerCase().includes(normalizedQuery) ||
        action.description.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [actions, query]);

  const moveActionToBin = async (action: AutomationAction) => {
    const previous = actions;
    setActions((current) => current.filter((item) => item.id !== action.id));
    try {
      const response = await fetch(`${actionsApi}/${encodeURIComponent(action.id)}`, {
        method: "DELETE",
      });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.error || "Could not move action to recycle bin.");
      setError("");
    } catch (deleteError) {
      setActions(previous);
      setError(deleteError instanceof Error ? deleteError.message : "Could not move action to recycle bin.");
    }
  };

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-col gap-3 border-b border-zinc-200 bg-white pb-4 dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
            Reusable Actions
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Command groups created from selected scenario steps.
          </p>
          {error ? (
            <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
              {error}
            </p>
          ) : null}
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 sm:w-80"
          placeholder="Search actions"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Loading actions...
            </div>
          ) : filteredActions.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
              {actions.length ? "No actions match the current search." : "No actions yet. Select commands in a scenario and create one."}
            </div>
          ) : (
            filteredActions.map((action) => (
              <div
                key={action.id}
                className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_96px_150px_96px] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {action.name}
                  </p>
                  <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {action.description || "Reusable command group"}
                  </p>
                </div>
                <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  {action.steps?.length ?? 0} steps
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {formatUpdated(action.updatedAt)}
                </span>
                <button
                  type="button"
                  onClick={() => void moveActionToBin(action)}
                  className="justify-self-start rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 dark:hover:bg-rose-500/10 sm:justify-self-end"
                >
                  Move to bin
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
