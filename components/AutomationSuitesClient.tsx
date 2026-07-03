"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SuiteStatus = "draft" | "active" | "paused" | "archived";

type AutomationSuite = {
  id: string;
  name: string;
  description: string;
  status: SuiteStatus;
  tags: string[];
  scenarioIds: string[];
  createdAt: string;
  updatedAt: string;
};

type Props = {
  projectKey: string;
};

const statusOptions: SuiteStatus[] = ["draft", "active", "paused", "archived"];

const statusTone: Record<SuiteStatus, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-800",
  archived: "border-zinc-200 bg-zinc-100 text-zinc-700",
  draft: "border-amber-200 bg-amber-50 text-amber-800",
  paused: "border-sky-200 bg-sky-50 text-sky-800",
};

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

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not saved";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

async function readApiJson<T>(response: Response): Promise<T & { error?: string }> {
  const text = await response.text();
  if (!text.trim()) return {} as T & { error?: string };
  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    return {
      error: `Server returned an invalid response (${response.status || "unknown"}).`,
    } as T & { error?: string };
  }
}

function statusLabel(status: SuiteStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function AutomationSuitesClient({ projectKey }: Props) {
  const [suites, setSuites] = useState<AutomationSuite[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<SuiteStatus | "all">("all");
  const [newName, setNewName] = useState("");
  const [newTags, setNewTags] = useState("");
  const [newStatus, setNewStatus] = useState<SuiteStatus>("draft");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const encodedProjectKey = encodeURIComponent(projectKey);
  const suitesApi = `/api/automation/projects/${encodedProjectKey}/suites`;

  useEffect(() => {
    let cancelled = false;

    async function loadSuites() {
      try {
        setLoading(true);
        const response = await fetch(suitesApi, { cache: "no-store" });
        const data = await readApiJson<{
          error?: string;
          suites?: AutomationSuite[];
        }>(response);
        if (!response.ok) {
          throw new Error(data.error || "Could not load suites.");
        }
        if (!cancelled) {
          setSuites(data.suites ?? []);
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) {
          setSuites([]);
          setError(
            loadError instanceof Error ? loadError.message : "Could not load suites.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadSuites();
    return () => {
      cancelled = true;
    };
  }, [suitesApi]);

  const filteredSuites = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return suites
      .filter((suite) => {
        const matchesQuery =
          !normalizedQuery ||
          suite.name.toLowerCase().includes(normalizedQuery) ||
          suite.description.toLowerCase().includes(normalizedQuery) ||
          suite.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery));
        const matchesStatus =
          statusFilter === "all" || suite.status === statusFilter;
        return matchesQuery && matchesStatus;
      })
      .sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      );
  }, [query, statusFilter, suites]);

  const createSuite = async () => {
    const name = newName.trim();
    if (!name || saving) {
      setError("Suite name is required.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(suitesApi, {
        body: JSON.stringify({
          name,
          status: newStatus,
          tags: parseTags(newTags),
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
      setNewName("");
      setNewTags("");
      setNewStatus("draft");
      setError("");
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "Could not create suite.",
      );
    } finally {
      setSaving(false);
    }
  };

  const updateSuiteStatus = async (suite: AutomationSuite, status: SuiteStatus) => {
    const previous = suites;
    setSuites((current) =>
      current.map((item) => (item.id === suite.id ? { ...item, status } : item)),
    );
    try {
      const response = await fetch(`${suitesApi}/${encodeURIComponent(suite.id)}`, {
        body: JSON.stringify({ status }),
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
        current.map((item) => (item.id === suite.id ? data.suite! : item)),
      );
      setError("");
    } catch (updateError) {
      setSuites(previous);
      setError(
        updateError instanceof Error ? updateError.message : "Could not update suite.",
      );
    }
  };

  const deleteSuite = async (suite: AutomationSuite) => {
    const previous = suites;
    setSuites((current) => current.filter((item) => item.id !== suite.id));
    try {
      const response = await fetch(`${suitesApi}/${encodeURIComponent(suite.id)}`, {
        method: "DELETE",
      });
      const data = await readApiJson<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(data.error || "Could not move suite to recycle bin.");
      }
      setError("");
    } catch (deleteError) {
      setSuites(previous);
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not move suite to recycle bin.",
      );
    }
  };

  return (
    <div className="mt-5 space-y-4">
      <section className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_160px_minmax(180px,0.8fr)_150px] lg:items-end">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800 dark:text-emerald-200">
              Suite name
            </label>
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-emerald-600 dark:border-emerald-500/30 dark:bg-zinc-950 dark:text-zinc-50"
              placeholder="Regression smoke suite"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800 dark:text-emerald-200">
              Status
            </label>
            <select
              value={newStatus}
              onChange={(event) => setNewStatus(event.target.value as SuiteStatus)}
              className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-emerald-600 dark:border-emerald-500/30 dark:bg-zinc-950 dark:text-zinc-50"
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800 dark:text-emerald-200">
              Tags
            </label>
            <input
              value={newTags}
              onChange={(event) => setNewTags(event.target.value)}
              className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-emerald-600 dark:border-emerald-500/30 dark:bg-zinc-950 dark:text-zinc-50"
              placeholder="release, smoke"
            />
            <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-200">
              Scenarios with matching tags join automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void createSuite()}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-xl border border-emerald-700 bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-white hover:text-emerald-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500 dark:border-emerald-400 dark:bg-emerald-500 dark:text-zinc-950 dark:hover:bg-zinc-950 dark:hover:text-emerald-100"
          >
            {saving ? "Creating..." : "+ Suite"}
          </button>
        </div>
        {error ? (
          <p className="mt-3 text-xs font-medium text-amber-700 dark:text-amber-300">
            {error}
          </p>
        ) : null}
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
          placeholder="Search suites"
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as SuiteStatus | "all")}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="all">All statuses</option>
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {statusLabel(status)}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="grid gap-3 border-b border-zinc-100 bg-zinc-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-400 lg:grid-cols-[minmax(220px,1.2fr)_130px_110px_minmax(160px,0.8fr)_132px_132px_132px]">
          <span>Suite</span>
          <span>Status</span>
          <span>Scenarios</span>
          <span>Tags</span>
          <span>Created</span>
          <span>Updated</span>
          <span>Actions</span>
        </div>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Loading suites...
            </div>
          ) : filteredSuites.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
              {suites.length ? "No suites match the current filters." : "No suites yet. Create one above or select scenarios from the Scenarios tab."}
            </div>
          ) : (
            filteredSuites.map((suite) => (
              <div
                key={suite.id}
                className="grid gap-3 px-4 py-3 transition hover:bg-emerald-50/60 dark:hover:bg-emerald-500/10 lg:grid-cols-[minmax(220px,1.2fr)_130px_110px_minmax(160px,0.8fr)_132px_132px_132px] lg:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {suite.name}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {suite.description || "No description yet"}
                  </p>
                </div>
                <select
                  value={suite.status}
                  onChange={(event) =>
                    void updateSuiteStatus(suite, event.target.value as SuiteStatus)
                  }
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold capitalize outline-none focus:ring-2 focus:ring-emerald-500 ${statusTone[suite.status]}`}
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {statusLabel(status)}
                    </option>
                  ))}
                </select>
                <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                  {suite.scenarioIds.length}
                </span>
                <div className="flex min-w-0 flex-wrap gap-1">
                  {suite.tags.length ? (
                    suite.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-zinc-200 px-2 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                      >
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-zinc-400">No tags</span>
                  )}
                </div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {formatDate(suite.createdAt)}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {formatDate(suite.updatedAt)}
                </span>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Link
                    href={`/projects/${encodedProjectKey}/automation/scenarios`}
                    className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs font-semibold text-zinc-800 transition hover:border-zinc-950 hover:bg-zinc-950 hover:text-white dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-100 dark:hover:bg-zinc-100 dark:hover:text-zinc-950"
                  >
                    Manage
                  </Link>
                  <button
                    type="button"
                    onClick={() => void deleteSuite(suite)}
                    className="rounded-lg border border-rose-200 bg-white px-2 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-600 hover:text-white dark:border-rose-500/30 dark:bg-zinc-900 dark:text-rose-200 dark:hover:bg-rose-500 dark:hover:text-white"
                  >
                    Move to bin
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
