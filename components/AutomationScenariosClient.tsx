"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ensureBrowserProjectSynced } from "../utils/automation/browser-project-sync";

type ScenarioStatus = "draft" | "active" | "paused" | "completed" | "archived";

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
  tags: string[];
  status: ScenarioStatus;
  metadata?: Record<string, unknown>;
  steps?: AutomationStep[];
  createdAt?: number | string;
  updatedAt: number | string;
};

type AutomationSuite = {
  id: string;
  projectId?: string;
  version?: number;
  name: string;
  description: string;
  status: ScenarioStatus;
  tags: string[];
  metadata?: Record<string, unknown>;
  scenarioIds: string[];
  createdAt: string;
  updatedAt: string;
};

type Props = {
  projectKey: string;
};

const statusOptions: ScenarioStatus[] = [
  "draft",
  "active",
  "paused",
  "completed",
  "archived",
];
const bulkTagModes = ["append", "remove", "replace"] as const;
type BulkTagMode = (typeof bulkTagModes)[number];

const statusTone: Record<ScenarioStatus, string> = {
  active:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-100",
  archived:
    "border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
  completed:
    "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-500/30 dark:bg-teal-500/15 dark:text-teal-100",
  draft:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-100",
  paused:
    "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-100",
};

function valueTime(value?: AutomationScenario["updatedAt"]) {
  if (!value) return 0;
  return typeof value === "number" ? value : new Date(value).getTime();
}

