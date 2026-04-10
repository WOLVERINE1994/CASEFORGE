"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useProjectIssueState } from "./ProjectIssueStateContext";
import { useProjectRouteMetrics } from "./ProjectRouteMetricsContext";

type IssueType =
  | "epic"
  | "story"
  | "task"
  | "bug"
  | "test-case"
  | "test-plan"
  | "test-run";

type IssueStatus =
  | "backlog"
  | "todo"
  | "in-progress"
  | "blocked"
  | "in-review"
  | "done";

type IssuePriority = "highest" | "high" | "medium" | "low";

type IssueRecord = {
  id: string;
  projectId: string;
  projectKey: string;
  issueKey: string;
  issueNumber: number;
  type: IssueType;
  summary: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  reporterId: string | null;
  assigneeId: string | null;
  sprintId: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
};

type UserRecord = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: "admin" | "manager" | "tester" | "reviewer";
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
};

type ProjectRecord = {
  id: string;
  name: string;
  projectKey?: string;
  sprintName?: string;
  releaseName?: string;
  teamName?: string;
};

type ApiEnvelope = {
  issues?: IssueRecord[];
  issue?: IssueRecord;
  users?: UserRecord[];
  projects?: ProjectRecord[];
  error?: string;
  status?: string;
};

const workflowColumns: IssueStatus[] = [
  "backlog",
  "todo",
  "in-progress",
  "blocked",
  "in-review",
  "done",
];

const statusLabels: Record<IssueStatus, string> = {
  backlog: "Backlog",
  todo: "To Do",
  "in-progress": "In Progress",
  blocked: "Blocked",
  "in-review": "In Review",
  done: "Done",
};

const statusTone: Record<IssueStatus, string> = {
  backlog:
    "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
  todo: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
  "in-progress":
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  blocked:
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
  "in-review":
    "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300",
  done: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
};

const priorityTone: Record<IssuePriority, string> = {
  highest:
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
  high: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  medium:
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
  low: "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
};

type Props = {
  projectKey: string;
  embedded?: boolean;
};

