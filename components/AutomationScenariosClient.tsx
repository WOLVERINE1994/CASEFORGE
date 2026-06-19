"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ensureBrowserProjectSynced } from "../utils/automation/browser-project-sync";

type ScenarioStatus = "draft" | "active" | "paused" | "archived";

export type AutomationLocatorTarget = {
  type: "smart" | "manual";
  value: string;
  locatorType?: string;
  elementKind?: string;
  displayName?: string;
  operator?: string;
};

export type AutomationLocatorCandidate = {
  id?: string;
  type?: string;
  strategy?: string;
  value: string;
  score: number;
  unique?: boolean;
  isUnique?: boolean;
  metadata?: Record<string, unknown>;
  rank?: number;
  source?: string;
};

export type AutomationStep = {
  id: string;
  action: string;
  description: string;
  target: AutomationLocatorTarget;
  options?: Record<string, unknown>;
  inputValue?: string;
  expectedValue?: string;
  assertionType?: string;
  commandText?: string;
  locatorCandidates?: AutomationLocatorCandidate[];
  element?: {
    ariaLabel?: string;
    bounds?: Record<string, unknown>;
    className?: string;
    dataAttributes?: Record<string, unknown>;
    elementKind?: string;
    id?: string;
    labelText?: string;
    nearbyText?: string;
    parentTag?: string;
    role?: string;
    tag?: string;
    text?: string;
    [key: string]: unknown;
  };
  status?: "pending" | "running" | "passed" | "failed";
};

export type AutomationScenario = {
  id: string;
  projectId?: string;
  version?: number;
  name: string;
  description: string;
  suiteId?: string;
  tags: string[];
  status: ScenarioStatus;
  metadata?: Record<string, unknown>;
  steps?: AutomationStep[];
  updatedAt: number | string;
};

type Props = {
  projectKey: string;
};

function updatedTime(value: AutomationScenario["updatedAt"]) {
  return typeof value === "number" ? value : new Date(value).getTime();
}

function formatUpdated(value: AutomationScenario["updatedAt"]) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(updatedTime(value)));
}

function legacyScenariosKey(projectKey: string) {
  return `caseforge:automation:scenarios:${projectKey}`;
}

function legacyImportMarkerKey(projectKey: string) {
  return `caseforge:automation:legacy-imported:${projectKey}`;
}

