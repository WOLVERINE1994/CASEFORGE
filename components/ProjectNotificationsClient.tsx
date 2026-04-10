"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useProjectDataState } from "./ProjectDataStateContext";
import { useActiveReviewerSession } from "./useActiveReviewerSession";
import { formatUtcDateTime } from "../utils/date-format";
import type { Project, ReviewerNotification } from "../utils/workspace";
import {
  defaultReviewerNotificationPreferences,
  loadReviewerNotificationPreferences,
  saveReviewerNotificationPreferences,
  type ReviewerNotificationPreferences,
} from "../utils/reviewer-notification-preferences";

type ProjectNotificationsClientProps = {
  projectKey: string;
};

const matchesReviewerNotification = (
  notification: ReviewerNotification,
  reviewer?: { id?: string; name?: string; email?: string } | null
) => {
  if (!reviewer) {
    return false;
  }

  const reviewerIds = [reviewer.id, reviewer.email, reviewer.name]
    .filter(Boolean)
    .map((value) => value!.toLowerCase());
  const recipientIds = [notification.recipientId, notification.recipientLabel]
    .filter(Boolean)
    .map((value) => value!.toLowerCase());

  return recipientIds.some((value) => reviewerIds.includes(value));
};

const notificationTone = {
  "case-mention":
    "border-sky-200 bg-sky-50/80 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200",
  "case-watch":
    "border-emerald-200 bg-emerald-50/80 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
  "template-operation":
    "border-violet-200 bg-violet-50/80 text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200",
} as const;

