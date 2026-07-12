"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useProjectIssueState } from "./ProjectIssueStateContext";
import { useProjectRouteMetrics } from "./ProjectRouteMetricsContext";
import { useActiveReviewerSession } from "./useActiveReviewerSession";
import { formatUtcDateTime } from "../utils/date-format";

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
  createdAt: string;
  updatedAt: string;
};

type LinkedTestCaseRecord = {
  id: string;
  title: string;
  type: string;
  issueId?: string;
  issueKey?: string;
  priority?: string;
  workflowStatus?: string;
};

type ProjectRecord = {
  id: string;
  projectKey?: string;
  rows?: LinkedTestCaseRecord[];
};

type ApiEnvelope = {
  issues?: IssueRecord[];
  issue?: IssueRecord;
  users?: UserRecord[];
  projects?: ProjectRecord[];
  comments?: CommentRecord[];
  comment?: CommentRecord;
  activity?: ActivityRecord[];
  error?: string;
  status?: string;
};

type CommentRecord = {
  id: string;
  issueId: string;
  authorId: string;
  authorName: string;
  authorEmail: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

type ActivityRecord = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  beforeJson: unknown;
  afterJson: unknown;
  createdAt: string;
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

type SelectedIssueDraft = {
  summary: string;
  description: string;
  type: IssueType;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeId: string;
};

const issueSearchFields = (issue: IssueRecord, assigneeLabel: string) =>
  [
    issue.id,
    issue.issueKey,
    issue.summary,
    issue.description,
    issue.type,
    issue.status,
    issue.priority,
    assigneeLabel,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

export default function ProjectIssuesClient({
  projectKey,
  embedded = false,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const metrics = useProjectRouteMetrics();
  const sharedIssueState = useProjectIssueState();
  const activeReviewerSession = useActiveReviewerSession();
  const [localIssues, setLocalIssues] = useState<IssueRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [projectRows, setProjectRows] = useState<LinkedTestCaseRecord[]>([]);
  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [activity, setActivity] = useState<ActivityRecord[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingProjectRows, setLoadingProjectRows] = useState(true);
  const [loadingComments, setLoadingComments] = useState(false);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [creatingComment, setCreatingComment] = useState(false);
  const [notice, setNotice] = useState<{
    tone: "info" | "success" | "error";
    text: string;
  } | null>(null);
  const [serviceState, setServiceState] = useState<"ready" | "scaffolded">(
    "ready"
  );
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<IssueType>("task");
  const [status, setStatus] = useState<IssueStatus>("backlog");
  const [priority, setPriority] = useState<IssuePriority>("medium");
  const [assigneeId, setAssigneeId] = useState("");
  const [commentAuthorId, setCommentAuthorId] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [savingSelectedIssue, setSavingSelectedIssue] = useState(false);
  const [selectedIssueDraft, setSelectedIssueDraft] =
    useState<SelectedIssueDraft | null>(null);
  const [issueSearchQuery, setIssueSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<IssueStatus | "">("");
  const [priorityFilter, setPriorityFilter] = useState<IssuePriority | "">("");
  const focusedIssueId = searchParams.get("issueId");
  const cameFromRelease = searchParams.get("from") === "release";
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
  const filteredIssues = useMemo(() => {
    const normalizedSearch = issueSearchQuery.trim().toLowerCase();

    return issues.filter((issue) => {
      if (statusFilter && issue.status !== statusFilter) {
        return false;
      }

      if (priorityFilter && issue.priority !== priorityFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const assigneeLabel = issue.assigneeId
        ? userLookup[issue.assigneeId]?.name ||
          userLookup[issue.assigneeId]?.email ||
          issue.assigneeId
        : "unassigned";

      return issueSearchFields(issue, assigneeLabel).includes(normalizedSearch);
    });
  }, [issueSearchQuery, issues, priorityFilter, statusFilter, userLookup]);
  const selectedIssue = useMemo(
    () => issues.find((issue) => issue.id === focusedIssueId) ?? null,
    [focusedIssueId, issues]
  );
  const linkedCases = useMemo(() => {
    if (!selectedIssue) {
      return [];
    }

    return projectRows.filter(
      (row) =>
        row.issueId === selectedIssue.id ||
        (row.issueKey && row.issueKey === selectedIssue.issueKey)
    );
  }, [projectRows, selectedIssue]);
  const isSelectedIssueDirty = useMemo(() => {
    if (!selectedIssue || !selectedIssueDraft) {
      return false;
    }

    return (
      selectedIssue.summary !== selectedIssueDraft.summary ||
      selectedIssue.description !== selectedIssueDraft.description ||
      selectedIssue.type !== selectedIssueDraft.type ||
      selectedIssue.status !== selectedIssueDraft.status ||
      selectedIssue.priority !== selectedIssueDraft.priority ||
      (selectedIssue.assigneeId ?? "") !== selectedIssueDraft.assigneeId
    );
  }, [selectedIssue, selectedIssueDraft]);

  useEffect(() => {
    const nextSearch = searchParams.get("search") ?? "";
    const nextStatus = searchParams.get("status");
    const nextPriority = searchParams.get("priority");

    setIssueSearchQuery(nextSearch);
    setStatusFilter(
      nextStatus === "backlog" ||
        nextStatus === "todo" ||
        nextStatus === "in-progress" ||
        nextStatus === "blocked" ||
        nextStatus === "in-review" ||
        nextStatus === "done"
        ? nextStatus
        : ""
    );
    setPriorityFilter(
      nextPriority === "highest" ||
        nextPriority === "high" ||
        nextPriority === "medium" ||
        nextPriority === "low"
        ? nextPriority
        : ""
    );
  }, [searchParams]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams.toString());

    if (focusedIssueId) {
      nextParams.set("issueId", focusedIssueId);
    } else {
      nextParams.delete("issueId");
    }

    if (issueSearchQuery.trim()) {
      nextParams.set("search", issueSearchQuery.trim());
    } else {
      nextParams.delete("search");
    }

    if (statusFilter) {
      nextParams.set("status", statusFilter);
    } else {
      nextParams.delete("status");
    }

    if (priorityFilter) {
      nextParams.set("priority", priorityFilter);
    } else {
      nextParams.delete("priority");
    }

    const currentQuery = searchParams.toString();
    const nextQuery = nextParams.toString();

    if (currentQuery === nextQuery) {
      return;
    }

    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
      scroll: false,
    });
  }, [
    focusedIssueId,
    issueSearchQuery,
    pathname,
    priorityFilter,
    router,
    searchParams,
    statusFilter,
  ]);

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

  const loadProjectRows = useCallback(async () => {
    setLoadingProjectRows(true);

    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      const data = (await response.json()) as ApiEnvelope;

      if (!response.ok) {
        setProjectRows([]);
        return;
      }

      const matchedProject =
        data.projects?.find(
          (project) =>
            project.projectKey?.toLowerCase() === projectKey.toLowerCase() ||
            project.id.toLowerCase() === projectKey.toLowerCase()
        ) ?? null;

      setProjectRows(Array.isArray(matchedProject?.rows) ? matchedProject.rows : []);
    } catch (error) {
      console.error("Load project rows error:", error);
      setProjectRows([]);
    } finally {
      setLoadingProjectRows(false);
    }
  }, [projectKey]);

  const loadIssues = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectKey)}/issues`,
        {
          cache: "no-store",
        }
      );
      const data = (await response.json()) as ApiEnvelope;

      if (response.status === 501 || data.status === "scaffolded") {
        setServiceState("scaffolded");
        setIssues([]);
        showNotice(
          "info",
          data.error ||
            "Issue persistence is scaffolded. Apply the latest migration to activate live issue management."
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
      if ((data.issues?.length ?? 0) === 0) {
        showNotice("info", "This project has no issues yet.");
      } else {
        setNotice(null);
      }
    } catch (error) {
      console.error("Load issues error:", error);
      showNotice("error", "Failed to load issues for this project.");
    } finally {
      setLoading(false);
    }
  }, [metrics, projectKey, setIssues, showNotice]);

  useEffect(() => {
    void loadIssues();
  }, [loadIssues]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    void loadProjectRows();
  }, [loadProjectRows]);

  const loadComments = useCallback(async () => {
    if (!selectedIssue) {
      setComments([]);
      return;
    }

    setLoadingComments(true);

    try {
      const response = await fetch(
        `/api/issues/${encodeURIComponent(selectedIssue.id)}/comments`,
        { cache: "no-store" }
      );
      const data = (await response.json()) as ApiEnvelope;

      if (response.status === 501 || data.status === "scaffolded") {
        setComments([]);
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || "Failed to load issue comments.");
      }

      setComments(Array.isArray(data.comments) ? data.comments : []);
    } catch (error) {
      console.error("Load issue comments error:", error);
      setComments([]);
    } finally {
      setLoadingComments(false);
    }
  }, [selectedIssue]);

  useEffect(() => {
    if (!focusedIssueId || issues.length === 0) {
      return;
    }

    const nextFrame = window.requestAnimationFrame(() => {
      const target = document.getElementById(`issue-card-${focusedIssueId}`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    return () => window.cancelAnimationFrame(nextFrame);
  }, [focusedIssueId, issues]);

  useEffect(() => {
    if (!selectedIssue) {
      setSelectedIssueDraft(null);
      setComments([]);
      setActivity([]);
      setCommentBody("");
      return;
    }

    setSelectedIssueDraft({
      summary: selectedIssue.summary,
      description: selectedIssue.description,
      type: selectedIssue.type,
      status: selectedIssue.status,
      priority: selectedIssue.priority,
      assigneeId: selectedIssue.assigneeId ?? "",
    });
  }, [selectedIssue]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  const loadActivity = useCallback(async () => {
    if (!selectedIssue) {
      setActivity([]);
      return;
    }

    setLoadingActivity(true);

    try {
      const response = await fetch(
        `/api/issues/${encodeURIComponent(selectedIssue.id)}/activity`,
        { cache: "no-store" }
      );
      const data = (await response.json()) as ApiEnvelope;

      if (response.status === 501 || data.status === "scaffolded") {
        setActivity([]);
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || "Failed to load issue activity.");
      }

      setActivity(Array.isArray(data.activity) ? data.activity : []);
    } catch (error) {
      console.error("Load issue activity error:", error);
      setActivity([]);
    } finally {
      setLoadingActivity(false);
    }
  }, [selectedIssue]);

  useEffect(() => {
    void loadActivity();
  }, [loadActivity]);

  useEffect(() => {
    if (users.length === 0) {
      setCommentAuthorId("");
      return;
    }

    const matchedSessionUser = activeReviewerSession.reviewer?.id
      ? users.find((user) => user.id === activeReviewerSession.reviewer?.id)
      : activeReviewerSession.reviewer?.email
      ? users.find((user) => user.email === activeReviewerSession.reviewer?.email)
      : null;

    if (matchedSessionUser && commentAuthorId !== matchedSessionUser.id) {
      setCommentAuthorId(matchedSessionUser.id);
      return;
    }

    if (commentAuthorId && users.some((user) => user.id === commentAuthorId)) {
      return;
    }

    setCommentAuthorId(users[0]?.id ?? "");
  }, [activeReviewerSession.reviewer, commentAuthorId, users]);

  const handleCreateIssue = async () => {
    if (!summary.trim()) {
      showNotice("error", "Enter an issue summary before creating it.");
      return;
    }

    setCreating(true);

    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectKey)}/issues`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type,
            summary: summary.trim(),
            description: description.trim(),
            status,
            priority,
            assigneeId: assigneeId || null,
          }),
        }
      );
      const data = (await response.json()) as ApiEnvelope;

      if (response.status === 501 || data.status === "scaffolded") {
        setServiceState("scaffolded");
        showNotice(
          "info",
          data.error ||
            "Issue creation is scaffolded. Apply the latest migration to activate live issue management."
        );
        return;
      }

      if (!response.ok || !data.issue) {
        throw new Error(data.error || "Failed to create issue.");
      }

      setServiceState("ready");
      setIssues((current) => {
        const nextIssues = [data.issue as IssueRecord, ...current];
        metrics?.setIssueCount(nextIssues.length);
        return nextIssues;
      });
      setSummary("");
      setDescription("");
      setType("task");
      setStatus("backlog");
      setPriority("medium");
      setAssigneeId("");
      showNotice("success", `${data.issue.issueKey} was created.`);
      router.refresh();
    } catch (error) {
      console.error("Create issue error:", error);
      showNotice("error", "Failed to create issue.");
    } finally {
      setCreating(false);
    }
  };

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
            "Issue updates are scaffolded. Apply the latest migration to activate live issue management."
        );
        return;
      }

      if (!response.ok || !data.issue) {
        throw new Error(data.error || "Failed to update issue.");
      }

      setIssues((current) =>
        current.map((issue) => (issue.id === issueId ? (data.issue as IssueRecord) : issue))
      );
      showNotice("success", `${data.issue.issueKey} moved to ${nextStatus}.`);
    } catch (error) {
      console.error("Update issue error:", error);
      showNotice("error", "Failed to update issue status.");
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
            "Issue updates are scaffolded. Apply the latest migration to activate live issue management."
        );
        return;
      }

      if (!response.ok || !data.issue) {
        throw new Error(data.error || "Failed to update issue.");
      }

      setIssues((current) =>
        current.map((issue) => (issue.id === issueId ? (data.issue as IssueRecord) : issue))
      );
      const assigneeLabel = nextAssigneeId
        ? userLookup[nextAssigneeId]?.name || "selected user"
        : "Unassigned";
      showNotice("success", `${data.issue.issueKey} is now assigned to ${assigneeLabel}.`);
    } catch (error) {
      console.error("Update assignee error:", error);
      showNotice("error", "Failed to update assignee.");
    }
  };

  const handleSelectedIssueSave = async () => {
    if (!selectedIssue || !selectedIssueDraft) {
      return;
    }

    if (!selectedIssueDraft.summary.trim()) {
      showNotice("error", "Enter an issue summary before saving.");
      return;
    }

    setSavingSelectedIssue(true);

    try {
      const response = await fetch(`/api/issues/${encodeURIComponent(selectedIssue.id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: selectedIssueDraft.summary.trim(),
          description: selectedIssueDraft.description.trim(),
          type: selectedIssueDraft.type,
          status: selectedIssueDraft.status,
          priority: selectedIssueDraft.priority,
          assigneeId: selectedIssueDraft.assigneeId || null,
        }),
      });
      const data = (await response.json()) as ApiEnvelope;

      if (response.status === 501 || data.status === "scaffolded") {
        setServiceState("scaffolded");
        showNotice(
          "info",
          data.error ||
            "Issue updates are scaffolded. Apply the latest migration to activate live issue management."
        );
        return;
      }

      if (!response.ok || !data.issue) {
        throw new Error(data.error || "Failed to save issue changes.");
      }

      setIssues((current) =>
        current.map((issue) => (issue.id === selectedIssue.id ? (data.issue as IssueRecord) : issue))
      );
      showNotice("success", `${data.issue.issueKey} was updated.`);
    } catch (error) {
      console.error("Save selected issue error:", error);
      showNotice("error", "Failed to save selected issue changes.");
    } finally {
      setSavingSelectedIssue(false);
    }
  };

  const handleCreateComment = async () => {
    if (!selectedIssue) {
      return;
    }

    if (!commentAuthorId) {
      showNotice("error", "Choose a comment author first.");
      return;
    }

    if (!commentBody.trim()) {
      showNotice("error", "Write a comment before posting.");
      return;
    }

    setCreatingComment(true);

    try {
      const response = await fetch(
        `/api/issues/${encodeURIComponent(selectedIssue.id)}/comments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            authorId: commentAuthorId,
            body: commentBody.trim(),
          }),
        }
      );
      const data = (await response.json()) as ApiEnvelope;

      if (response.status === 501 || data.status === "scaffolded") {
        showNotice(
          "info",
          data.error ||
            "Issue comments are scaffolded. Apply the latest migration to activate live issue comments."
        );
        return;
      }

      if (!response.ok || !data.comment) {
        throw new Error(data.error || "Failed to create issue comment.");
      }

      setComments((current) => [data.comment as CommentRecord, ...current]);
      void loadActivity();
      setCommentBody("");
      showNotice("success", "Comment added to the selected issue.");
    } catch (error) {
      console.error("Create issue comment error:", error);
      showNotice("error", "Failed to create issue comment.");
    } finally {
      setCreatingComment(false);
    }
  };

  const describeActivity = (entry: ActivityRecord) => {
    if (entry.action === "issue.created") {
      return "Issue created";
    }

    if (entry.action === "issue.updated") {
      const before =
        entry.beforeJson && typeof entry.beforeJson === "object"
          ? (entry.beforeJson as Record<string, unknown>)
          : {};
      const after =
        entry.afterJson && typeof entry.afterJson === "object"
          ? (entry.afterJson as Record<string, unknown>)
          : {};

      const changedFields = [
        before.summary !== after.summary ? "summary" : null,
        before.description !== after.description ? "description" : null,
        before.status !== after.status ? "status" : null,
        before.priority !== after.priority ? "priority" : null,
        before.assigneeId !== after.assigneeId ? "assignee" : null,
        before.type !== after.type ? "type" : null,
      ].filter(Boolean);

      return changedFields.length > 0
        ? `Updated ${changedFields.join(", ")}`
        : "Issue updated";
    }

    if (entry.action === "comment.created") {
      return "Added a comment";
    }

    return entry.action;
  };

  const openIssueCount = issues.filter((issue) => issue.status !== "done").length;
  const blockedIssueCount = issues.filter((issue) => issue.status === "blocked").length;
  const highestPriorityCount = issues.filter((issue) => issue.priority === "highest").length;

  return (
    <main className={embedded ? "flex flex-col gap-6" : "min-h-screen bg-[linear-gradient(180deg,_#f6faf8_0%,_#eef4f1_100%)] px-6 py-8 text-zinc-950 dark:bg-[linear-gradient(180deg,_#09090b_0%,_#111827_100%)] dark:text-zinc-50"}>
      <div className={embedded ? "flex flex-col gap-6" : "mx-auto flex w-full max-w-7xl flex-col gap-6"}>
        <section className="rounded-[34px] border border-white/80 bg-white/92 px-8 py-8 shadow-[0_28px_70px_-40px_rgba(15,23,42,0.34)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/88">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                Issues
              </p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">
                Jira-style issues for {projectKey}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
                This is the first live issue-management surface for the refactor. It works against the new
                issue API and clearly tells you when the database migration still needs to be applied.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              ["Issues", issues.length],
              ["Visible", filteredIssues.length],
              ["Open", openIssueCount],
              ["Blocked", blockedIssueCount],
              ["Highest", highestPriorityCount],
            ].map(([label, value]) => (
              <article
                key={label}
                className="rounded-[24px] border border-zinc-200/80 bg-zinc-50/90 px-4 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                  {label}
                </p>
                <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                  {value}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-[24px] border border-zinc-200/80 bg-zinc-50/85 px-5 py-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/72">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                Issues Command Center
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                Keep triage, creation, and follow-up easier to scan.
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                The issue list stays primary, while filters, focused editing, and creation stay visible without all competing at once.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-[22px] border border-zinc-200/80 bg-white/85 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/70">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                  Visible
                </p>
                <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                  {filteredIssues.length}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  current filtered slice
                </p>
              </div>
              <div className="rounded-[22px] border border-zinc-200/80 bg-white/85 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/70">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                  Open Risk
                </p>
                <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                  {openIssueCount}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  non-done issues
                </p>
              </div>
              <div className="rounded-[22px] border border-zinc-200/80 bg-white/85 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/70">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                  Selected
                </p>
                <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                  {selectedIssue ? selectedIssue.issueKey : "None"}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  active focus state
                </p>
              </div>
              <div className="rounded-[22px] border border-zinc-200/80 bg-white/85 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/70">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                  Highest
                </p>
                <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                  {highestPriorityCount}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  highest-priority items
                </p>
              </div>
            </div>
          </div>
        </section>

        {cameFromRelease && (
          <section className="rounded-[24px] border border-sky-200 bg-sky-50/90 px-4 py-4 text-sm text-sky-900 shadow-sm dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="font-semibold">Viewing an issue slice opened from Release</p>
                <p className="mt-1 text-sky-800/80 dark:text-sky-200/80">
                  This issue view is preserving release context so you can inspect blockers and high-risk items, then return to the release decision.
                </p>
              </div>
              <Link
                href={`/projects/${encodeURIComponent(projectKey)}/release`}
                className="inline-flex items-center justify-center rounded-2xl border border-sky-300 bg-white px-4 py-2.5 text-sm font-semibold text-sky-900 shadow-sm transition hover:bg-sky-100 dark:border-sky-400/30 dark:bg-zinc-950 dark:text-sky-200 dark:hover:bg-zinc-900"
              >
                Back to Release
              </Link>
            </div>
          </section>
        )}

        {notice && (
          <section
            className={`cf-motion-toast rounded-[24px] border px-4 py-3 text-sm shadow-sm ${
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

        <section className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="rounded-[24px] border border-zinc-200/80 bg-white/96 p-6 shadow-[0_24px_55px_-38px_rgba(15,23,42,0.22)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/94">
            <details>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                    Create Issue
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">Log work like a real issue tracker</h2>
                </div>
                <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                  Setup
                </span>
              </summary>

            <div className="mt-5 space-y-3">
              <input
                type="text"
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder="Issue summary"
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              />
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Description"
                rows={5}
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              />
              <select
                value={type}
                onChange={(event) => setType(event.target.value as IssueType)}
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              >
                <option value="task">Task</option>
                <option value="story">Story</option>
                <option value="bug">Bug</option>
                <option value="epic">Epic</option>
                <option value="test-case">Test Case</option>
                <option value="test-plan">Test Plan</option>
                <option value="test-run">Test Run</option>
              </select>
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as IssueStatus)}
                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                >
                  <option value="backlog">Backlog</option>
                  <option value="todo">To Do</option>
                  <option value="in-progress">In Progress</option>
                  <option value="blocked">Blocked</option>
                  <option value="in-review">In Review</option>
                  <option value="done">Done</option>
                </select>
                <select
                  value={priority}
                  onChange={(event) => setPriority(event.target.value as IssuePriority)}
                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                >
                  <option value="highest">Highest</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <select
                value={assigneeId}
                onChange={(event) => setAssigneeId(event.target.value)}
                disabled={loadingUsers}
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
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
              <button
                type="button"
                onClick={handleCreateIssue}
                disabled={creating}
                className="w-full rounded-2xl bg-[linear-gradient(135deg,_#0f766e_0%,_#14532d_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_-18px_rgba(5,150,105,0.7)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? "Creating..." : "Create Issue"}
              </button>
            </div>
            </details>
          </div>

          <div className="rounded-[24px] border border-zinc-200/80 bg-white/96 p-6 shadow-[0_24px_55px_-38px_rgba(15,23,42,0.22)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/94">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                  Issue List
                </p>
                <h2 className="mt-1 text-xl font-semibold">Tracked work items</h2>
              </div>
              <button
                type="button"
                onClick={() => void loadIssues()}
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Refresh
              </button>
            </div>

            <div className="mt-5">
              {selectedIssue && (
                <section className="mb-5 rounded-[24px] border border-emerald-200 bg-[linear-gradient(180deg,_rgba(236,253,245,0.98)_0%,_rgba(209,250,229,0.82)_100%)] p-5 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">
                        Selected Issue
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-zinc-200 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-200">
                          {selectedIssue.issueKey}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                        Updated {formatUtcDateTime(selectedIssue.updatedAt)}
                      </p>

                      <div className="mt-4 grid gap-3">
                        <input
                          type="text"
                          value={selectedIssueDraft?.summary ?? ""}
                          onChange={(event) =>
                            setSelectedIssueDraft((current) =>
                              current
                                ? { ...current, summary: event.target.value }
                                : current
                            )
                          }
                          placeholder="Issue summary"
                          className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                        />

                        <textarea
                          value={selectedIssueDraft?.description ?? ""}
                          onChange={(event) =>
                            setSelectedIssueDraft((current) =>
                              current
                                ? { ...current, description: event.target.value }
                                : current
                            )
                          }
                          rows={4}
                          placeholder="Issue description"
                          className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                        />

                        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
                          <select
                            value={selectedIssueDraft?.type ?? "task"}
                            onChange={(event) =>
                              setSelectedIssueDraft((current) =>
                                current
                                  ? { ...current, type: event.target.value as IssueType }
                                  : current
                              )
                            }
                            className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                          >
                            <option value="task">Task</option>
                            <option value="story">Story</option>
                            <option value="bug">Bug</option>
                            <option value="epic">Epic</option>
                            <option value="test-case">Test Case</option>
                            <option value="test-plan">Test Plan</option>
                            <option value="test-run">Test Run</option>
                          </select>

                          <select
                            value={selectedIssueDraft?.status ?? "backlog"}
                            onChange={(event) =>
                              setSelectedIssueDraft((current) =>
                                current
                                  ? { ...current, status: event.target.value as IssueStatus }
                                  : current
                              )
                            }
                            className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                          >
                            <option value="backlog">Backlog</option>
                            <option value="todo">To Do</option>
                            <option value="in-progress">In Progress</option>
                            <option value="blocked">Blocked</option>
                            <option value="in-review">In Review</option>
                            <option value="done">Done</option>
                          </select>

                          <select
                            value={selectedIssueDraft?.priority ?? "medium"}
                            onChange={(event) =>
                              setSelectedIssueDraft((current) =>
                                current
                                  ? { ...current, priority: event.target.value as IssuePriority }
                                  : current
                              )
                            }
                            className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                          >
                            <option value="highest">Highest</option>
                            <option value="high">High</option>
                            <option value="medium">Medium</option>
                            <option value="low">Low</option>
                          </select>

                          <select
                            value={selectedIssueDraft?.assigneeId ?? ""}
                            onChange={(event) =>
                              setSelectedIssueDraft((current) =>
                                current
                                  ? { ...current, assigneeId: event.target.value }
                                  : current
                              )
                            }
                            disabled={loadingUsers}
                            className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
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

                        <div className="flex flex-wrap gap-2">
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                              statusTone[selectedIssueDraft?.status ?? "backlog"]
                            }`}
                          >
                            {selectedIssueDraft?.status ?? "backlog"}
                          </span>
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                              priorityTone[selectedIssueDraft?.priority ?? "medium"]
                            }`}
                          >
                            {selectedIssueDraft?.priority ?? "medium"}
                          </span>
                        </div>

                        <div className="rounded-[22px] border border-white/80 bg-white/70 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/60">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                                Linked Test Cases
                              </p>
                              <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-200">
                                Cases connected to this issue from the QA workspace.
                              </p>
                            </div>
                            <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                              {linkedCases.length}
                            </span>
                          </div>

                          <div className="mt-4 space-y-3">
                            {loadingProjectRows ? (
                              <div className="rounded-[18px] border border-dashed border-zinc-200 px-4 py-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                                Loading linked cases...
                              </div>
                            ) : linkedCases.length === 0 ? (
                              <div className="rounded-[18px] border border-dashed border-zinc-200 px-4 py-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                                No test cases are linked to this issue yet.
                              </div>
                            ) : (
                              linkedCases.map((testCase) => (
                                <Link
                                  key={testCase.id}
                                  href={`/projects/${encodeURIComponent(projectKey)}/cases?rowId=${encodeURIComponent(testCase.id)}`}
                                  className="block rounded-[18px] border border-zinc-200/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.95)_0%,_rgba(247,249,248,0.98)_100%)] px-4 py-4 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/70 dark:hover:bg-zinc-900"
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                                      {testCase.id}
                                    </span>
                                    <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                                      {testCase.type}
                                    </span>
                                    {testCase.workflowStatus && (
                                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                                        {testCase.workflowStatus}
                                      </span>
                                    )}
                                    {testCase.priority && (
                                      <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
                                        {testCase.priority}
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-3 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                                    {testCase.title.trim() || "Untitled test case"}
                                  </p>
                                </Link>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="rounded-[22px] border border-white/80 bg-white/70 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/60">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                                Activity
                              </p>
                              <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-200">
                                A lightweight timeline for issue changes and collaboration.
                              </p>
                            </div>
                            <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                              {activity.length}
                            </span>
                          </div>

                          <div className="mt-4 space-y-3">
                            {loadingActivity ? (
                              <div className="rounded-[18px] border border-dashed border-zinc-200 px-4 py-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                                Loading activity...
                              </div>
                            ) : activity.length === 0 ? (
                              <div className="rounded-[18px] border border-dashed border-zinc-200 px-4 py-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                                No activity logged for this issue yet.
                              </div>
                            ) : (
                              activity.map((entry) => (
                                <div
                                  key={entry.id}
                                  className="rounded-[18px] border border-zinc-200/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.95)_0%,_rgba(247,249,248,0.98)_100%)] px-4 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70"
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                                      {describeActivity(entry)}
                                    </span>
                                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                      {formatUtcDateTime(entry.createdAt)}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                    {entry.actorName || entry.actorEmail || "System"}
                                  </p>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="rounded-[22px] border border-white/80 bg-white/70 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/60">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                                Comments
                              </p>
                              <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-200">
                                Keep issue context and decisions in one place.
                              </p>
                            </div>
                            <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                              {comments.length}
                            </span>
                          </div>

                          <div className="mt-4 grid gap-3">
                            <select
                              value={commentAuthorId}
                              onChange={(event) => setCommentAuthorId(event.target.value)}
                              disabled={loadingUsers || users.length === 0}
                              className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                            >
                              <option value="">
                                {loadingUsers
                                  ? "Loading authors..."
                                  : users.length === 0
                                  ? "No users available"
                                  : "Choose author"}
                              </option>
                              {users.map((user) => (
                                <option key={user.id} value={user.id}>
                                  {user.name} ({user.email})
                                </option>
                              ))}
                            </select>

                            <textarea
                              value={commentBody}
                              onChange={(event) => setCommentBody(event.target.value)}
                              rows={3}
                              placeholder="Add a note, testing update, blocker, or decision..."
                              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                            />

                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => void handleCreateComment()}
                                disabled={creatingComment || users.length === 0}
                                className="rounded-2xl bg-[linear-gradient(135deg,_#0f766e_0%,_#14532d_100%)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_18px_35px_-18px_rgba(5,150,105,0.7)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {creatingComment ? "Posting..." : "Post Comment"}
                              </button>
                            </div>
                          </div>

                          <div className="mt-4 space-y-3">
                            {loadingComments ? (
                              <div className="rounded-[18px] border border-dashed border-zinc-200 px-4 py-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                                Loading comments...
                              </div>
                            ) : comments.length === 0 ? (
                              <div className="rounded-[18px] border border-dashed border-zinc-200 px-4 py-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                                No comments on this issue yet.
                              </div>
                            ) : (
                              comments.map((comment) => (
                                <div
                                  key={comment.id}
                                  className="rounded-[18px] border border-zinc-200/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.95)_0%,_rgba(247,249,248,0.98)_100%)] px-4 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70"
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                                      {comment.authorName}
                                    </span>
                                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                      {comment.authorEmail}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                    {formatUtcDateTime(comment.createdAt)}
                                  </p>
                                  <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-zinc-700 dark:text-zinc-200">
                                    {comment.body}
                                  </p>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => void handleSelectedIssueSave()}
                        disabled={!isSelectedIssueDirty || savingSelectedIssue}
                        className="rounded-2xl bg-[linear-gradient(135deg,_#0f766e_0%,_#14532d_100%)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_18px_35px_-18px_rgba(5,150,105,0.7)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingSelectedIssue ? "Saving..." : "Save Changes"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedIssueDraft(
                            selectedIssue
                              ? {
                                  summary: selectedIssue.summary,
                                  description: selectedIssue.description,
                                  type: selectedIssue.type,
                                  status: selectedIssue.status,
                                  priority: selectedIssue.priority,
                                  assigneeId: selectedIssue.assigneeId ?? "",
                                }
                              : null
                          )
                        }
                        disabled={!isSelectedIssueDirty || savingSelectedIssue}
                        className="rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                      >
                        Reset Draft
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const nextParams = new URLSearchParams(searchParams.toString());
                          nextParams.delete("issueId");
                          const nextQuery = nextParams.toString();
                          router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
                            scroll: false,
                          });
                        }}
                        className="rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                      >
                        Clear Focus
                      </button>
                    </div>
                  </div>
                </section>
              )}

              <section className="rounded-[20px] border border-zinc-200/80 bg-white/90 px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/72">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
                  <label className="flex-1">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                      Search Issues
                    </span>
                    <input
                      type="text"
                      value={issueSearchQuery}
                      onChange={(event) => setIssueSearchQuery(event.target.value)}
                      placeholder="Search key, summary, assignee, type, or description"
                      className="mt-2 min-h-[44px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                    />
                  </label>

                  <label className="min-w-[180px]">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                      Status
                    </span>
                    <select
                      value={statusFilter}
                      onChange={(event) =>
                        setStatusFilter(event.target.value as IssueStatus | "")
                      }
                      className="mt-2 min-h-[44px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                    >
                      <option value="">All statuses</option>
                      <option value="backlog">Backlog</option>
                      <option value="todo">To Do</option>
                      <option value="in-progress">In Progress</option>
                      <option value="blocked">Blocked</option>
                      <option value="in-review">In Review</option>
                      <option value="done">Done</option>
                    </select>
                  </label>

                  <label className="min-w-[180px]">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                      Priority
                    </span>
                    <select
                      value={priorityFilter}
                      onChange={(event) =>
                        setPriorityFilter(event.target.value as IssuePriority | "")
                      }
                      className="mt-2 min-h-[44px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                    >
                      <option value="">All priorities</option>
                      <option value="highest">Highest</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      setIssueSearchQuery("");
                      setStatusFilter("");
                      setPriorityFilter("");
                    }}
                    className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  >
                    Reset Filters
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                    Visible {filteredIssues.length}
                  </span>
                  {issueSearchQuery.trim() ? (
                    <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                      Search active
                    </span>
                  ) : null}
                  {statusFilter ? (
                    <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                      Status filtered
                    </span>
                  ) : null}
                  {priorityFilter ? (
                    <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                      Priority filtered
                    </span>
                  ) : null}
                </div>
              </section>

              {loading ? (
                <div className="rounded-[20px] border border-dashed border-zinc-200 px-5 py-8 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  Loading issue list...
                </div>
              ) : issues.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-zinc-200 px-5 py-8 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  {serviceState === "scaffolded"
                    ? "The issues UI is ready, but the database migration still needs to be applied."
                    : "No issues yet. Create the first tracked work item for this project."}
                </div>
              ) : filteredIssues.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-zinc-200 px-5 py-8 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  No issues match the current filters.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredIssues.map((issue) => (
                    <div
                      key={issue.id}
                      id={`issue-card-${issue.id}`}
                      className={`rounded-[20px] border p-4 shadow-sm transition ${
                        issue.id === focusedIssueId
                          ? "border-emerald-300 bg-[linear-gradient(180deg,_rgba(236,253,245,0.96)_0%,_rgba(209,250,229,0.82)_100%)] shadow-[0_18px_45px_-30px_rgba(5,150,105,0.5)] dark:border-emerald-500/40 dark:bg-emerald-500/10"
                          : "border-zinc-200/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.92)_0%,_rgba(247,249,248,0.98)_100%)] dark:border-zinc-800 dark:bg-zinc-950/70"
                      }`}
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                              {issue.issueKey}
                            </span>
                            <span
                              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone[issue.status]}`}
                            >
                              {issue.status}
                            </span>
                            <span
                              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${priorityTone[issue.priority]}`}
                            >
                              {issue.priority}
                            </span>
                          </div>
                          <p className="mt-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                            {issue.summary}
                          </p>
                          {issue.description && (
                            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                              {issue.description}
                            </p>
                          )}
                          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                            Assignee:{" "}
                            <span className="font-medium text-zinc-700 dark:text-zinc-200">
                              {issue.assigneeId
                                ? userLookup[issue.assigneeId]?.name ||
                                  userLookup[issue.assigneeId]?.email ||
                                  issue.assigneeId
                                : "Unassigned"}
                            </span>
                          </p>
                        </div>

                        <div className="grid w-full max-w-[240px] gap-3">
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
                            <option value="backlog">Backlog</option>
                            <option value="todo">To Do</option>
                            <option value="in-progress">In Progress</option>
                            <option value="blocked">Blocked</option>
                            <option value="in-review">In Review</option>
                            <option value="done">Done</option>
                          </select>

                          <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                            Assignee
                          </label>
                          <select
                            value={issue.assigneeId ?? ""}
                            onChange={(event) =>
                              void handleAssigneeUpdate(issue.id, event.target.value)
                            }
                            disabled={loadingUsers}
                            className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