function readLegacyScenarios(projectKey: string) {
  if (typeof window === "undefined") return [];
  const legacyScenarios: Partial<AutomationScenario>[] = [];
  const raw = window.localStorage.getItem(legacyScenariosKey(projectKey));
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      const candidates =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as { scenarios?: unknown }).scenarios
          : parsed;
      if (Array.isArray(candidates)) {
        legacyScenarios.push(
          ...candidates.filter(
            (scenario): scenario is Partial<AutomationScenario> =>
              Boolean(scenario) && typeof scenario === "object",
          ),
        );
      }
    } catch {
      // Ignore malformed old browser storage and keep the DB library usable.
    }
  }

  const projectBlob = window.localStorage.getItem("tc_projects_v1");
  if (projectBlob) {
    try {
      const parsed = JSON.parse(projectBlob) as unknown;
      const projects = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object"
          ? (parsed as { projects?: unknown }).projects
          : [];
      const project = Array.isArray(projects)
        ? projects.find(
            (item) =>
              item &&
              typeof item === "object" &&
              ((item as { id?: unknown }).id === projectKey ||
                (item as { key?: unknown }).key === projectKey),
          )
        : null;
      const planning =
        project && typeof project === "object"
          ? (project as { planning?: unknown }).planning
          : null;
      if (planning && typeof planning === "object" && !Array.isArray(planning)) {
        const scenarios = (planning as { automationScenarios?: unknown })
          .automationScenarios;
        const stepsById = (planning as { automationSteps?: unknown }).automationSteps;
        if (Array.isArray(scenarios)) {
          legacyScenarios.push(
            ...scenarios
              .filter(
                (scenario): scenario is Partial<AutomationScenario> =>
                  Boolean(scenario) && typeof scenario === "object",
              )
              .map((scenario) => {
                const scriptId =
                  typeof (scenario as { scriptId?: unknown }).scriptId === "string"
                    ? (scenario as { scriptId: string }).scriptId
                    : scenario.id;
                const steps =
                  stepsById &&
                  typeof stepsById === "object" &&
                  !Array.isArray(stepsById) &&
                  typeof scriptId === "string"
                    ? (stepsById as Record<string, unknown>)[scriptId]
                    : undefined;
                return {
                  ...scenario,
                  steps: Array.isArray(steps) ? steps : scenario.steps,
                };
              }),
          );
        }
      }
    } catch {
      // Ignore malformed legacy project blobs; the canonical DB load still wins.
    }
  }

  const seen = new Set<string>();
  return legacyScenarios.filter((scenario) => {
    const key = typeof scenario.id === "string" ? scenario.id : scenario.name;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function readApiJson<T>(response: Response): Promise<T & { error?: string }> {
  const text = await response.text();
  if (!text.trim()) {
    return {} as T & { error?: string };
  }
  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    return {
      error: `Server returned an invalid response (${response.status || "unknown"}).`,
    } as T & { error?: string };
  }
}

function withResponseStatus(error: Error, status: number) {
  return Object.assign(error, { status });
}

function isNotFoundError(error: unknown) {
  return (
    error instanceof Error &&
    typeof (error as Error & { status?: unknown }).status === "number" &&
    (error as Error & { status?: number }).status === 404
  );
}

export default function AutomationScenariosClient({ projectKey }: Props) {
  const router = useRouter();
  const [scenarios, setScenarios] = useState<AutomationScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ScenarioStatus | "all">("all");

  const encodedProjectKey = encodeURIComponent(projectKey);
  const scenariosApi = `/api/automation/projects/${encodedProjectKey}/scenarios`;
  const importApi = `${scenariosApi}/import`;

  useEffect(() => {
    let cancelled = false;

    async function fetchScenarios() {
      const response = await fetch(scenariosApi, { cache: "no-store" });
      const data = await readApiJson<{
        error?: string;
        scenarios?: AutomationScenario[];
      }>(response);
      if (!response.ok) {
        throw withResponseStatus(
          new Error(data.error || "Could not load scenarios."),
          response.status,
        );
      }
      return data.scenarios ?? [];
    }

    async function importLegacyScenariosOnce() {
      if (typeof window === "undefined") return false;
      if (window.localStorage.getItem(legacyImportMarkerKey(projectKey))) {
        return false;
      }

      const legacyScenarios = readLegacyScenarios(projectKey);
      window.localStorage.setItem(
        legacyImportMarkerKey(projectKey),
        new Date().toISOString(),
      );
      if (!legacyScenarios.length) return false;

      const response = await fetch(importApi, {
        body: JSON.stringify({
          scenarios: legacyScenarios,
          source: "legacy-local-storage",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = await readApiJson<{
        error?: string;
        imported?: AutomationScenario[];
      }>(response);
      if (!response.ok) {
        window.localStorage.removeItem(legacyImportMarkerKey(projectKey));
        throw new Error(data.error || "Could not import old scenarios.");
      }
      return Boolean(data.imported?.length);
    }

    async function loadScenarios() {
      try {
        setLoading(true);
        await ensureBrowserProjectSynced(projectKey);
        let loaded: AutomationScenario[];
        try {
          loaded = await fetchScenarios();
        } catch (loadError) {
          if (!isNotFoundError(loadError)) {
            throw loadError;
          }
          const synced = await ensureBrowserProjectSynced(projectKey);
          if (!synced) {
            throw loadError;
          }
          loaded = await fetchScenarios();
        }
        const imported = await importLegacyScenariosOnce();
        if (imported) {
          loaded = await fetchScenarios();
        }
        if (!cancelled) {
          setScenarios(loaded);
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) {
          setScenarios([]);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load scenarios.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadScenarios();
    return () => {
      cancelled = true;
    };
  }, [importApi, projectKey, scenariosApi]);

  const sortedScenarios = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return scenarios
      .filter((scenario) => {
        const matchesQuery =
          !normalizedQuery ||
          scenario.name.toLowerCase().includes(normalizedQuery) ||
          scenario.description.toLowerCase().includes(normalizedQuery) ||
          scenario.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery));
        const matchesStatus =
          statusFilter === "all" || scenario.status === statusFilter;
        return matchesQuery && matchesStatus;
      })
      .sort((a, b) => updatedTime(b.updatedAt) - updatedTime(a.updatedAt));
  }, [query, scenarios, statusFilter]);

  const navigateToScenario = (scenarioId: string) => {
    router.push(
      `/projects/${encodedProjectKey}/automation/scenarios?scenarioId=${encodeURIComponent(scenarioId)}`,
    );
  };

  const handleNewScenario = async () => {
    if (typeof window === "undefined") return;
    const enteredName = window.prompt("Scenario name", "");
    if (enteredName === null) return;
    const scenarioName = enteredName.trim();
    if (!scenarioName) {
      setError("Scenario name is required.");
      return;
    }

    const optimisticId = `scenario-draft-${Date.now().toString(36)}`;
    const optimisticScenario: AutomationScenario = {
      description: "",
      id: optimisticId,
      name: scenarioName,
      status: "draft",
      steps: [],
      tags: [],
      updatedAt: new Date().toISOString(),
      version: 1,
    };
    setScenarios((current) => [optimisticScenario, ...current]);
    try {
      const response = await fetch(scenariosApi, {
        body: JSON.stringify({ name: scenarioName }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = await readApiJson<{
        error?: string;
        scenario?: AutomationScenario;
      }>(response);
      if (!response.ok || !data.scenario) {
        throw new Error(data.error || "Could not create scenario.");
      }
      setScenarios((current) =>
        current.map((scenario) =>
          scenario.id === optimisticId ? data.scenario as AutomationScenario : scenario,
        ),
      );
      navigateToScenario(data.scenario.id);
    } catch (createError) {
      setScenarios((current) =>
        current.filter((scenario) => scenario.id !== optimisticId),
      );
      setError(
        createError instanceof Error
          ? createError.message
          : "Could not create scenario.",
      );
    }
  };

  const handleDeleteScenario = async (scenario: AutomationScenario) => {
    const previous = scenarios;
    setScenarios((current) => current.filter((item) => item.id !== scenario.id));
    try {
      const response = await fetch(`${scenariosApi}/${encodeURIComponent(scenario.id)}`, {
        method: "DELETE",
      });
      const data = await readApiJson<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(data.error || "Could not move scenario to recycle bin.");
      }
      setError("");
    } catch (deleteError) {
      setScenarios(previous);
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not move scenario to recycle bin.",
      );
    }
  };

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-col gap-3 border-b border-zinc-200 bg-white pb-4 dark:border-zinc-800 dark:bg-zinc-950 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
            Scenarios
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Lightweight browser flows. Create one to open the recorder.
          </p>
          {error ? (
            <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row xl:min-w-[560px]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
            placeholder="Search scenarios"
          />
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as ScenarioStatus | "all")
            }
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="archived">Archived</option>
          </select>
          <button
            type="button"
            onClick={() => void handleNewScenario()}
            className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-950"
          >
            + Scenario
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Loading scenarios...
            </div>
          ) : sortedScenarios.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
              {scenarios.length ? "No scenarios match the current filters." : "No scenarios yet. Create one to start recording."}
            </div>
          ) : (
            sortedScenarios.map((scenario) => (
              <div
                key={scenario.id}
                className="grid w-full gap-2 px-4 py-3 transition hover:bg-emerald-50/60 dark:hover:bg-emerald-500/10 sm:grid-cols-[minmax(0,1fr)_88px_132px_64px] sm:items-center"
              >
                <button
                  type="button"
                  onClick={() => navigateToScenario(scenario.id)}
                  className="min-w-0 text-left focus:outline-none"
                >
                  <span className="block truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {scenario.name}
                  </span>
                  {scenario.description ? (
                    <span className="mt-1 block truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {scenario.description}
                    </span>
                  ) : null}
                </button>
                <span className="text-xs font-semibold capitalize text-zinc-600 dark:text-zinc-300">
                  {scenario.status}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {formatUpdated(scenario.updatedAt)}
                </span>
                <button
                  type="button"
                  onClick={() => void handleDeleteScenario(scenario)}
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