function formatDate(value?: AutomationScenario["updatedAt"]) {
  if (!value) return "Not saved";
  const date = new Date(valueTime(value));
  if (Number.isNaN(date.getTime())) return "Not saved";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function parseTags(value: string) {
  return [
    ...new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
}

function sameStringArray(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

function statusLabel(status: ScenarioStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function bulkTagModeLabel(mode: BulkTagMode) {
  if (mode === "remove") return "Remove tags";
  if (mode === "replace") return "Replace tags";
  return "Add tags";
}

function applyTagMode(currentTags: string[], nextTags: string[], mode: BulkTagMode) {
  if (mode === "replace") return nextTags;
  if (mode === "remove") {
    const tagsToRemove = new Set(nextTags.map((tag) => tag.toLowerCase()));
    return currentTags.filter((tag) => !tagsToRemove.has(tag.toLowerCase()));
  }
  const existing = new Set(currentTags.map((tag) => tag.toLowerCase()));
  return [
    ...currentTags,
    ...nextTags.filter((tag) => !existing.has(tag.toLowerCase())),
  ];
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
  const [suites, setSuites] = useState<AutomationSuite[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [savingSuite, setSavingSuite] = useState(false);
  const [savingBulk, setSavingBulk] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ScenarioStatus | "all">("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [suiteFilter, setSuiteFilter] = useState("all");
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});
  const [bulkStatus, setBulkStatus] = useState<ScenarioStatus | "">("");
  const [bulkTagMode, setBulkTagMode] = useState<BulkTagMode>("append");
  const [bulkTags, setBulkTags] = useState("");
  const [targetSuiteId, setTargetSuiteId] = useState("");
  const [newSuiteName, setNewSuiteName] = useState("");
  const [newSuiteTags, setNewSuiteTags] = useState("");
  const [newSuiteStatus, setNewSuiteStatus] = useState<ScenarioStatus>("draft");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [websiteComponent, setWebsiteComponent] = useState("homepage");
  const [websiteCoverage, setWebsiteCoverage] = useState("standard");
  const [generatingWebsite, setGeneratingWebsite] = useState(false);
  const [websiteGenerationNote, setWebsiteGenerationNote] = useState("");

  const encodedProjectKey = encodeURIComponent(projectKey);
  const scenariosApi = `/api/automation/projects/${encodedProjectKey}/scenarios`;
  const suitesApi = `/api/automation/projects/${encodedProjectKey}/suites`;
  const importApi = `${scenariosApi}/import`;
  const websiteGenerateApi = `/api/automation/projects/${encodedProjectKey}/generate-from-website`;

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

    async function fetchSuites() {
      const response = await fetch(suitesApi, { cache: "no-store" });
      const data = await readApiJson<{
        error?: string;
        suites?: AutomationSuite[];
      }>(response);
      if (!response.ok) {
        throw withResponseStatus(
          new Error(data.error || "Could not load suites."),
          response.status,
        );
      }
      return data.suites ?? [];
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

    async function loadLibrary() {
      try {
        setLoading(true);
        await ensureBrowserProjectSynced(projectKey);
        let loadedScenarios: AutomationScenario[] = [];
        let loadedSuites: AutomationSuite[] = [];
        try {
          [loadedScenarios, loadedSuites] = await Promise.all([
            fetchScenarios(),
            fetchSuites(),
          ]);
        } catch (loadError) {
          if (!isNotFoundError(loadError)) {
            throw loadError;
          }
          const synced = await ensureBrowserProjectSynced(projectKey);
          if (!synced) {
            throw loadError;
          }
          [loadedScenarios, loadedSuites] = await Promise.all([
            fetchScenarios(),
            fetchSuites(),
          ]);
        }
        const imported = await importLegacyScenariosOnce();
        if (imported) {
          loadedScenarios = await fetchScenarios();
        }
        if (!cancelled) {
          setScenarios(loadedScenarios);
          setSuites(loadedSuites);
          setTagDrafts(
            Object.fromEntries(
              loadedScenarios.map((scenario) => [
                scenario.id,
                scenario.tags.join(", "),
              ]),
            ),
          );
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) {
          setScenarios([]);
          setSuites([]);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load scenario library.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadLibrary();
    return () => {
      cancelled = true;
    };
  }, [importApi, projectKey, scenariosApi, suitesApi]);

  const scenarioSuitesById = useMemo(() => {
    const result = new Map<string, AutomationSuite[]>();
    for (const suite of suites) {
      for (const scenarioId of suite.scenarioIds) {
        const entries = result.get(scenarioId) ?? [];
        entries.push(suite);
        result.set(scenarioId, entries);
      }
    }
    return result;
  }, [suites]);

  const allTags = useMemo(
    () =>
      [
        ...new Set(
          scenarios.flatMap((scenario) => scenario.tags).filter((tag) => tag.trim()),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [scenarios],
  );

  const sortedScenarios = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return scenarios
      .filter((scenario) => {
        const suiteNames = (scenarioSuitesById.get(scenario.id) ?? []).map(
          (suite) => suite.name,
        );
        const matchesQuery =
          !normalizedQuery ||
          scenario.name.toLowerCase().includes(normalizedQuery) ||
          scenario.description.toLowerCase().includes(normalizedQuery) ||
          scenario.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery)) ||
          suiteNames.some((name) => name.toLowerCase().includes(normalizedQuery));
        const matchesStatus =
          statusFilter === "all" || scenario.status === statusFilter;
        const matchesTag = tagFilter === "all" || scenario.tags.includes(tagFilter);
        const matchesSuite =
          suiteFilter === "all" ||
          (suiteFilter === "unassigned" &&
            !scenarioSuitesById.get(scenario.id)?.length) ||
          Boolean(
            scenarioSuitesById
              .get(scenario.id)
              ?.some((suite) => suite.id === suiteFilter),
          );
        return matchesQuery && matchesStatus && matchesTag && matchesSuite;
      })
      .sort((a, b) => valueTime(b.updatedAt) - valueTime(a.updatedAt));
  }, [query, scenarioSuitesById, scenarios, statusFilter, suiteFilter, tagFilter]);

  const selectedScenarios = useMemo(
    () => scenarios.filter((scenario) => selectedIds.has(scenario.id)),
    [scenarios, selectedIds],
  );

  const allVisibleSelected =
    sortedScenarios.length > 0 &&
    sortedScenarios.every((scenario) => selectedIds.has(scenario.id));
  const canBulkUpdate =
    selectedScenarios.length > 0 &&
    !savingBulk &&
    (Boolean(bulkStatus) || Boolean(bulkTags.trim()) || bulkTagMode === "replace");
  const canGenerateFromWebsite =
    Boolean(websiteUrl.trim()) &&
    Boolean(websiteComponent.trim()) &&
    !generatingWebsite;

  const navigateToScenario = (scenarioId: string) => {
    router.push(
      `/projects/${encodedProjectKey}/automation/scenarios?scenarioId=${encodeURIComponent(scenarioId)}`,
    );
  };

  const patchScenario = async (
    scenario: AutomationScenario,
    updates: Partial<Pick<AutomationScenario, "description" | "name" | "status" | "tags" | "metadata">>,
  ) => {
    const previous = scenarios;
    setScenarios((current) =>
      current.map((item) =>
        item.id === scenario.id
          ? { ...item, ...updates, updatedAt: new Date().toISOString() }
          : item,
      ),
    );
    try {
      const response = await fetch(`${scenariosApi}/${encodeURIComponent(scenario.id)}`, {
        body: JSON.stringify(updates),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const data = await readApiJson<{
        error?: string;
        scenario?: AutomationScenario;
      }>(response);
      if (!response.ok || !data.scenario) {
        throw new Error(data.error || "Could not update scenario.");
      }
      const updatedScenario = data.scenario;
      setScenarios((current) =>
        current.map((item) => (item.id === scenario.id ? updatedScenario : item)),
      );
      setTagDrafts((current) => ({
        ...current,
        [scenario.id]: updatedScenario.tags.join(", "),
      }));
      setError("");
    } catch (updateError) {
      setScenarios(previous);
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Could not update scenario.",
      );
    }
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

    const now = new Date().toISOString();
    const optimisticId = `scenario-draft-${Date.now().toString(36)}`;
    const optimisticScenario: AutomationScenario = {
      createdAt: now,
      description: "",
      id: optimisticId,
      name: scenarioName,
      status: "draft",
      steps: [],
      tags: [],
      updatedAt: now,
      version: 1,
    };
    setScenarios((current) => [optimisticScenario, ...current]);
    setTagDrafts((current) => ({ ...current, [optimisticId]: "" }));
    try {
      const response = await fetch(scenariosApi, {
        body: JSON.stringify({ name: scenarioName, status: "draft" }),
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
      setTagDrafts((current) => {
        const next = { ...current };
        delete next[optimisticId];
        next[data.scenario!.id] = data.scenario!.tags.join(", ");
        return next;
      });
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

  const handleGenerateFromWebsite = async () => {
    if (!canGenerateFromWebsite) {
      setError("Website URL and component are required.");
      return;
    }

    setGeneratingWebsite(true);
    setWebsiteGenerationNote("");
    try {
      const response = await fetch(websiteGenerateApi, {
        body: JSON.stringify({
          component: websiteComponent.trim(),
          coverage: websiteCoverage,
          url: websiteUrl.trim(),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = await readApiJson<{
        error?: string;
        scenarios?: AutomationScenario[];
        snapshot?: {
          component?: string;
          finalUrl?: string;
          visibleElementCount?: number;
        };
        usedFallback?: boolean;
      }>(response);
      if (!response.ok || !data.scenarios?.length) {
        throw new Error(data.error || "Could not generate website scenarios.");
      }

      setScenarios((current) => [...data.scenarios!, ...current]);
      setTagDrafts((current) => ({
        ...current,
        ...Object.fromEntries(
          data.scenarios!.map((scenario) => [
            scenario.id,
            scenario.tags.join(", "),
          ]),
        ),
      }));
      setQuery("");
      setStatusFilter("all");
      setTagFilter("all");
      setSuiteFilter("all");
      setError("");
      setWebsiteGenerationNote(
        `${data.scenarios.length} scenario${data.scenarios.length === 1 ? "" : "s"} created from ${data.snapshot?.component || websiteComponent}.`,
      );
    } catch (generationError) {
      setWebsiteGenerationNote("");
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Could not generate website scenarios.",
      );
    } finally {
      setGeneratingWebsite(false);
    }
  };

  const handleDeleteScenario = async (scenario: AutomationScenario) => {
    const previous = scenarios;
    setScenarios((current) => current.filter((item) => item.id !== scenario.id));
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(scenario.id);
      return next;
    });
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

  const toggleScenario = (scenarioId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(scenarioId)) {
        next.delete(scenarioId);
      } else {
        next.add(scenarioId);
      }
      return next;
    });
  };

  const toggleVisibleScenarios = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        sortedScenarios.forEach((scenario) => next.delete(scenario.id));
      } else {
        sortedScenarios.forEach((scenario) => next.add(scenario.id));
      }
      return next;
    });
  };

  const saveScenarioTags = async (scenario: AutomationScenario) => {
    const nextTags = parseTags(tagDrafts[scenario.id] ?? scenario.tags.join(", "));
    if (sameStringArray(nextTags, scenario.tags)) return;
    await patchScenario(scenario, { tags: nextTags });
  };

  const handleBulkUpdate = async () => {
    if (!selectedScenarios.length || savingBulk) return;

    const trimmedTagInput = bulkTags.trim();
    const parsedTags = parseTags(bulkTags);
    const shouldUpdateTags =
      Boolean(trimmedTagInput) || bulkTagMode === "replace";
    if (!bulkStatus && !shouldUpdateTags) {
      setError("Choose a status or enter tags before bulk updating.");
      return;
    }

    const selectedScenarioIds = selectedScenarios.map((scenario) => scenario.id);
    const selectedScenarioIdSet = new Set(selectedScenarioIds);
    const previousScenarios = scenarios;
    const previousTagDrafts = tagDrafts;
    const now = new Date().toISOString();
    setSavingBulk(true);
    setScenarios((current) =>
      current.map((scenario) => {
        if (!selectedScenarioIdSet.has(scenario.id)) return scenario;
        return {
          ...scenario,
          status: bulkStatus || scenario.status,
          tags: shouldUpdateTags
            ? applyTagMode(scenario.tags, parsedTags, bulkTagMode)
            : scenario.tags,
          updatedAt: now,
        };
      }),
    );
    setTagDrafts((current) => {
      const next = { ...current };
      for (const scenario of selectedScenarios) {
        if (!shouldUpdateTags) continue;
        next[scenario.id] = applyTagMode(
          scenario.tags,
          parsedTags,
          bulkTagMode,
        ).join(", ");
      }
      return next;
    });

    try {
      const response = await fetch(`${scenariosApi}/bulk`, {
        body: JSON.stringify({
          scenarioIds: selectedScenarioIds,
          status: bulkStatus || undefined,
          tagMode: bulkTagMode,
          tags: shouldUpdateTags ? parsedTags : undefined,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const data = await readApiJson<{
        error?: string;
        notFoundIds?: string[];
        scenarios?: AutomationScenario[];
      }>(response);
      if (!response.ok || !data.scenarios) {
        throw new Error(data.error || "Could not bulk update scenarios.");
      }

      const updatedById = new Map(
        data.scenarios.map((scenario) => [scenario.id, scenario]),
      );
      setScenarios((current) =>
        current.map((scenario) => updatedById.get(scenario.id) ?? scenario),
      );
      setTagDrafts((current) => {
        const next = { ...current };
        for (const scenario of data.scenarios ?? []) {
          next[scenario.id] = scenario.tags.join(", ");
        }
        return next;
      });
      setSelectedIds(new Set());
      setBulkStatus("");
      setBulkTags("");
      setError(
        data.notFoundIds?.length
          ? `${data.notFoundIds.length} scenario${data.notFoundIds.length === 1 ? "" : "s"} could not be updated because they no longer exist.`
          : "",
      );
    } catch (bulkError) {
      setScenarios(previousScenarios);
      setTagDrafts(previousTagDrafts);
      setError(
        bulkError instanceof Error
          ? bulkError.message
          : "Could not bulk update scenarios.",
      );
    } finally {
      setSavingBulk(false);
    }
  };

  const handleAddSelectedToSuite = async () => {
    if (!selectedScenarios.length || savingSuite) return;
    const suiteName = newSuiteName.trim();
    const selectedScenarioIds = selectedScenarios.map((scenario) => scenario.id);
    setSavingSuite(true);
    try {
      if (suiteName) {
        const response = await fetch(suitesApi, {
          body: JSON.stringify({
            name: suiteName,
            scenarioIds: selectedScenarioIds,
            status: newSuiteStatus,
            tags: parseTags(newSuiteTags),
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const data = await readApiJson<{ error?: string; suite?: AutomationSuite }>(
          response,
        );
        if (!response.ok || !data.suite) {
          throw new Error(data.error || "Could not create suite.");
        }
        setSuites((current) => [data.suite!, ...current]);
        setTargetSuiteId(data.suite.id);
        setNewSuiteName("");
        setNewSuiteTags("");
      } else {
        const targetSuite = suites.find((suite) => suite.id === targetSuiteId);
        if (!targetSuite) {
          throw new Error("Choose an existing suite or enter a new suite name.");
        }
        const nextScenarioIds = [
          ...new Set([...targetSuite.scenarioIds, ...selectedScenarioIds]),
        ];
        const response = await fetch(`${suitesApi}/${encodeURIComponent(targetSuite.id)}`, {
          body: JSON.stringify({ scenarioIds: nextScenarioIds }),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        });
        const data = await readApiJson<{ error?: string; suite?: AutomationSuite }>(
          response,
        );
        if (!response.ok || !data.suite) {
          throw new Error(data.error || "Could not update suite.");
        }
        setSuites((current) =>
          current.map((suite) => (suite.id === targetSuite.id ? data.suite! : suite)),
        );
      }
      setSelectedIds(new Set());
      setError("");
    } catch (suiteError) {
      setError(
        suiteError instanceof Error
          ? suiteError.message
          : "Could not add scenarios to suite.",
      );
    } finally {
      setSavingSuite(false);
    }
  };

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-col gap-3 border-b border-zinc-200 bg-white pb-4 dark:border-zinc-800 dark:bg-zinc-950 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
            Scenarios
          </h2>
          {error ? (
            <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row xl:min-w-[760px]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
            placeholder="Search scenario, tag, or suite"
          />
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as ScenarioStatus | "all")
            }
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="all">All statuses</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </select>
          <select
            value={tagFilter}
            onChange={(event) => setTagFilter(event.target.value)}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="all">All tags</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
          <select
            value={suiteFilter}
            onChange={(event) => setSuiteFilter(event.target.value)}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="all">All suites</option>
            <option value="unassigned">Unassigned</option>
            {suites.map((suite) => (
              <option key={suite.id} value={suite.id}>
                {suite.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void handleNewScenario()}
            className="inline-flex items-center justify-center rounded-xl border border-emerald-700 bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-white hover:text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:border-emerald-400 dark:bg-emerald-500 dark:text-zinc-950 dark:hover:bg-zinc-950 dark:hover:text-emerald-100 dark:focus:ring-offset-zinc-950"
          >
            + Scenario
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-500/30 dark:bg-violet-500/10">
        <div className="grid gap-3 xl:grid-cols-[minmax(240px,1.2fr)_minmax(180px,0.8fr)_150px_170px] xl:items-end">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-800 dark:text-violet-200">
              Website URL
            </label>
            <input
              value={websiteUrl}
              onChange={(event) => setWebsiteUrl(event.target.value)}
              className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-violet-600 dark:border-violet-500/30 dark:bg-zinc-950 dark:text-zinc-50"
              placeholder="https://example.com"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-800 dark:text-violet-200">
              Component
            </label>
            <input
              value={websiteComponent}
              onChange={(event) => setWebsiteComponent(event.target.value)}
              className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-violet-600 dark:border-violet-500/30 dark:bg-zinc-950 dark:text-zinc-50"
              placeholder="header, footer, login form"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-800 dark:text-violet-200">
              Coverage
            </label>
            <select
              value={websiteCoverage}
              onChange={(event) => setWebsiteCoverage(event.target.value)}
              className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 outline-none focus:border-violet-600 dark:border-violet-500/30 dark:bg-zinc-950 dark:text-zinc-50"
            >
              <option value="basic">Basic</option>
              <option value="standard">Standard</option>
              <option value="thorough">Thorough</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => void handleGenerateFromWebsite()}
            disabled={!canGenerateFromWebsite}
            className="inline-flex items-center justify-center rounded-xl border border-violet-700 bg-violet-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-white hover:text-violet-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500 dark:border-violet-300 dark:bg-violet-400 dark:text-zinc-950 dark:hover:bg-zinc-950 dark:hover:text-violet-100 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-400"
          >
            {generatingWebsite ? "Inspecting..." : "Generate from website"}
          </button>
        </div>
        {websiteGenerationNote ? (
          <p className="mt-3 text-xs font-medium text-violet-800 dark:text-violet-100">
            {websiteGenerationNote}
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-3 dark:border-sky-500/30 dark:bg-sky-500/10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-800 dark:text-sky-200">
            Bulk update
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,180px)_minmax(0,180px)_minmax(0,1fr)_170px] xl:items-end">
            <select
              value={bulkStatus}
              onChange={(event) =>
                setBulkStatus(event.target.value as ScenarioStatus | "")
              }
              className="min-w-0 rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 outline-none focus:border-sky-600 dark:border-sky-500/30 dark:bg-zinc-950 dark:text-zinc-50"
            >
              <option value="">Keep status</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
            <select
              value={bulkTagMode}
              onChange={(event) => setBulkTagMode(event.target.value as BulkTagMode)}
              className="min-w-0 rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 outline-none focus:border-sky-600 dark:border-sky-500/30 dark:bg-zinc-950 dark:text-zinc-50"
            >
              {bulkTagModes.map((mode) => (
                <option key={mode} value={mode}>
                  {bulkTagModeLabel(mode)}
                </option>
              ))}
            </select>
            <input
              value={bulkTags}
              onChange={(event) => setBulkTags(event.target.value)}
              className="min-w-0 rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-sky-600 dark:border-sky-500/30 dark:bg-zinc-950 dark:text-zinc-50"
              placeholder={
                bulkTagMode === "replace"
                  ? "New tags, blank clears"
                  : "Tags, comma separated"
              }
            />
            <button
              type="button"
              onClick={() => void handleBulkUpdate()}
              disabled={!canBulkUpdate}
              className="inline-flex min-w-0 items-center justify-center rounded-xl border border-sky-700 bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white hover:text-sky-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500 dark:border-sky-300 dark:bg-sky-400 dark:text-zinc-950 dark:hover:bg-zinc-950 dark:hover:text-sky-100 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-400 sm:col-span-2 xl:col-span-1"
            >
              {savingBulk ? "Updating..." : "Apply bulk update"}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800 dark:text-emerald-200">
            Suite builder
          </p>
          <div className="mt-3 grid max-w-3xl gap-3">
            <select
              value={targetSuiteId}
              onChange={(event) => setTargetSuiteId(event.target.value)}
              className="w-full min-w-0 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 outline-none focus:border-emerald-600 dark:border-emerald-500/30 dark:bg-zinc-950 dark:text-zinc-50"
            >
              <option value="">Existing suite</option>
              {suites.map((suite) => (
                <option key={suite.id} value={suite.id}>
                  {suite.name}
                </option>
              ))}
            </select>
            <input
              value={newSuiteName}
              onChange={(event) => setNewSuiteName(event.target.value)}
              className="w-full min-w-0 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-emerald-600 dark:border-emerald-500/30 dark:bg-zinc-950 dark:text-zinc-50"
              placeholder="Or new suite name"
            />
            <button
              type="button"
              onClick={() => void handleAddSelectedToSuite()}
              disabled={!selectedScenarios.length || savingSuite}
              className="inline-flex w-full min-w-0 items-center justify-center rounded-xl border border-zinc-950 bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white hover:text-zinc-950 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-950 dark:hover:text-white dark:disabled:border-zinc-700 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-400 sm:w-auto sm:justify-self-start"
            >
              {savingSuite ? "Saving..." : "Add to suite"}
            </button>
          </div>
          {newSuiteName.trim() ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
              <select
                value={newSuiteStatus}
                onChange={(event) =>
                  setNewSuiteStatus(event.target.value as ScenarioStatus)
                }
                className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 outline-none focus:border-emerald-600 dark:border-emerald-500/30 dark:bg-zinc-950 dark:text-zinc-50"
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ))}
              </select>
              <input
                value={newSuiteTags}
                onChange={(event) => setNewSuiteTags(event.target.value)}
                className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-emerald-600 dark:border-emerald-500/30 dark:bg-zinc-950 dark:text-zinc-50"
                placeholder="Suite tags, comma separated"
              />
            </div>
          ) : null}
        </div>
      </section>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="overflow-x-auto">
          <div className="min-w-[1240px]">
            <div className="grid grid-cols-[28px_minmax(220px,1.3fr)_128px_minmax(180px,0.8fr)_minmax(160px,0.8fr)_132px_132px_170px] items-center gap-3 border-b border-zinc-100 bg-zinc-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-400">
              <label className="flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleVisibleScenarios}
                  className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                  aria-label="Select visible scenarios"
                />
              </label>
              <span>Scenario</span>
              <span>Status</span>
              <span>Tags</span>
              <span>Suites</span>
              <span>Created</span>
              <span>Updated</span>
              <span>Actions</span>
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {loading ? (
                <div className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  Loading scenarios...
                </div>
              ) : sortedScenarios.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  {scenarios.length
                    ? "No scenarios match the current filters."
                    : "No scenarios yet. Create one to start recording."}
                </div>
              ) : (
                sortedScenarios.map((scenario) => {
                  const scenarioSuites = scenarioSuitesById.get(scenario.id) ?? [];
                  return (
                    <div
                      key={scenario.id}
                      className="grid grid-cols-[28px_minmax(220px,1.3fr)_128px_minmax(180px,0.8fr)_minmax(160px,0.8fr)_132px_132px_170px] items-center gap-3 px-4 py-3 transition hover:bg-emerald-50/60 dark:hover:bg-emerald-500/10"
                    >
                  <label className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(scenario.id)}
                      onChange={() => toggleScenario(scenario.id)}
                      className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                      aria-label={`Select ${scenario.name}`}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => navigateToScenario(scenario.id)}
                    className="min-w-0 text-left focus:outline-none"
                  >
                    <span className="block truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                      {scenario.name}
                    </span>
                    {scenario.description ? (
                      <span className="mt-1 block line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                        {scenario.description}
                      </span>
                    ) : (
                      <span className="mt-1 block text-xs text-zinc-400">
                        No description yet
                      </span>
                    )}
                  </button>
                  <select
                    value={scenario.status}
                    onChange={(event) =>
                      void patchScenario(scenario, {
                        status: event.target.value as ScenarioStatus,
                      })
                    }
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold capitalize outline-none focus:ring-2 focus:ring-emerald-500 ${statusTone[scenario.status]}`}
                  >
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {statusLabel(status)}
                      </option>
                    ))}
                  </select>
                  <input
                    value={tagDrafts[scenario.id] ?? scenario.tags.join(", ")}
                    onChange={(event) =>
                      setTagDrafts((current) => ({
                        ...current,
                        [scenario.id]: event.target.value,
                      }))
                    }
                    onBlur={() => void saveScenarioTags(scenario)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }
                    }}
                    className="min-w-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-800 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                    placeholder="tag1, tag2"
                  />
                  <div className="flex min-w-0 flex-wrap gap-1">
                    {scenarioSuites.length ? (
                      scenarioSuites.map((suite) => (
                        <span
                          key={suite.id}
                          className="max-w-full truncate rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-100"
                        >
                          {suite.name}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-full border border-zinc-200 px-2 py-1 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                        Unassigned
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {formatDate(scenario.createdAt)}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {formatDate(scenario.updatedAt)}
                  </span>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => navigateToScenario(scenario.id)}
                      className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs font-semibold text-zinc-800 transition hover:border-zinc-950 hover:bg-zinc-950 hover:text-white dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-100 dark:hover:bg-zinc-100 dark:hover:text-zinc-950"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteScenario(scenario)}
                      className="rounded-lg border border-rose-200 bg-white px-2 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-600 hover:text-white dark:border-rose-500/30 dark:bg-zinc-900 dark:text-rose-200 dark:hover:bg-rose-500 dark:hover:text-white"
                    >
                      Move to bin
                    </button>
                  </div>
                </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
