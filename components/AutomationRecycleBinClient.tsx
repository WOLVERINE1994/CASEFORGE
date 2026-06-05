"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type RecycleBinItemType = "scenario" | "action" | "suite" | "report";

type RecycleBinItem = {
  id: string;
  type: RecycleBinItemType;
  name: string;
  description: string;
  deletedAt: string;
  previousStatus?: string | null;
  updatedAt: string;
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function AutomationRecycleBinClient({ projectKey }: Props) {
  const [items, setItems] = useState<RecycleBinItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<RecycleBinItemType | "all">("all");

  const recycleBinApi = `/api/automation/projects/${encodeURIComponent(projectKey)}/recycle-bin`;

  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(recycleBinApi, { cache: "no-store" });
      const data = await readApiJson<{ items?: RecycleBinItem[] }>(response);
      if (!response.ok) throw new Error(data.error || "Could not load recycle bin.");
      setItems(data.items ?? []);
      setError("");
    } catch (loadError) {
      setItems([]);
      setError(loadError instanceof Error ? loadError.message : "Could not load recycle bin.");
    } finally {
      setLoading(false);
    }
  }, [recycleBinApi]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const visibleItems = useMemo(
    () => items.filter((item) => filter === "all" || item.type === filter),
    [filter, items],
  );

  const restoreItem = async (item: RecycleBinItem) => {
    const previous = items;
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    try {
      const response = await fetch(recycleBinApi, {
        body: JSON.stringify({ id: item.id, type: item.type }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.error || "Could not restore item.");
    } catch (restoreError) {
      setItems(previous);
      setError(restoreError instanceof Error ? restoreError.message : "Could not restore item.");
    }
  };

  const purgeItem = async (item: RecycleBinItem) => {
    if (typeof window !== "undefined" && !window.confirm(`Permanently delete "${item.name}"?`)) return;
    const previous = items;
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    try {
      const response = await fetch(recycleBinApi, {
        body: JSON.stringify({ id: item.id, type: item.type }),
        headers: { "Content-Type": "application/json" },
        method: "DELETE",
      });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.error || "Could not permanently delete item.");
    } catch (purgeError) {
      setItems(previous);
      setError(purgeError instanceof Error ? purgeError.message : "Could not permanently delete item.");
    }
  };

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-col gap-3 border-b border-zinc-200 bg-white pb-4 dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
            Recycle Bin
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Deleted scenarios and actions are held here before permanent removal.
          </p>
          {error ? (
            <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
              {error}
            </p>
          ) : null}
        </div>
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value as RecycleBinItemType | "all")}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 sm:w-48"
        >
          <option value="all">All deleted</option>
          <option value="scenario">Scenarios</option>
          <option value="action">Actions</option>
          <option value="suite">Suites</option>
          <option value="report">Reports</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Loading recycle bin...
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
              {items.length ? "No deleted items match this filter." : "Recycle bin is empty."}
            </div>
          ) : (
            visibleItems.map((item) => (
              <div
                key={`${item.type}-${item.id}`}
                className="grid gap-3 px-4 py-3 sm:grid-cols-[96px_minmax(0,1fr)_150px_180px] sm:items-center"
              >
                <span className="w-fit rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-semibold capitalize text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                  {item.type}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {item.name}
                  </p>
                  <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {item.description || item.previousStatus || "Deleted automation asset"}
                  </p>
                </div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {formatDate(item.deletedAt)}
                </span>
                <div className="flex gap-2 sm:justify-end">
                  <button
                    type="button"
                    onClick={() => void restoreItem(item)}
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => void purgeItem(item)}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
                  >
                    Delete forever
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Suites and Reports are reserved in this view and will appear once they have persisted records.
      </p>
    </div>
  );
}
