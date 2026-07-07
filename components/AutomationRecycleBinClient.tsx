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

function recycleBinItemKey(item: Pick<RecycleBinItem, "id" | "type">) {
  return `${item.type}:${item.id}`;
}

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
  const [selectedItemKeys, setSelectedItemKeys] = useState<Set<string>>(new Set());
  const [restoringBulk, setRestoringBulk] = useState(false);
  const [purgingBulk, setPurgingBulk] = useState(false);

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
  const selectedItems = useMemo(
    () => items.filter((item) => selectedItemKeys.has(recycleBinItemKey(item))),
    [items, selectedItemKeys],
  );
  const allVisibleSelected =
    visibleItems.length > 0 &&
    visibleItems.every((item) => selectedItemKeys.has(recycleBinItemKey(item)));
  const canBulkRestore = selectedItems.length > 0 && !restoringBulk && !purgingBulk;
  const canBulkPurge = selectedItems.length > 0 && !restoringBulk && !purgingBulk;

  useEffect(() => {
    const availableKeys = new Set(items.map((item) => recycleBinItemKey(item)));
    setSelectedItemKeys((current) => {
      const next = new Set([...current].filter((key) => availableKeys.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [items]);

  const toggleItem = (item: RecycleBinItem) => {
    const itemKey = recycleBinItemKey(item);
    setSelectedItemKeys((current) => {
      const next = new Set(current);
      if (next.has(itemKey)) {
        next.delete(itemKey);
      } else {
        next.add(itemKey);
      }
      return next;
    });
  };

  const toggleVisibleItems = () => {
    setSelectedItemKeys((current) => {
      const next = new Set(current);
      for (const item of visibleItems) {
        const itemKey = recycleBinItemKey(item);
        if (allVisibleSelected) {
          next.delete(itemKey);
        } else {
          next.add(itemKey);
        }
      }
      return next;
    });
  };

  const restoreItem = async (item: RecycleBinItem) => {
    const previous = items;
    const itemKey = recycleBinItemKey(item);
    setItems((current) =>
      current.filter((candidate) => recycleBinItemKey(candidate) !== itemKey),
    );
    setSelectedItemKeys((current) => {
      const next = new Set(current);
      next.delete(itemKey);
      return next;
    });
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
    const itemKey = recycleBinItemKey(item);
    setItems((current) =>
      current.filter((candidate) => recycleBinItemKey(candidate) !== itemKey),
    );
    setSelectedItemKeys((current) => {
      const next = new Set(current);
      next.delete(itemKey);
      return next;
    });
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

  const restoreSelectedItems = async () => {
    if (!selectedItems.length || restoringBulk) return;

    const selectedKeys = new Set(selectedItems.map((item) => recycleBinItemKey(item)));
    const previous = items;
    setRestoringBulk(true);
    setItems((current) => current.filter((item) => !selectedKeys.has(recycleBinItemKey(item))));
    setSelectedItemKeys((current) => {
      const next = new Set(current);
      for (const key of selectedKeys) {
        next.delete(key);
      }
      return next;
    });

    try {
      await Promise.all(
        selectedItems.map(async (item) => {
          const response = await fetch(recycleBinApi, {
            body: JSON.stringify({ id: item.id, type: item.type }),
            headers: { "Content-Type": "application/json" },
            method: "PATCH",
          });
          const data = await readApiJson(response);
          if (!response.ok) {
            throw new Error(data.error || "Could not restore selected items.");
          }
        }),
      );
      setError(
        `${selectedItems.length} deleted item${
          selectedItems.length === 1 ? "" : "s"
        } restored.`,
      );
    } catch (restoreError) {
      setItems(previous);
      setSelectedItemKeys(selectedKeys);
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : "Could not restore selected items.",
      );
    } finally {
      setRestoringBulk(false);
    }
  };

  const purgeSelectedItems = async () => {
    if (!selectedItems.length || purgingBulk) return;

    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            `Permanently delete ${selectedItems.length} selected item${
              selectedItems.length === 1 ? "" : "s"
            }? This cannot be undone.`,
          );
    if (!confirmed) return;

    const selectedKeys = new Set(selectedItems.map((item) => recycleBinItemKey(item)));
    const previous = items;
    setPurgingBulk(true);
    setItems((current) => current.filter((item) => !selectedKeys.has(recycleBinItemKey(item))));
    setSelectedItemKeys((current) => {
      const next = new Set(current);
      for (const key of selectedKeys) {
        next.delete(key);
      }
      return next;
    });

    try {
      await Promise.all(
        selectedItems.map(async (item) => {
          const response = await fetch(recycleBinApi, {
            body: JSON.stringify({ id: item.id, type: item.type }),
            headers: { "Content-Type": "application/json" },
            method: "DELETE",
          });
          const data = await readApiJson(response);
          if (!response.ok) {
            throw new Error(data.error || "Could not permanently delete selected items.");
          }
        }),
      );
      setError(
        `${selectedItems.length} deleted item${
          selectedItems.length === 1 ? "" : "s"
        } permanently deleted.`,
      );
    } catch (purgeError) {
      setItems(previous);
      setSelectedItemKeys(selectedKeys);
      setError(
        purgeError instanceof Error
          ? purgeError.message
          : "Could not permanently delete selected items.",
      );
    } finally {
      setPurgingBulk(false);
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
        {!loading && visibleItems.length ? (
          <div className="flex flex-col gap-3 border-b border-zinc-100 bg-zinc-50 px-4 py-3 text-xs font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-300 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleVisibleItems}
                className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                aria-label="Select visible deleted items"
              />
              <span>Select visible</span>
            </label>
            <span>
              {visibleItems.length} deleted item{visibleItems.length === 1 ? "" : "s"}
            </span>
          </div>
        ) : null}
        {selectedItems.length ? (
          <div className="border-b border-emerald-200 bg-emerald-50/95 px-4 py-3 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-950/90">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-50">
                  {selectedItems.length} selected
                </p>
                <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-200">
                  Restore selected items or permanently delete them.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void restoreSelectedItems()}
                  disabled={!canBulkRestore}
                  className="inline-flex min-h-[40px] min-w-[128px] items-center justify-center rounded-xl border border-emerald-700 bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white hover:text-emerald-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500 dark:border-emerald-300 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-zinc-950 dark:hover:text-emerald-100 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-400"
                >
                  {restoringBulk ? "Restoring..." : "Restore selected"}
                </button>
                <button
                  type="button"
                  onClick={() => void purgeSelectedItems()}
                  disabled={!canBulkPurge}
                  className="inline-flex min-h-[40px] min-w-[156px] items-center justify-center rounded-xl border border-rose-600 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-600 hover:text-white disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500 dark:border-rose-400 dark:bg-zinc-950 dark:text-rose-200 dark:hover:bg-rose-500 dark:hover:text-white dark:disabled:border-zinc-700 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-400"
                >
                  {purgingBulk ? "Deleting..." : "Delete selected forever"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedItemKeys(new Set())}
                  className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-500"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        ) : null}
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
                className="grid gap-3 px-4 py-3 sm:grid-cols-[28px_96px_minmax(0,1fr)_150px_180px] sm:items-center"
              >
                <label className="flex items-center sm:justify-center">
                  <input
                    type="checkbox"
                    checked={selectedItemKeys.has(recycleBinItemKey(item))}
                    onChange={() => toggleItem(item)}
                    className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                    aria-label={`Select ${item.name}`}
                  />
                </label>
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