export default function ProjectBoardClient({
  projectKey,
  embedded = false,
}: Props) {
  const sharedIssueState = useProjectIssueState();
  const metrics = useProjectRouteMetrics();
  const [localIssues, setLocalIssues] = useState<IssueRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [serviceState, setServiceState] = useState<"ready" | "scaffolded">(
    "ready"
  );
  const [notice, setNotice] = useState<{
    tone: "info" | "success" | "error";
    text: string;
  } | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | IssueStatus>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | IssuePriority>("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [projectMeta, setProjectMeta] = useState<ProjectRecord | null>(null);
  const issues = sharedIssueState?.issues ?? localIssues;
  const setIssues = useCallback(
    (
      nextIssues:
        | IssueRecord[]
        | ((currentIssues: IssueRecord[]) => IssueRecord[])
    ) => {
      const currentIssues = sharedIssueState?.issues ?? localIssues;
      const resolvedIssues =
        typeof nextIssues === "function" ? nextIssues(currentIssues) : nextIssues;

      if (sharedIssueState) {
        sharedIssueState.setIssues(resolvedIssues);
      } else {
        setLocalIssues(resolvedIssues);
      }
    },
    [localIssues, sharedIssueState]
  );

  const showNotice = useCallback(
    (tone: "info" | "success" | "error", text: string) => {
      setNotice({ tone, text });
    },
    []
  );

  const userLookup = useMemo(
    () =>
      users.reduce<Record<string, UserRecord>>((accumulator, user) => {
        accumulator[user.id] = user;
        return accumulator;
      }, {}),
    [users]
  );

  const assigneeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          issues
            .map((issue) =>
              issue.assigneeId
                ? userLookup[issue.assigneeId]?.name ||
                  userLookup[issue.assigneeId]?.email ||
                  issue.assigneeId
                : ""
            )
            .filter(Boolean)
        )
      ).sort((left, right) => left.localeCompare(right)),
    [issues, userLookup]
  );

  const loadProjectMeta = useCallback(async () => {
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      const data = (await response.json()) as ApiEnvelope;

      if (!response.ok) {
        return;
      }

      const matchedProject =
        data.projects?.find(
          (project) =>
            project.projectKey?.toLowerCase() === projectKey.toLowerCase() ||
            project.id.toLowerCase() === projectKey.toLowerCase()
        ) ?? null;

      setProjectMeta(matchedProject);
    } catch (error) {
      console.error("Load project metadata error:", error);
    }
  }, [projectKey]);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);

    try {
      const response = await fetch("/api/users", { cache: "no-store" });
      const data = (await response.json()) as ApiEnvelope;

      if (response.status === 501 || data.status === "scaffolded") {
        setUsers([]);
        return;
      }

      if (!response.ok) {
        setUsers([]);
        return;
      }

      setUsers(Array.isArray(data.users) ? data.users.filter((user) => user.isActive) : []);
    } catch (error) {
      console.error("Load users error:", error);
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const loadIssues = useCallback(async () => {
    setLoadingIssues(true);

    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectKey)}/issues`,
        { cache: "no-store" }
      );
      const data = (await response.json()) as ApiEnvelope;

      if (response.status === 501 || data.status === "scaffolded") {
        setServiceState("scaffolded");
        setIssues([]);
        showNotice(
          "info",
          data.error ||
            "Issue persistence is scaffolded. Apply the latest migration to activate the live board."
        );
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || "Failed to load issues.");
      }

      setServiceState("ready");
      const nextIssues = Array.isArray(data.issues) ? data.issues : [];
      setIssues(nextIssues);
      metrics?.setIssueCount(nextIssues.length);
      setNotice(null);
    } catch (error) {
      console.error("Load board issues error:", error);
      showNotice("error", "Failed to load issues for the board.");
    } finally {
      setLoadingIssues(false);
    }
  }, [metrics, projectKey, setIssues, showNotice]);

  useEffect(() => {
    void loadProjectMeta();
    void loadUsers();
    void loadIssues();
  }, [loadIssues, loadProjectMeta, loadUsers]);

  const handleStatusUpdate = async (issueId: string, nextStatus: IssueStatus) => {
    try {
      const response = await fetch(`/api/issues/${encodeURIComponent(issueId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = (await response.json()) as ApiEnvelope;

      if (response.status === 501 || data.status === "scaffolded") {
        setServiceState("scaffolded");
        showNotice(
          "info",
          data.error ||
            "Issue updates are scaffolded. Apply the latest migration to activate the live board."
        );
        return;
      }

      if (!response.ok || !data.issue) {
        throw new Error(data.error || "Failed to update issue.");
      }

      setIssues((current) =>
        current.map((issue) => (issue.id === issueId ? data.issue as IssueRecord : issue))
      );
      showNotice("success", `${data.issue.issueKey} moved to ${statusLabels[nextStatus]}.`);
    } catch (error) {
      console.error("Board status update error:", error);
      showNotice("error", "Failed to update issue status from the board.");
    }
  };

  const handleAssigneeUpdate = async (issueId: string, nextAssigneeId: string) => {
    try {
      const response = await fetch(`/api/issues/${encodeURIComponent(issueId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ assigneeId: nextAssigneeId || null }),
      });
      const data = (await response.json()) as ApiEnvelope;

      if (response.status === 501 || data.status === "scaffolded") {
        setServiceState("scaffolded");
        showNotice(
          "info",
          data.error ||
            "Issue updates are scaffolded. Apply the latest migration to activate the live board."
        );
        return;
      }

      if (!response.ok || !data.issue) {
        throw new Error(data.error || "Failed to update issue.");
      }

      setIssues((current) =>
        current.map((issue) => (issue.id === issueId ? data.issue as IssueRecord : issue))
      );
      const assigneeLabel = nextAssigneeId
        ? userLookup[nextAssigneeId]?.name || userLookup[nextAssigneeId]?.email || "selected user"
        : "Unassigned";
      showNotice("success", `${data.issue.issueKey} is now assigned to ${assigneeLabel}.`);
    } catch (error) {
      console.error("Board assignee update error:", error);
      showNotice("error", "Failed to update issue assignee from the board.");
    }
  };

  const filteredIssues = useMemo(
    () =>
      issues.filter((issue) => {
        const matchesStatus = statusFilter === "all" || issue.status === statusFilter;
        const matchesPriority =
          priorityFilter === "all" || issue.priority === priorityFilter;
        const assigneeLabel = issue.assigneeId
          ? userLookup[issue.assigneeId]?.name ||
            userLookup[issue.assigneeId]?.email ||
            issue.assigneeId
          : "";
        const matchesAssignee =
          assigneeFilter === "all" ||
          (assigneeFilter === "unassigned"
            ? !issue.assigneeId
            : assigneeLabel === assigneeFilter);

        return matchesStatus && matchesPriority && matchesAssignee;
      }),
    [assigneeFilter, issues, priorityFilter, statusFilter, userLookup]
  );

  const groupedIssues = workflowColumns.map((status) => ({
    status,
    issues: filteredIssues.filter((issue) => issue.status === status),
  }));

  const doneCount = filteredIssues.filter((issue) => issue.status === "done").length;
  const blockedCount = filteredIssues.filter((issue) => issue.status === "blocked").length;
  const unassignedCount = filteredIssues.filter((issue) => !issue.assigneeId).length;
  const completionRate =
    filteredIssues.length === 0 ? 0 : Math.round((doneCount / filteredIssues.length) * 100);

  return (
    <main className={embedded ? "flex flex-col gap-6" : "min-h-screen bg-[linear-gradient(180deg,_#f6faf8_0%,_#eef4f1_100%)] px-6 py-8 text-zinc-950 dark:bg-[linear-gradient(180deg,_#09090b_0%,_#111827_100%)] dark:text-zinc-50"}>
      <div className={embedded ? "flex flex-col gap-6" : "mx-auto flex w-full max-w-7xl flex-col gap-6"}>
        <section className="rounded-[34px] border border-white/80 bg-white/92 px-8 py-8 shadow-[0_28px_70px_-40px_rgba(15,23,42,0.34)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/88">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                Project Board
              </p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">
                Live delivery board for {projectMeta?.name || projectKey}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
                This board now reads from the new issue service instead of local row metadata, so planning
                work starts behaving like a real Jira-style project board.
              </p>
              <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                {(projectMeta?.projectKey || projectKey || "NO-KEY").trim()} ·{" "}
                {(projectMeta?.sprintName || "No sprint").trim()} ·{" "}
                {(projectMeta?.releaseName || "No release").trim()} ·{" "}
                {(projectMeta?.teamName || "No team").trim()}
              </p>
            </div>
          </div>
        </section>

        {notice && (
          <section
            className={`rounded-[24px] border px-4 py-3 text-sm shadow-sm ${
              notice.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
                : notice.tone === "error"
                ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
                : "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200"
            }`}
          >
            {notice.text}
          </section>
        )}

        <section className="overflow-hidden rounded-[32px] border border-white/80 bg-white/90 shadow-[0_30px_70px_-40px_rgba(15,23,42,0.38)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
          <div className="border-b border-zinc-200/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.9)_0%,_rgba(246,249,248,0.96)_100%)] px-6 py-5 dark:border-zinc-800 dark:bg-[linear-gradient(180deg,_rgba(24,24,27,0.92)_0%,_rgba(17,17,19,0.98)_100%)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                  Delivery Summary
                </p>
                <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                  Manage issues across active workflow lanes
                </h2>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  Update status and ownership directly from the board.
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
            <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto_auto]">
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as "all" | IssueStatus)
                }
                className="min-h-[46px] rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              >
                <option value="all">All Statuses</option>
                {workflowColumns.map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status]}
                  </option>
                ))}
              </select>

              <select
                value={priorityFilter}
                onChange={(event) =>
                  setPriorityFilter(event.target.value as "all" | IssuePriority)
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
                onChange={(event) => setAssigneeFilter(event.target.value)}
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

              <button
                type="button"
                onClick={() => void loadIssues()}
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="overflow-x-auto px-5 py-5">
            {loadingIssues ? (
              <div className="rounded-[24px] border border-dashed border-zinc-200 px-5 py-8 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                Loading live board issues...
              </div>
            ) : filteredIssues.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-zinc-200 px-5 py-8 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                {serviceState === "scaffolded"
                  ? "The board UI is ready, but the database migration still needs to be applied."
                  : "No issues match the current filters yet."}
              </div>
            ) : (
              <div className="grid min-w-[1440px] gap-4 xl:grid-cols-6">
                {groupedIssues.map((column) => (
                  <div
                    key={column.status}
                    className="rounded-[26px] border border-zinc-200/80 bg-[linear-gradient(180deg,_rgba(250,250,249,0.92)_0%,_rgba(244,247,246,0.98)_100%)] p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {statusLabels[column.status]}
                      </p>
                      <span className="rounded-full border border-zinc-200/80 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                        {column.issues.length}
                      </span>
                    </div>

                    <div className="mt-4 space-y-3">
                      {column.issues.length === 0 ? (
                        <div className="rounded-[20px] border border-dashed border-zinc-200 px-3 py-5 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                          No issues in this lane yet.
                        </div>
                      ) : (
                        column.issues.map((issue) => (
                          <article
                            key={issue.id}
                            className="rounded-[22px] border border-white/80 bg-white/95 p-3 text-left shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                                  {issue.issueKey}
                                </p>
                                <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                  {issue.summary}
                                </p>
                              </div>
                              <span
                                className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${priorityTone[issue.priority]}`}
                              >
                                {issue.priority}
                              </span>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                              <span
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone[issue.status]}`}
                              >
                                {statusLabels[issue.status]}
                              </span>
                              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                                {issue.type}
                              </span>
                            </div>

                            {issue.description && (
                              <p className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                                {issue.description}
                              </p>
                            )}

                            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                              Owner:{" "}
                              <span className="font-medium text-zinc-700 dark:text-zinc-200">
                                {issue.assigneeId
                                  ? userLookup[issue.assigneeId]?.name ||
                                    userLookup[issue.assigneeId]?.email ||
                                    issue.assigneeId
                                  : "Unassigned"}
                              </span>
                            </p>

                            <div className="mt-4 space-y-3 border-t border-zinc-200/80 pt-3 dark:border-zinc-800">
                              <Link
                                href={`/projects/${encodeURIComponent(projectKey)}/issues?issueId=${encodeURIComponent(issue.id)}`}
                                className="inline-flex w-full items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                              >
                                Open Issue
                              </Link>

                              <div>
                                <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                                  Quick Status
                                </label>
                                <select
                                  value={issue.status}
                                  onChange={(event) =>
                                    void handleStatusUpdate(
                                      issue.id,
                                      event.target.value as IssueStatus
                                    )
                                  }
                                  className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                                >
                                  {workflowColumns.map((status) => (
                                    <option key={status} value={status}>
                                      {statusLabels[status]}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                                  Assignee
                                </label>
                                <select
                                  value={issue.assigneeId ?? ""}
                                  onChange={(event) =>
                                    void handleAssigneeUpdate(issue.id, event.target.value)
                                  }
                                  disabled={loadingUsers}
                                  className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                                >
                                  <option value="">
                                    {loadingUsers ? "Loading assignees..." : "Unassigned"}
                                  </option>
                                  {users.map((user) => (
                                    <option key={user.id} value={user.id}>
                                      {user.name} ({user.email})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </article>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