export default function ProjectNotificationsClient({
  projectKey,
}: ProjectNotificationsClientProps) {
  const projectState = useProjectDataState();
  const activeReviewerSession = useActiveReviewerSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const project = projectState?.project ?? null;
  const typeParam = searchParams.get("type");
  const unreadOnlyParam = searchParams.get("unread") === "1";
  const archivedParam = searchParams.get("archived") === "1";
  const rowIdParam = searchParams.get("rowId")?.trim() ?? "";
  const severityParam = searchParams.get("severity");
  const sourceParam = searchParams.get("source")?.trim() ?? "";
  const hasUnreadParam = searchParams.has("unread");
  const [typeFilter, setTypeFilter] = useState<"" | ReviewerNotification["type"]>(
    typeParam === "case-mention" ||
      typeParam === "case-watch" ||
      typeParam === "template-operation"
      ? typeParam
      : ""
  );
  const [unreadOnly, setUnreadOnly] = useState(unreadOnlyParam);
  const [showArchived, setShowArchived] = useState(archivedParam);
  const [focusedRowId, setFocusedRowId] = useState(rowIdParam);
  const [severityFilter, setSeverityFilter] = useState<"" | "low" | "medium" | "high">(
    severityParam === "low" || severityParam === "medium" || severityParam === "high"
      ? severityParam
      : ""
  );
  const [sourceFilter, setSourceFilter] = useState(sourceParam);
  const [notificationPreferences, setNotificationPreferences] =
    useState<ReviewerNotificationPreferences>(defaultReviewerNotificationPreferences);
  const [templateAllowedSourcesInput, setTemplateAllowedSourcesInput] = useState("");
  const [templateBlockedSourcesInput, setTemplateBlockedSourcesInput] = useState("");
  const [templateHighPrioritySourcesInput, setTemplateHighPrioritySourcesInput] = useState("");
  const [templateImportHighPrioritySourcesInput, setTemplateImportHighPrioritySourcesInput] =
    useState("");
  const [templateExportHighPrioritySourcesInput, setTemplateExportHighPrioritySourcesInput] =
    useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(
    null
  );

  const activeReviewerPreferenceId = useMemo(
    () =>
      activeReviewerSession.reviewer?.id ||
      activeReviewerSession.reviewer?.email ||
      activeReviewerSession.reviewer?.name ||
      "",
    [
      activeReviewerSession.reviewer?.email,
      activeReviewerSession.reviewer?.id,
      activeReviewerSession.reviewer?.name,
    ]
  );

  useEffect(() => {
    if (!project?.id || !activeReviewerPreferenceId) {
      setNotificationPreferences(defaultReviewerNotificationPreferences);
      return;
    }

    const loadedPreferences = loadReviewerNotificationPreferences(
      project.id,
      activeReviewerPreferenceId
    );
    setNotificationPreferences(loadedPreferences);

    if (!hasUnreadParam) {
      setUnreadOnly(loadedPreferences.unreadOnlyDefault);
    }
  }, [activeReviewerPreferenceId, hasUnreadParam, project?.id]);

  useEffect(() => {
    const nextType =
      typeParam === "case-mention" ||
      typeParam === "case-watch" ||
      typeParam === "template-operation"
        ? typeParam
        : "";
    setTypeFilter(nextType);
    setUnreadOnly(hasUnreadParam ? unreadOnlyParam : notificationPreferences.unreadOnlyDefault);
    setShowArchived(archivedParam);
    setFocusedRowId(rowIdParam);
    setSeverityFilter(
      severityParam === "low" || severityParam === "medium" || severityParam === "high"
        ? severityParam
        : ""
    );
    setSourceFilter(sourceParam);
  }, [
    archivedParam,
    hasUnreadParam,
    notificationPreferences.unreadOnlyDefault,
    rowIdParam,
    severityParam,
    sourceParam,
    typeParam,
    unreadOnlyParam,
  ]);

  useEffect(() => {
    setTemplateAllowedSourcesInput(
      notificationPreferences.templateAlertAllowedSources.join(", ")
    );
    setTemplateBlockedSourcesInput(
      notificationPreferences.templateAlertBlockedSources.join(", ")
    );
    setTemplateHighPrioritySourcesInput(
      notificationPreferences.templateAlertHighPrioritySources.join(", ")
    );
    setTemplateImportHighPrioritySourcesInput(
      notificationPreferences.templateImportHighPrioritySources.join(", ")
    );
    setTemplateExportHighPrioritySourcesInput(
      notificationPreferences.templateExportHighPrioritySources.join(", ")
    );
  }, [
    notificationPreferences.templateAlertAllowedSources,
    notificationPreferences.templateAlertBlockedSources,
    notificationPreferences.templateAlertHighPrioritySources,
    notificationPreferences.templateImportHighPrioritySources,
    notificationPreferences.templateExportHighPrioritySources,
  ]);

  const updateNotificationPreferences = useCallback(
    (updater: (current: ReviewerNotificationPreferences) => ReviewerNotificationPreferences) => {
      setNotificationPreferences((current) => {
        const nextPreferences = updater(current);
        if (project?.id && activeReviewerPreferenceId) {
          saveReviewerNotificationPreferences(project.id, activeReviewerPreferenceId, nextPreferences);
        }
        return nextPreferences;
      });
    },
    [activeReviewerPreferenceId, project?.id]
  );

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams.toString());

    if (typeFilter) {
      nextParams.set("type", typeFilter);
    } else {
      nextParams.delete("type");
    }

    if (unreadOnly) {
      nextParams.set("unread", "1");
    } else {
      nextParams.delete("unread");
    }

    if (showArchived) {
      nextParams.set("archived", "1");
    } else {
      nextParams.delete("archived");
    }

    if (focusedRowId) {
      nextParams.set("rowId", focusedRowId);
    } else {
      nextParams.delete("rowId");
    }

    if (severityFilter) {
      nextParams.set("severity", severityFilter);
    } else {
      nextParams.delete("severity");
    }

    if (sourceFilter) {
      nextParams.set("source", sourceFilter);
    } else {
      nextParams.delete("source");
    }

    const query = nextParams.toString();
    router.replace(
      query
        ? `/projects/${encodeURIComponent(projectKey)}/notifications?${query}`
        : `/projects/${encodeURIComponent(projectKey)}/notifications`,
      { scroll: false }
    );
  }, [
    focusedRowId,
    projectKey,
    router,
    searchParams,
    severityFilter,
    showArchived,
    sourceFilter,
    typeFilter,
    unreadOnly,
  ]);

  const reviewerNotifications = useMemo(
    () =>
      (project?.notifications ?? [])
        .filter((notification) =>
          matchesReviewerNotification(notification, activeReviewerSession.reviewer)
        )
        .sort((left, right) => right.createdAt - left.createdAt),
    [activeReviewerSession.reviewer, project?.notifications]
  );

  const filteredNotifications = useMemo(
    () =>
      reviewerNotifications.filter((notification) => {
        if (typeFilter && notification.type !== typeFilter) {
          return false;
        }

        if (showArchived) {
          if (!notification.archivedAt) {
            return false;
          }
        } else if (notification.archivedAt) {
          return false;
        }

        if (unreadOnly && notification.readAt) {
          return false;
        }

        if (focusedRowId && notification.rowId !== focusedRowId) {
          return false;
        }

        if (severityFilter && notification.severity !== severityFilter) {
          return false;
        }

        if (sourceFilter && (notification.sourceLabel?.trim() || "") !== sourceFilter) {
          return false;
        }

        return true;
      }),
    [
      focusedRowId,
      reviewerNotifications,
      severityFilter,
      showArchived,
      sourceFilter,
      typeFilter,
      unreadOnly,
    ]
  );
  const sourceOptions = useMemo(
    () =>
      Array.from(
        new Set(
          reviewerNotifications
            .map((notification) => notification.sourceLabel?.trim() || "")
            .filter(Boolean)
        )
      ).sort((left, right) => left.localeCompare(right)),
    [reviewerNotifications]
  );

  const counts = useMemo(
    () => ({
      total: reviewerNotifications.length,
      unread: reviewerNotifications.filter((notification) => !notification.readAt).length,
      archived: reviewerNotifications.filter((notification) => Boolean(notification.archivedAt))
        .length,
      mentions: reviewerNotifications.filter(
        (notification) => notification.type === "case-mention"
      ).length,
      watching: reviewerNotifications.filter(
        (notification) => notification.type === "case-watch"
      ).length,
      templateOps: reviewerNotifications.filter(
        (notification) => notification.type === "template-operation"
      ).length,
      templateImports: reviewerNotifications.filter(
        (notification) =>
          notification.type === "template-operation" &&
          notification.operation === "import"
      ).length,
      templateExports: reviewerNotifications.filter(
        (notification) =>
          notification.type === "template-operation" &&
          notification.operation === "export"
      ).length,
    }),
    [reviewerNotifications]
  );
  const templateSourceCounts = useMemo(
    () =>
      Array.from(
        reviewerNotifications.reduce((accumulator, notification) => {
          if (notification.type !== "template-operation" || !notification.sourceLabel?.trim()) {
            return accumulator;
          }
          const sourceLabel = notification.sourceLabel.trim();
          accumulator.set(sourceLabel, (accumulator.get(sourceLabel) ?? 0) + 1);
          return accumulator;
        }, new Map<string, number>())
      )
        .map(([source, count]) => ({ source, count }))
        .sort((left, right) => right.count - left.count || left.source.localeCompare(right.source))
        .slice(0, 3),
    [reviewerNotifications]
  );
  const unreadTemplateSourceCounts = useMemo(
    () =>
      Array.from(
        reviewerNotifications.reduce((accumulator, notification) => {
          if (
            notification.type !== "template-operation" ||
            notification.readAt ||
            !notification.sourceLabel?.trim()
          ) {
            return accumulator;
          }
          const sourceLabel = notification.sourceLabel.trim();
          accumulator.set(sourceLabel, (accumulator.get(sourceLabel) ?? 0) + 1);
          return accumulator;
        }, new Map<string, number>())
      )
        .map(([source, count]) => ({ source, count }))
        .sort((left, right) => right.count - left.count || left.source.localeCompare(right.source))
        .slice(0, 3),
    [reviewerNotifications]
  );

  const persistProject = useCallback(
    async (nextProject: Project) => {
      setIsSaving(true);

      try {
        const projectsResponse = await fetch("/api/projects", {
          cache: "no-store",
        });
        const projectsPayload = (await projectsResponse.json()) as {
          projects?: Project[];
          error?: string;
        };

        if (!projectsResponse.ok || !Array.isArray(projectsPayload.projects)) {
          throw new Error(
            projectsPayload.error?.trim() || "Failed to load current projects."
          );
        }

        const updatedProjects = projectsPayload.projects.map((entry) =>
          entry.id === nextProject.id ? nextProject : entry
        );

        const persistResponse = await fetch("/api/projects", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ projects: updatedProjects }),
        });
        const persistPayload = (await persistResponse.json()) as {
          projects?: Project[];
          error?: string;
        };

        if (!persistResponse.ok || !Array.isArray(persistPayload.projects)) {
          throw new Error(
            persistPayload.error?.trim() || "Failed to save project notifications."
          );
        }

        const savedProject =
          persistPayload.projects.find((entry) => entry.id === nextProject.id) ?? nextProject;
        projectState?.setProject(savedProject);
        router.refresh();
        return savedProject;
      } finally {
        setIsSaving(false);
      }
    },
    [projectState, router]
  );

  const updateNotifications = useCallback(
    async (
      transform: (notifications: ReviewerNotification[]) => ReviewerNotification[],
      successText: string
    ) => {
      if (!project) {
        return;
      }

      try {
        const savedProject = await persistProject({
          ...project,
          notifications: transform(project.notifications ?? []),
          updatedAt: Date.now(),
        });

        setNotice({
          tone: "success",
          text: successText,
        });

        return savedProject;
      } catch (error) {
        setNotice({
          tone: "error",
          text:
            error instanceof Error && error.message.trim()
              ? error.message
              : "Failed to update notifications.",
        });
        return null;
      }
    },
    [persistProject, project]
  );

  const markNotificationRead = async (notificationId: string) => {
    await updateNotifications(
      (notifications) =>
        notifications.map((notification) =>
          notification.id === notificationId
            ? {
                ...notification,
                readAt: notification.readAt ?? Date.now(),
              }
            : notification
        ),
      "Marked notification as read."
    );
  };

  const markFilteredRead = async () => {
    const visibleIds = new Set(
      filteredNotifications.filter((notification) => !notification.readAt).map((n) => n.id)
    );

    if (visibleIds.size === 0) {
      setNotice({
        tone: "info",
        text: "No unread notifications in the current filter.",
      });
      return;
    }

    await updateNotifications(
      (notifications) =>
        notifications.map((notification) =>
          visibleIds.has(notification.id)
            ? {
                ...notification,
                readAt: notification.readAt ?? Date.now(),
              }
            : notification
        ),
      `Marked ${visibleIds.size} notification${visibleIds.size === 1 ? "" : "s"} as read.`
    );
  };

  const archiveNotification = async (notificationId: string) => {
    await updateNotifications(
      (notifications) =>
        notifications.map((notification) =>
          notification.id === notificationId
            ? {
                ...notification,
                archivedAt: notification.archivedAt ?? Date.now(),
                readAt: notification.readAt ?? Date.now(),
              }
            : notification
        ),
      "Archived notification."
    );
  };

  const archiveFilteredNotifications = async () => {
    const visibleIds = new Set(
      filteredNotifications
        .filter((notification) => !notification.archivedAt)
        .map((notification) => notification.id)
    );

    if (visibleIds.size === 0) {
      setNotice({
        tone: "info",
        text: "No active notifications in the current filter.",
      });
      return;
    }

    await updateNotifications(
      (notifications) =>
        notifications.map((notification) =>
          visibleIds.has(notification.id)
            ? {
                ...notification,
                archivedAt: notification.archivedAt ?? Date.now(),
                readAt: notification.readAt ?? Date.now(),
              }
            : notification
        ),
      `Archived ${visibleIds.size} notification${visibleIds.size === 1 ? "" : "s"}.`
    );
  };

  const clearArchivedNotifications = async () => {
    const archivedIds = new Set(
      reviewerNotifications
        .filter((notification) => notification.archivedAt)
        .map((notification) => notification.id)
    );

    if (archivedIds.size === 0) {
      setNotice({
        tone: "info",
        text: "There are no archived notifications to clear.",
      });
      return;
    }

    await updateNotifications(
      (notifications) => notifications.filter((notification) => !archivedIds.has(notification.id)),
      `Cleared ${archivedIds.size} archived notification${archivedIds.size === 1 ? "" : "s"}.`
    );
  };

  if (!activeReviewerSession.loading && !activeReviewerSession.reviewer) {
    return (
      <section className="rounded-[24px] border border-zinc-200/80 bg-white/96 p-8 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.24)] dark:border-zinc-800 dark:bg-zinc-950/94">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
          Notifications
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Set an active reviewer to see alerts
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-zinc-600 dark:text-zinc-300">
          Notifications are targeted to the current reviewer session. Once we choose an
          active reviewer, this page becomes a focused inbox for mentions and watched cases.
        </p>
        <Link
          href="/settings/users"
          className="mt-5 inline-flex items-center rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
        >
          Open Reviewer Settings
        </Link>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-[24px] border border-zinc-200/80 bg-white/96 p-6 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.24)] dark:border-zinc-800 dark:bg-zinc-950/94">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Reviewer Inbox
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Notifications
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-zinc-600 dark:text-zinc-300">
              This is the project-level inbox for the active reviewer. We can focus on
              mentions, watched-case updates, or only unread alerts without losing the rest
              of the project context.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setTypeFilter("");
                setUnreadOnly(false);
                setFocusedRowId("");
              }}
              className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                !typeFilter && !unreadOnly
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-950"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              }`}
            >
              All Alerts
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter("case-mention")}
              className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                typeFilter === "case-mention"
                  ? "border-sky-700 bg-sky-700 text-white dark:border-sky-300 dark:bg-sky-300 dark:text-sky-950"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              }`}
            >
              Mentions
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter("case-watch")}
              className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                typeFilter === "case-watch"
                  ? "border-emerald-700 bg-emerald-700 text-white dark:border-emerald-300 dark:bg-emerald-300 dark:text-emerald-950"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              }`}
            >
              Watched Cases
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter("template-operation")}
              className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                typeFilter === "template-operation"
                  ? "border-violet-700 bg-violet-700 text-white dark:border-violet-300 dark:bg-violet-300 dark:text-violet-950"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              }`}
            >
              Template Activity
            </button>
            <button
              type="button"
              onClick={() => setSeverityFilter((current) => (current === "high" ? "" : "high"))}
              className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                severityFilter === "high"
                  ? "border-rose-700 bg-rose-700 text-white dark:border-rose-300 dark:bg-rose-300 dark:text-rose-950"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              }`}
            >
              High Severity
            </button>
            <button
              type="button"
              onClick={() => setSeverityFilter((current) => (current === "medium" ? "" : "medium"))}
              className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                severityFilter === "medium"
                  ? "border-amber-700 bg-amber-700 text-white dark:border-amber-300 dark:bg-amber-300 dark:text-amber-950"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              }`}
            >
              Medium Severity
            </button>
            <button
              type="button"
              onClick={() => setSeverityFilter((current) => (current === "low" ? "" : "low"))}
              className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                severityFilter === "low"
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-950"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              }`}
            >
              Low Severity
            </button>
            {sourceOptions.slice(0, 4).map((source) => (
              <button
                key={`notification-source-${source}`}
                type="button"
                onClick={() => setSourceFilter((current) => (current === source ? "" : source))}
                className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                  sourceFilter === source
                    ? "border-violet-700 bg-violet-700 text-white dark:border-violet-300 dark:bg-violet-300 dark:text-violet-950"
                    : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                }`}
              >
                {source}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setUnreadOnly((current) => !current)}
              className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                unreadOnly
                  ? "border-amber-600 bg-amber-500 text-white dark:border-amber-300 dark:bg-amber-300 dark:text-amber-950"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              }`}
            >
              Unread Only
            </button>
            <button
              type="button"
              onClick={() => setShowArchived((current) => !current)}
              className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                showArchived
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-950"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              }`}
            >
              Archived
            </button>
          </div>
        </div>

        <div className="mt-5 rounded-[24px] border border-zinc-200/80 bg-zinc-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-950/80">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Delivery Preferences
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                Tune what gets added to this reviewer inbox for this project.
              </p>
            </div>
            <div className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
              Reviewer:{" "}
              {activeReviewerSession.reviewer?.name ||
                activeReviewerSession.reviewer?.email ||
                "Active reviewer"}
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <label className="flex items-start gap-3 rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
              <input
                type="checkbox"
                checked={notificationPreferences.mentionAlerts}
                onChange={(event) =>
                  updateNotificationPreferences((current) => ({
                    ...current,
                    mentionAlerts: event.target.checked,
                  }))
                }
                className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>
                <span className="font-semibold">Mention alerts</span>
                <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                  Keep inbox entries when review notes mention this reviewer directly.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
              <input
                type="checkbox"
                checked={notificationPreferences.watchAlerts}
                onChange={(event) =>
                  updateNotificationPreferences((current) => ({
                    ...current,
                    watchAlerts: event.target.checked,
                  }))
                }
                className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>
                <span className="font-semibold">Watched-case alerts</span>
                <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                  Receive inbox updates when followed cases get new review activity.
                </span>
              </span>
            </label>
            <label className="flex flex-col gap-2 rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
              <span className="font-semibold">Template import threshold</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Minimum import severity that should create reviewer inbox entries in this project.
              </span>
              <select
                value={notificationPreferences.templateImportAlertMinimumSeverity}
                onChange={(event) =>
                  updateNotificationPreferences((current) => ({
                    ...current,
                    templateImportAlertMinimumSeverity: event.target.value as "low" | "medium" | "high",
                    templateAlertMinimumSeverity: event.target.value as "low" | "medium" | "high",
                  }))
                }
                className="mt-1 min-h-[40px] rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              >
                <option value="low">Low and above</option>
                <option value="medium">Medium and above</option>
                <option value="high">High only</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
              <span className="font-semibold">Template export threshold</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Minimum export severity that should create reviewer inbox entries in this project.
              </span>
              <select
                value={notificationPreferences.templateExportAlertMinimumSeverity}
                onChange={(event) =>
                  updateNotificationPreferences((current) => ({
                    ...current,
                    templateExportAlertMinimumSeverity: event.target.value as "low" | "medium" | "high",
                  }))
                }
                className="mt-1 min-h-[40px] rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              >
                <option value="low">Low and above</option>
                <option value="medium">Medium and above</option>
                <option value="high">High only</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
              <span className="font-semibold">Local source threshold</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Minimum severity for template alerts originating from this project&apos;s own source context.
              </span>
              <select
                value={notificationPreferences.templateLocalAlertMinimumSeverity}
                onChange={(event) =>
                  updateNotificationPreferences((current) => ({
                    ...current,
                    templateLocalAlertMinimumSeverity: event.target.value as "low" | "medium" | "high",
                  }))
                }
                className="mt-1 min-h-[40px] rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              >
                <option value="low">Low and above</option>
                <option value="medium">Medium and above</option>
                <option value="high">High only</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
              <span className="font-semibold">External source threshold</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Minimum severity for template alerts tied to imported or outside-project sources.
              </span>
              <select
                value={notificationPreferences.templateExternalAlertMinimumSeverity}
                onChange={(event) =>
                  updateNotificationPreferences((current) => ({
                    ...current,
                    templateExternalAlertMinimumSeverity: event.target.value as "low" | "medium" | "high",
                  }))
                }
                className="mt-1 min-h-[40px] rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              >
                <option value="low">Low and above</option>
                <option value="medium">Medium and above</option>
                <option value="high">High only</option>
              </select>
            </label>
            <label className="flex items-start gap-3 rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
              <input
                type="checkbox"
                checked={notificationPreferences.templateAlerts}
                onChange={(event) =>
                  updateNotificationPreferences((current) => ({
                    ...current,
                    templateAlerts: event.target.checked,
                  }))
                }
                className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>
                <span className="font-semibold">Template activity alerts</span>
                <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                  Keep inbox entries when reusable template packs are imported or exported.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
              <input
                type="checkbox"
                checked={notificationPreferences.unreadOnlyDefault}
                onChange={(event) => {
                  const checked = event.target.checked;
                  updateNotificationPreferences((current) => ({
                    ...current,
                    unreadOnlyDefault: checked,
                  }));
                  if (!searchParams.has("unread")) {
                    setUnreadOnly(checked);
                  }
                }}
                className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>
                <span className="font-semibold">Unread-only default</span>
                <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                  Start this inbox in unread mode unless the URL asks for another slice.
                </span>
              </span>
            </label>
            <label className="flex flex-col gap-2 rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 lg:col-span-3">
              <span className="font-semibold">Allowed template sources</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Optional comma-separated allowlist for template-operation alerts in this project.
              </span>
              <input
                type="text"
                value={templateAllowedSourcesInput}
                onChange={(event) => setTemplateAllowedSourcesInput(event.target.value)}
                onBlur={() =>
                  updateNotificationPreferences((current) => ({
                    ...current,
                    templateAlertAllowedSources: templateAllowedSourcesInput
                      .split(",")
                      .map((entry) => entry.trim())
                      .filter(Boolean),
                  }))
                }
                placeholder="Shared QA Project, External Starter Pack"
                className="mt-1 min-h-[40px] rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              />
            </label>
            <label className="flex flex-col gap-2 rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 lg:col-span-3">
              <span className="font-semibold">Blocked template sources</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Optional comma-separated blocklist for sources that should not create template alerts.
              </span>
              <input
                type="text"
                value={templateBlockedSourcesInput}
                onChange={(event) => setTemplateBlockedSourcesInput(event.target.value)}
                onBlur={() =>
                  updateNotificationPreferences((current) => ({
                    ...current,
                    templateAlertBlockedSources: templateBlockedSourcesInput
                      .split(",")
                      .map((entry) => entry.trim())
                      .filter(Boolean),
                  }))
                }
                placeholder="Noisy Legacy Pack"
                className="mt-1 min-h-[40px] rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              />
            </label>
            <label className="flex flex-col gap-2 rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 lg:col-span-3">
              <span className="font-semibold">High-priority template sources</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Optional comma-separated list. Matching sources get their template-alert severity elevated before thresholds apply.
              </span>
              <input
                type="text"
                value={templateHighPrioritySourcesInput}
                onChange={(event) => setTemplateHighPrioritySourcesInput(event.target.value)}
                onBlur={() =>
                  updateNotificationPreferences((current) => ({
                    ...current,
                    templateAlertHighPrioritySources: templateHighPrioritySourcesInput
                      .split(",")
                      .map((entry) => entry.trim())
                      .filter(Boolean),
                  }))
                }
                placeholder="External Starter Pack, Shared QA Project"
                className="mt-1 min-h-[40px] rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              />
            </label>
            <label className="flex flex-col gap-2 rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 lg:col-span-3">
              <span className="font-semibold">Import-priority sources</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Optional comma-separated list. Matching sources get extra severity lift only for template imports.
              </span>
              <input
                type="text"
                value={templateImportHighPrioritySourcesInput}
                onChange={(event) => setTemplateImportHighPrioritySourcesInput(event.target.value)}
                onBlur={() =>
                  updateNotificationPreferences((current) => ({
                    ...current,
                    templateImportHighPrioritySources: templateImportHighPrioritySourcesInput
                      .split(",")
                      .map((entry) => entry.trim())
                      .filter(Boolean),
                  }))
                }
                placeholder="External Starter Pack"
                className="mt-1 min-h-[40px] rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              />
            </label>
            <label className="flex flex-col gap-2 rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 lg:col-span-3">
              <span className="font-semibold">Export-priority sources</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Optional comma-separated list. Matching sources get extra severity lift only for template exports.
              </span>
              <input
                type="text"
                value={templateExportHighPrioritySourcesInput}
                onChange={(event) => setTemplateExportHighPrioritySourcesInput(event.target.value)}
                onBlur={() =>
                  updateNotificationPreferences((current) => ({
                    ...current,
                    templateExportHighPrioritySources: templateExportHighPrioritySourcesInput
                      .split(",")
                      .map((entry) => entry.trim())
                      .filter(Boolean),
                  }))
                }
                placeholder="Shared QA Project"
                className="mt-1 min-h-[40px] rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              />
            </label>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-5">
          {[
            { label: "Total Alerts", value: counts.total, hint: "Current reviewer scope" },
            { label: "Unread", value: counts.unread, hint: "Still needs attention" },
            { label: "Mentions", value: counts.mentions, hint: "Directly called into review" },
            showArchived
              ? {
                  label: "Archived Alerts",
                  value: counts.archived,
                  hint: "Stored for later reference",
                }
              : {
                  label: "Watched Cases",
                  value: counts.watching,
                  hint: "Updates from followed cases",
                },
            {
              label: "Template Ops",
              value: counts.templateOps,
              hint: `${counts.templateImports} imports | ${counts.templateExports} exports`,
            },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-[26px] border border-zinc-200/80 bg-zinc-50/70 p-4 dark:border-zinc-700 dark:bg-zinc-900/70"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                {card.label}
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                {card.value}
              </p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{card.hint}</p>
            </div>
          ))}
        </div>
        {templateSourceCounts.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {templateSourceCounts.map((entry) => (
              <button
                key={`template-source-summary-${entry.source}`}
                type="button"
                onClick={() => {
                  setTypeFilter("template-operation");
                  setSourceFilter(entry.source);
                }}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  sourceFilter === entry.source
                    ? "border-violet-700 bg-violet-700 text-white dark:border-violet-300 dark:bg-violet-300 dark:text-violet-950"
                    : "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200 dark:hover:bg-violet-500/20"
                }`}
              >
                {entry.source}: {entry.count}
              </button>
            ))}
          </div>
        ) : null}
        {unreadTemplateSourceCounts.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {unreadTemplateSourceCounts.map((entry) => (
              <button
                key={`unread-template-source-summary-${entry.source}`}
                type="button"
                onClick={() => {
                  setTypeFilter("template-operation");
                  setUnreadOnly(true);
                  setSourceFilter(entry.source);
                }}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  sourceFilter === entry.source && unreadOnly
                    ? "border-cyan-700 bg-cyan-700 text-white dark:border-cyan-300 dark:bg-cyan-300 dark:text-cyan-950"
                    : "border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-200 dark:hover:bg-cyan-500/20"
                }`}
              >
                Unread {entry.source}: {entry.count}
              </button>
            ))}
          </div>
        ) : null}
        {notificationPreferences.templateAlertAllowedSources.length > 0 ||
        notificationPreferences.templateAlertBlockedSources.length > 0 ||
        notificationPreferences.templateAlertHighPrioritySources.length > 0 ||
        notificationPreferences.templateImportHighPrioritySources.length > 0 ||
        notificationPreferences.templateExportHighPrioritySources.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {notificationPreferences.templateAlertAllowedSources.map((source) => (
              <button
                key={`allowed-source-${source}`}
                type="button"
                onClick={() => {
                  setTypeFilter("template-operation");
                  setSourceFilter(source);
                }}
                className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20"
              >
                Allowed: {source}
              </button>
            ))}
            {notificationPreferences.templateAlertBlockedSources.map((source) => (
              <button
                key={`blocked-source-${source}`}
                type="button"
                onClick={() => {
                  setTypeFilter("template-operation");
                  setSourceFilter(source);
                }}
                className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20"
              >
                Blocked: {source}
              </button>
            ))}
            {notificationPreferences.templateAlertHighPrioritySources.map((source) => (
              <button
                key={`priority-source-${source}`}
                type="button"
                onClick={() => {
                  setTypeFilter("template-operation");
                  setSourceFilter(source);
                }}
                className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
              >
                Priority: {source}
              </button>
            ))}
            {notificationPreferences.templateImportHighPrioritySources.map((source) => (
              <button
                key={`import-priority-source-${source}`}
                type="button"
                onClick={() => {
                  setTypeFilter("template-operation");
                  setSourceFilter(source);
                }}
                className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-100 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-200 dark:hover:bg-cyan-500/20"
              >
                Import priority: {source}
              </button>
            ))}
            {notificationPreferences.templateExportHighPrioritySources.map((source) => (
              <button
                key={`export-priority-source-${source}`}
                type="button"
                onClick={() => {
                  setTypeFilter("template-operation");
                  setSourceFilter(source);
                }}
                className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1.5 text-xs font-semibold text-fuchsia-700 transition hover:bg-fuchsia-100 dark:border-fuchsia-500/30 dark:bg-fuchsia-500/10 dark:text-fuchsia-200 dark:hover:bg-fuchsia-500/20"
              >
                Export priority: {source}
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
            Active reviewer:{" "}
            <span className="font-bold">
              {activeReviewerSession.reviewer?.name ||
                activeReviewerSession.reviewer?.email ||
                "Selected reviewer"}
            </span>
          </span>
          {focusedRowId ? (
            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
              Focused case: {focusedRowId}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void markFilteredRead()}
            disabled={isSaving || showArchived}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Mark Filtered Read
          </button>
          <button
            type="button"
            onClick={() => void archiveFilteredNotifications()}
            disabled={isSaving || showArchived}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Archive Filtered
          </button>
          <button
            type="button"
            onClick={() => void clearArchivedNotifications()}
            disabled={isSaving || counts.archived === 0}
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
          >
            Clear Archived
          </button>
          {focusedRowId ? (
            <button
              type="button"
              onClick={() => setFocusedRowId("")}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              Clear Case Focus
            </button>
          ) : null}
          <Link
            href={`/projects/${encodeURIComponent(projectKey)}/cases?from=notifications`}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Open Cases
          </Link>
          {notice ? (
            <span
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                notice.tone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                  : notice.tone === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
                  : "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300"
              }`}
            >
              {notice.text}
            </span>
          ) : null}
        </div>
      </section>

      <section className="rounded-[24px] border border-zinc-200/80 bg-white/96 p-6 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.24)] dark:border-zinc-800 dark:bg-zinc-950/94">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              Filtered Alerts
            </p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              {filteredNotifications.length} visible notification
              {filteredNotifications.length === 1 ? "" : "s"}
            </h3>
          </div>
        </div>

        {filteredNotifications.length > 0 ? (
          <div className="mt-5 space-y-3">
            {filteredNotifications.map((notification) => (
              <div
                key={notification.id}
                className={`rounded-[20px] border p-4 ${
                  notification.readAt
                    ? "border-zinc-200/80 bg-zinc-50/80 dark:border-zinc-700 dark:bg-zinc-950"
                    : "border-amber-200 bg-amber-50/80 dark:border-amber-500/20 dark:bg-amber-500/10"
                }`}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${notificationTone[notification.type]}`}
                      >
                        {notification.type === "case-mention"
                          ? "Mention"
                          : notification.type === "case-watch"
                          ? "Watched Case"
                          : "Template Activity"}
                      </span>
                      {notification.archivedAt ? (
                        <span className="rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                          Archived
                        </span>
                      ) : !notification.readAt ? (
                        <span className="rounded-full border border-amber-200 bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-200">
                          Unread
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-3 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                      {notification.title}
                    </p>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                      {notification.detail}
                    </p>
                    {notification.type === "template-operation" ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        {notification.severity ? (
                          <span
                            className={`rounded-full border px-2.5 py-1 font-semibold uppercase tracking-[0.12em] ${
                              notification.severity === "high"
                                ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
                                : notification.severity === "medium"
                                ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                                : "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                            }`}
                          >
                            {notification.severity}
                          </span>
                        ) : null}
                        {notification.severityLifted ? (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                            Lifted by{" "}
                            {notification.severityLiftReason === "import"
                              ? "import rule"
                              : notification.severityLiftReason === "export"
                              ? "export rule"
                              : "source rule"}
                          </span>
                        ) : null}
                        {notification.sourceLabel ? (
                          <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 font-semibold text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
                            Source: {notification.sourceLabel}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                      <span>{formatUtcDateTime(notification.createdAt)}</span>
                      {notification.rowId ? (
                        <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                          {notification.rowId}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                      {notification.rowId ? (
                        <Link
                          href={`/projects/${encodeURIComponent(
                            projectKey
                          )}/cases?from=notifications&rowId=${encodeURIComponent(
                            notification.rowId
                          )}${
                            notification.commentId
                              ? `&commentId=${encodeURIComponent(notification.commentId)}`
                              : ""
                          }`}
                          className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                        >
                          Open Case
                        </Link>
                      ) : null}
                      {notification.rowId && notification.commentId ? (
                        <Link
                          href={`/projects/${encodeURIComponent(
                            projectKey
                          )}/cases?from=notifications&rowId=${encodeURIComponent(
                            notification.rowId
                          )}&commentId=${encodeURIComponent(notification.commentId)}`}
                          className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200 dark:hover:bg-sky-500/20"
                        >
                          Open Exact Comment
                        </Link>
                      ) : null}
                      {!notification.readAt ? (
                        <button
                          type="button"
                        onClick={() => void markNotificationRead(notification.id)}
                        disabled={isSaving}
                        className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                      >
                        Mark Read
                      </button>
                    ) : !notification.archivedAt ? (
                      <button
                        type="button"
                        onClick={() => void archiveNotification(notification.id)}
                        disabled={isSaving}
                        className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                      >
                        Archive
                      </button>
                    ) : (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                        Stored
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-[20px] border border-dashed border-zinc-300 bg-zinc-50/70 p-8 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300">
            No notifications match the current filters. Widen the inbox back to all
            alerts or switch off `Unread Only` to review older items.
          </div>
        )}
      </section>
    </div>
  );
}
