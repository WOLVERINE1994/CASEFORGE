"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useProjectDataState } from "./ProjectDataStateContext";
import { useProjectRouteMetrics } from "./ProjectRouteMetricsContext";
import { useActiveReviewerSession } from "./useActiveReviewerSession";
import type { ReviewerNotification } from "../utils/workspace";

type ProjectSidebarProps = {
  projectKey: string;
  projectName: string;
  sprintName: string;
  releaseName: string;
  teamName: string;
  caseCount: number;
  issueCount: number;
};

type NavKind =
  | "overview"
  | "workspace"
  | "cases"
  | "notifications"
  | "release"
  | "runs"
  | "reports"
  | "board"
  | "issues"
  | "settings"
  | "library";

function NavIcon({ kind }: { kind: NavKind }) {
  const commonProps = {
    className: "h-4 w-4 shrink-0",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
  };

  switch (kind) {
    case "overview":
      return (
        <svg {...commonProps}>
          <path d="M4 12 12 5l8 7" />
          <path d="M6.5 10.5V19h11v-8.5" />
        </svg>
      );
    case "workspace":
      return (
        <svg {...commonProps}>
          <path d="M5 6.5h14" />
          <path d="M5 12h14" />
          <path d="M5 17.5h8" />
        </svg>
      );
    case "cases":
      return (
        <svg {...commonProps}>
          <rect x="5" y="4.5" width="14" height="15" rx="2.5" />
          <path d="M8.5 9h7" />
          <path d="M8.5 13h7" />
          <path d="M8.5 17h4" />
        </svg>
      );
    case "notifications":
      return (
        <svg {...commonProps}>
          <path d="M8 17.5h8" />
          <path d="M6.5 15.5h11l-1.2-2.2V10a4.3 4.3 0 0 0-8.6 0v3.3L6.5 15.5Z" />
          <path d="M11.8 4.5h.4" />
        </svg>
      );
    case "release":
      return (
        <svg {...commonProps}>
          <path d="M12 4.5 6.5 7.5v4.5c0 3.5 2.1 6.5 5.5 7.5 3.4-1 5.5-4 5.5-7.5V7.5L12 4.5Z" />
          <path d="m9.5 12 1.6 1.6 3.4-3.6" />
        </svg>
      );
    case "runs":
      return (
        <svg {...commonProps}>
          <path d="M6 6.5h12" />
          <path d="M6 12h7" />
          <path d="M6 17.5h9" />
          <circle cx="18" cy="12" r="2.5" />
        </svg>
      );
    case "reports":
      return (
        <svg {...commonProps}>
          <path d="M5 18.5h14" />
          <path d="M7 16V10.5" />
          <path d="M12 16V6.5" />
          <path d="M17 16v-4" />
        </svg>
      );
    case "board":
      return (
        <svg {...commonProps}>
          <rect x="4.5" y="5" width="5" height="14" rx="1.5" />
          <rect x="10.5" y="8" width="4" height="11" rx="1.5" />
          <rect x="15.5" y="6.5" width="4" height="12.5" rx="1.5" />
        </svg>
      );
    case "issues":
      return (
        <svg {...commonProps}>
          <path d="M12 4.5 18.5 8v8L12 19.5 5.5 16V8L12 4.5Z" />
          <path d="M12 9v4" />
          <path d="M12 16h.01" />
        </svg>
      );
    case "library":
      return (
        <svg {...commonProps}>
          <path d="M5.5 6.5h4v11h-4Z" />
          <path d="M10 6.5h4v11h-4Z" />
          <path d="M14.5 6.5H18v11h-3.5Z" />
        </svg>
      );
    case "settings":
      return (
        <svg {...commonProps}>
          <path d="M12 4.5 14 7l3-.2.9 2.8 2.6 1.5-1.3 2.7 1.3 2.7-2.6 1.5-.9 2.8-3-.2-2 2.5-2-2.5-3 .2-.9-2.8-2.6-1.5 1.3-2.7-1.3-2.7 2.6-1.5.9-2.8 3 .2Z" />
          <circle cx="12" cy="13" r="2.5" />
        </svg>
      );
  }
}

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

const readProjectSidebarState = (projectKey: string) => {
  if (typeof window === "undefined") {
    return {
      overviewGroupOpen: true,
      deliveryGroupOpen: true,
      collaborationGroupOpen: true,
      reviewerOpen: true,
    };
  }

  try {
    const rawValue = window.localStorage.getItem(
      `caseforge:project-sidebar:${projectKey}`
    );
    if (!rawValue) {
      return {
        overviewGroupOpen: true,
        deliveryGroupOpen: true,
        collaborationGroupOpen: true,
        reviewerOpen: true,
      };
    }

    const parsed = JSON.parse(rawValue) as {
      overviewGroupOpen?: boolean;
      deliveryGroupOpen?: boolean;
      collaborationGroupOpen?: boolean;
      reviewerOpen?: boolean;
    };

    return {
      overviewGroupOpen:
        typeof parsed.overviewGroupOpen === "boolean"
          ? parsed.overviewGroupOpen
          : true,
      deliveryGroupOpen:
        typeof parsed.deliveryGroupOpen === "boolean"
          ? parsed.deliveryGroupOpen
          : true,
      collaborationGroupOpen:
        typeof parsed.collaborationGroupOpen === "boolean"
          ? parsed.collaborationGroupOpen
          : true,
      reviewerOpen:
        typeof parsed.reviewerOpen === "boolean" ? parsed.reviewerOpen : true,
    };
  } catch {
    return {
      overviewGroupOpen: true,
      deliveryGroupOpen: true,
      collaborationGroupOpen: true,
      reviewerOpen: true,
    };
  }
};

