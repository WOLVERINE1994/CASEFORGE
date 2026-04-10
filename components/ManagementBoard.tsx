"use client";

import { useMemo, useState } from "react";
import {
  priorityLabels,
  workflowStatusLabels,
  type TestCasePriority,
  type TestCaseRow,
  type TestCaseWorkflowStatus,
} from "../utils/workspace";

const workflowColumns: TestCaseWorkflowStatus[] = [
  "backlog",
  "todo",
  "in-progress",
  "blocked",
  "done",
];

const priorityTone: Record<TestCasePriority, string> = {
  highest:
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
  high: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  medium:
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
  low: "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
};

type Props = {
  rows: TestCaseRow[];
  projectKey: string;
  sprintName: string;
  releaseName: string;
  teamName: string;
  onFocusRow: (rowId: string) => void;
};

export default function ManagementBoard({
  rows,
  projectKey,
  sprintName,
  releaseName,
  teamName,
  onFocusRow,
}: Props) {
  const [statusFilter, setStatusFilter] = useState<"all" | TestCaseWorkflowStatus>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | TestCasePriority>("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");

  const assigneeOptions = useMemo(
    () =>
      Array.from(
        new Set(rows.map((row) => row.assignee?.trim()).filter(Boolean) as string[])
      ).sort((left, right) => left.localeCompare(right)),
    [rows]
  );

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const matchesStatus =
          statusFilter === "all" || (row.workflowStatus ?? "backlog") === statusFilter;
        const matchesPriority =
          priorityFilter === "all" || (row.priority ?? "medium") === priorityFilter;
        const matchesAssignee =
          assigneeFilter === "all" ||
          (assigneeFilter === "unassigned"
            ? !row.assignee?.trim()
            : (row.assignee?.trim() ?? "") === assigneeFilter);

        return matchesStatus && matchesPriority && matchesAssignee;
      }),
    [rows, statusFilter, priorityFilter, assigneeFilter]
  );

  const groupedRows = workflowColumns.map((status) => ({
    status,
    rows: filteredRows.filter((row) => (row.workflowStatus ?? "backlog") === status),
  }));
  const doneCount = filteredRows.filter(
    (row) => (row.workflowStatus ?? "backlog") === "done"
  ).length;
  const blockedCount = filteredRows.filter(
    (row) => (row.workflowStatus ?? "backlog") === "blocked"
  ).length;
  const unassignedCount = filteredRows.filter((row) => !row.assignee?.trim()).length;
  const completionRate =
    filteredRows.length === 0 ? 0 : Math.round((doneCount / filteredRows.length) * 100);

  return (
    <section className="overflow-hidden rounded-[32px] border border-white/80 bg-white/90 shadow-[0_30px_70px_-40px_rgba(15,23,42,0.38)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
      <div className="border-b border-zinc-200/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.9)_0%,_rgba(246,249,248,0.96)_100%)] px-6 py-5 dark:border-zinc-800 dark:bg-[linear-gradient(180deg,_rgba(24,24,27,0.92)_0%,_rgba(17,17,19,0.98)_100%)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
              Delivery Board
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              Manage execution like a test operations board
            </h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Track ownership, urgency, and progress across your manual cases.
            </p>
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                    {(projectKey || "NO-KEY").trim()} | {(sprintName || "No sprint").trim()} |{" "}
              {(releaseName || "No release").trim()} | {(teamName || "No team").trim()}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[22px] border border-zinc-200/80 bg-white/80 px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                Completion
              </p>
              <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {completionRate}%
              </p>
            </div>
            <div className="rounded-[22px] border border-zinc-200/80 bg-white/80 px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                Blocked
              </p>
              <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {blockedCount}
              </p>
            </div>
            <div className="rounded-[22px] border border-zinc-200/80 bg-white/80 px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                Unassigned
              </p>
              <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {unassignedCount}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-zinc-200/80 px-5 py-4 dark:border-zinc-800">
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto]">
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as "all" | TestCaseWorkflowStatus)
            }
            className="min-h-[46px] rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
          >
            <option value="all">All Statuses</option>
            {workflowColumns.map((status) => (
              <option key={status} value={status}>
                {workflowStatusLabels[status]}
              </option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) =>
              setPriorityFilter(e.target.value as "all" | TestCasePriority)
            }
            className="min-h-[46px] rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
          >
            <option value="all">All Priorities</option>
            <option value="highest">Highest</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="min-h-[46px] rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
          >
            <option value="all">All Assignees</option>
            <option value="unassigned">Unassigned</option>
            {assigneeOptions.map((assignee) => (
              <option key={assignee} value={assignee}>
                {assignee}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              setPriorityFilter("all");
              setAssigneeFilter("all");
            }}
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Reset Filters
          </button>
        </div>
      </div>

      <div className="overflow-x-auto px-5 py-5">
        <div className="grid min-w-[1200px] gap-4 lg:grid-cols-5">
          {groupedRows.map((column) => (
            <div
              key={column.status}
              className="rounded-[26px] border border-zinc-200/80 bg-[linear-gradient(180deg,_rgba(250,250,249,0.92)_0%,_rgba(244,247,246,0.98)_100%)] p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {workflowStatusLabels[column.status]}
                </p>
                <span className="rounded-full border border-zinc-200/80 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                  {column.rows.length}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {column.rows.length === 0 ? (
                  <div className="rounded-[20px] border border-dashed border-zinc-200 px-3 py-5 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                    No cases in this lane yet.
                  </div>
                ) : (
                  column.rows.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => onFocusRow(row.id)}
                      className="w-full rounded-[22px] border border-white/80 bg-white/95 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_18px_30px_-24px_rgba(15,23,42,0.28)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:hover:border-zinc-700"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                            {row.id}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            {row.title || "Untitled test case"}
                          </p>
                        </div>
                        <span
                          className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                            priorityTone[row.priority ?? "medium"]
                          }`}
                        >
                          {priorityLabels[row.priority ?? "medium"]}
                        </span>
                      </div>

                      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                        Owner: {row.assignee?.trim() || "Unassigned"}
                      </p>

                      {row.labels && row.labels.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {row.labels.slice(0, 3).map((label) => (
                            <span
                              key={label}
                              className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-medium text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300"
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