export default function ProjectSidebar({
  projectKey,
  projectName,
  sprintName,
  releaseName,
  teamName,
  caseCount,
  issueCount,
}: ProjectSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const projectDataState = useProjectDataState();
  const metrics = useProjectRouteMetrics();
  const activeReviewerSession = useActiveReviewerSession();
  const cameFromRelease = searchParams.get("from") === "release";
  const encodedProjectKey = encodeURIComponent(projectKey);
  const [overviewGroupOpen, setOverviewGroupOpen] = useState(
    () => readProjectSidebarState(projectKey).overviewGroupOpen
  );
  const [deliveryGroupOpen, setDeliveryGroupOpen] = useState(
    () => readProjectSidebarState(projectKey).deliveryGroupOpen
  );
  const [collaborationGroupOpen, setCollaborationGroupOpen] = useState(
    () => readProjectSidebarState(projectKey).collaborationGroupOpen
  );
  const [reviewerOpen, setReviewerOpen] = useState(
    () => readProjectSidebarState(projectKey).reviewerOpen
  );
  const storageKey = `caseforge:project-sidebar:${projectKey}`;

  const buildProjectHref = useCallback((basePath: string) => {
    const nextParams = new URLSearchParams();

    if (cameFromRelease) {
      nextParams.set("from", "release");
    }

    const query = nextParams.toString();
    return query ? `${basePath}?${query}` : basePath;
  }, [cameFromRelease]);

  const resolvedCaseCount = metrics?.caseCount ?? caseCount;
  const resolvedIssueCount = metrics?.issueCount ?? issueCount;
  const unreadNotifications = (projectDataState?.project?.notifications ?? []).filter(
    (notification) =>
      matchesReviewerNotification(notification, activeReviewerSession.reviewer) &&
      !notification.archivedAt &&
      !notification.readAt
  ).length;

  const navItems = useMemo(
    () => [
      {
        href: buildProjectHref(`/projects/${encodedProjectKey}`),
        label: "Overview",
        kind: "overview" as const,
      },
      {
        href: buildProjectHref(`/projects/${encodedProjectKey}/workspace`),
        label: "Workspace",
        kind: "workspace" as const,
      },
      {
        href: buildProjectHref(`/projects/${encodedProjectKey}/cases`),
        label: "Cases",
        kind: "cases" as const,
        count: resolvedCaseCount,
      },
      {
        href: buildProjectHref(`/projects/${encodedProjectKey}/notifications`),
        label: "Notifications",
        kind: "notifications" as const,
        count: unreadNotifications,
      },
      {
        href: buildProjectHref(`/projects/${encodedProjectKey}/runs`),
        label: "Runs",
        kind: "runs" as const,
      },
      {
        href: buildProjectHref(`/projects/${encodedProjectKey}/release`),
        label: "Release",
        kind: "release" as const,
      },
      {
        href: buildProjectHref(`/projects/${encodedProjectKey}/reports`),
        label: "Reports",
        kind: "reports" as const,
      },
      {
        href: buildProjectHref(`/projects/${encodedProjectKey}/board`),
        label: "Board",
        kind: "board" as const,
      },
      {
        href: buildProjectHref(`/projects/${encodedProjectKey}/issues`),
        label: "Issues",
        kind: "issues" as const,
        count: resolvedIssueCount,
      },
      {
        href: buildProjectHref(`/projects/${encodedProjectKey}/settings`),
        label: "Settings",
        kind: "settings" as const,
      },
    ],
    [
      buildProjectHref,
      encodedProjectKey,
      resolvedCaseCount,
      resolvedIssueCount,
      unreadNotifications,
    ]
  );
  const navigationGroups = useMemo(
    () => [
      {
        key: "overview",
        label: "Project Overview",
        open: overviewGroupOpen,
        setOpen: setOverviewGroupOpen,
        items: navItems.filter((item) => item.kind === "overview" || item.kind === "workspace"),
      },
      {
        key: "delivery",
        label: "Delivery Flow",
        open: deliveryGroupOpen,
        setOpen: setDeliveryGroupOpen,
        items: navItems.filter(
          (item) =>
            item.kind === "cases" ||
            item.kind === "runs" ||
            item.kind === "release" ||
            item.kind === "reports"
        ),
      },
      {
        key: "collaboration",
        label: "Tracking And Collaboration",
        open: collaborationGroupOpen,
        setOpen: setCollaborationGroupOpen,
        items: navItems.filter(
          (item) =>
            item.kind === "notifications" ||
            item.kind === "board" ||
            item.kind === "issues" ||
            item.kind === "settings"
        ),
      },
    ],
    [
      collaborationGroupOpen,
      deliveryGroupOpen,
      navItems,
      overviewGroupOpen,
      setCollaborationGroupOpen,
      setDeliveryGroupOpen,
      setOverviewGroupOpen,
    ]
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          overviewGroupOpen,
          deliveryGroupOpen,
          collaborationGroupOpen,
          reviewerOpen,
        })
      );
    } catch {
      // Ignore persistence failures for non-critical UI state.
    }
  }, [
    collaborationGroupOpen,
    deliveryGroupOpen,
    overviewGroupOpen,
    reviewerOpen,
    storageKey,
  ]);

  const renderSectionToggle = (
    label: string,
    open: boolean,
    onToggle: () => void
  ) => (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between rounded-xl px-1 py-1 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-950"
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <svg
        className={`h-4 w-4 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );

  return (
    <aside className="sticky top-6 rounded-[24px] border border-zinc-200/80 bg-white/96 shadow-[0_26px_60px_-42px_rgba(15,23,42,0.28)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/94">
      <div
        className="flex max-h-[calc(100vh-3rem)] flex-col gap-5 overflow-y-auto p-5 pr-4 [mask-image:linear-gradient(to_bottom,transparent_0,black_20px,black_calc(100%-20px),transparent_100%)] [scrollbar-gutter:stable] dark:[mask-image:linear-gradient(to_bottom,transparent_0,black_20px,black_calc(100%-20px),transparent_100%)]"
        style={{ scrollbarWidth: "thin" }}
      >
      <div className="rounded-[20px] border border-zinc-200/80 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
          Project Shell
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          {projectName.trim() || "Unsaved workspace"}
        </h2>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
            {(projectKey || "NO-KEY").trim()}
          </span>
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
            {(sprintName || "No sprint").trim()}
          </span>
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
            {(releaseName || "No release").trim()}
          </span>
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
            {(teamName || "No team").trim()}
          </span>
        </div>
      </div>

      <div className="rounded-[20px] border border-zinc-200/80 bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
          Project Navigation
        </p>
        <div className="space-y-3">
        {navigationGroups.map((group) => {
          const hasActiveItem = group.items.some((item) => pathname === item.href);
          const isOpen = hasActiveItem ? true : group.open;

          return (
            <div
              key={group.key}
              className="rounded-[18px] border border-zinc-200/80 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-950/55"
            >
              {renderSectionToggle(group.label, isOpen, () =>
                group.setOpen((current) => !current)
              )}
              {isOpen ? (
                <nav className="mt-2 space-y-1.5">
                  {group.items.map((item) => {
                    const active = pathname === item.href;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`relative flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition ${
                          active
                            ? "border-emerald-200 bg-emerald-50 text-emerald-950 shadow-sm ring-1 ring-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100 dark:ring-emerald-500/10"
                            : "border-transparent bg-transparent text-zinc-700 hover:border-zinc-200 hover:bg-white dark:text-zinc-200 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
                        }`}
                      >
                        {active ? (
                          <span className="absolute inset-y-2 left-1.5 w-1 rounded-full bg-emerald-500 dark:bg-emerald-300" />
                        ) : null}
                        <span className="flex items-center gap-3">
                          <NavIcon kind={item.kind} />
                          {item.label}
                        </span>
                        {typeof item.count === "number" ? (
                          <span
                            className={`inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold ${
                              active
                                ? "bg-white text-emerald-800 dark:bg-zinc-950 dark:text-emerald-200"
                                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                            }`}
                          >
                            {item.count}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
                </nav>
              ) : null}
            </div>
          );
        })}
        </div>
      </div>

      <div className="rounded-[20px] border border-zinc-200/80 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
        {renderSectionToggle("Reviewer Focus", reviewerOpen, () =>
          setReviewerOpen((current) => !current)
        )}
        {reviewerOpen ? (
          <>
            <p className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {activeReviewerSession.reviewer?.name ||
                activeReviewerSession.reviewer?.email ||
                "No active reviewer"}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {unreadNotifications} unread reviewer alert
              {unreadNotifications === 1 ? "" : "s"} on this project.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={buildProjectHref(`/projects/${encodedProjectKey}/notifications?unread=1`)}
                className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-800 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
              >
                Open Inbox
              </Link>
              <Link
                href="/settings/users"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Change Reviewer
              </Link>
            </div>
          </>
        ) : null}
      </div>

      <Link
        href="/projects"
        className="inline-flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3.5 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
      >
        <NavIcon kind="library" />
        Project Library
      </Link>
      </div>
    </aside>
  );
}
