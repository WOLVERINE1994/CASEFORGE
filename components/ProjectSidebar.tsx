"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LabelWithBadge, NavItem as SafeNavItem, ResponsiveToolbar } from "./SafeLayout";
import { useProjectDataState } from "./ProjectDataStateContext";
import { useProjectRouteMetrics } from "./ProjectRouteMetricsContext";
import { useActiveReviewerSession } from "./useActiveReviewerSession";
import { getSalesforceRows } from "../utils/salesforce";
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
  | "salesforce"
  | "activity"
  | "automation"
  | "notifications"
  | "release"
  | "runs"
  | "reports"
  | "board"
  | "issues"
  | "settings"
  | "library";

type NavItem = {
  href: string;
  label: string;
  kind: NavKind;
  count?: number;
  matchPrefixes?: string[];
};

const isUuidLike = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  );

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
    case "salesforce":
      return (
        <svg {...commonProps}>
          <path d="M7 7.5h10" />
          <path d="M9 12h8" />
          <path d="M11 16.5h6" />
          <path d="M6 5.5v13" />
        </svg>
      );
    case "automation":
      return (
        <svg {...commonProps}>
          <path d="M12 4.5 8.2 11H12l-1 8.5 4.8-7H12l.9-8Z" />
        </svg>
      );
    case "activity":
      return (
        <svg {...commonProps}>
          <path d="M6 7.5h12" />
          <path d="M6 12h7" />
          <path d="M6 16.5h10" />
          <circle cx="18" cy="12" r="2.5" />
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

const isActiveNavItem = (pathname: string, item: NavItem) =>
  [item.href, ...(item.matchPrefixes ?? [])].some(
    (candidate) => pathname === candidate || pathname.startsWith(`${candidate}/`)
  );

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
  const shellMeta = [
    sprintName.trim() || null,
    releaseName.trim() || null,
    teamName.trim() || null,
  ].filter(Boolean) as string[];
  const displayProjectKey =
    projectKey.trim() && !isUuidLike(projectKey) ? projectKey.trim() : null;

  const primaryNavItems = useMemo<NavItem[]>(
    () => [
      {
        href: buildProjectHref(`/projects/${encodedProjectKey}`),
        label: "Overview",
        kind: "overview" as const,
      },
      {
        href: buildProjectHref(`/projects/${encodedProjectKey}/cases`),
        label: "Test Management",
        kind: "cases" as const,
        count: resolvedCaseCount,
      },
      {
        href: buildProjectHref(`/projects/${encodedProjectKey}/salesforce`),
        label: "Salesforce",
        kind: "salesforce" as const,
        count: getSalesforceRows(projectDataState?.project ?? null).length,
      },
      {
        href: buildProjectHref(`/projects/${encodedProjectKey}/runs`),
        label: "Runs",
        kind: "runs" as const,
      },
      {
        href: buildProjectHref(`/projects/${encodedProjectKey}/reports`),
        label: "Reports",
        kind: "reports" as const,
      },
      {
        href: buildProjectHref(`/projects/${encodedProjectKey}/releases`),
        label: "Releases",
        kind: "release" as const,
        matchPrefixes: [
          `/projects/${encodedProjectKey}/release`,
          `/projects/${encodedProjectKey}/releases`,
        ],
      },
      {
        href: buildProjectHref(`/projects/${encodedProjectKey}/automation`),
        label: "Automation",
        kind: "automation" as const,
        matchPrefixes: [`/projects/${encodedProjectKey}/automation`],
      },
      {
        href: buildProjectHref(`/projects/${encodedProjectKey}/activity`),
        label: "Activity",
        kind: "activity" as const,
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
      projectDataState?.project,
      resolvedCaseCount,
      resolvedIssueCount,
    ]
  );
  const secondaryNavItems = useMemo<NavItem[]>(
    () => [
      {
        href: buildProjectHref(`/projects/${encodedProjectKey}/workspace`),
        label: "AI Case Generation",
        kind: "workspace",
      },
      {
        href: buildProjectHref(`/projects/${encodedProjectKey}/notifications`),
        label: "Notifications",
        kind: "notifications",
        count: unreadNotifications,
      },
      {
        href: buildProjectHref(`/projects/${encodedProjectKey}/board`),
        label: "Board",
        kind: "board",
      },
    ],
    [buildProjectHref, encodedProjectKey, unreadNotifications]
  );
  const navigationGroups = useMemo(
    () => [
      {
        key: "overview",
        label: "Test Management",
        open: overviewGroupOpen,
        setOpen: setOverviewGroupOpen,
        items: primaryNavItems.filter(
          (item) =>
            item.kind === "overview" ||
            item.kind === "cases" ||
            item.kind === "salesforce" ||
            item.kind === "runs" ||
            item.kind === "reports" ||
            item.kind === "release"
        ),
      },
      {
        key: "delivery",
        label: "Delivery",
        open: deliveryGroupOpen,
        setOpen: setDeliveryGroupOpen,
        items: primaryNavItems.filter(
          (item) =>
            item.kind === "automation" ||
            item.kind === "activity" ||
            item.kind === "issues"
        ),
      },
      {
        key: "collaboration",
        label: "Administration",
        open: collaborationGroupOpen,
        setOpen: setCollaborationGroupOpen,
        items: primaryNavItems.filter((item) => item.kind === "settings"),
      },
    ],
    [
      collaborationGroupOpen,
      deliveryGroupOpen,
      primaryNavItems,
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
      className="cf-safe-row w-full justify-between rounded-xl px-1 py-1 text-left transition hover:bg-slate-800/70"
    >
      <span className="cf-safe-label text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </span>
      <svg
        className={`h-4 w-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
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
    <aside className="cf-panel sticky top-6 rounded-[24px]">
      <div
        className="flex max-h-[calc(100vh-3rem)] flex-col gap-5 overflow-y-auto p-5 pr-4 [mask-image:linear-gradient(to_bottom,transparent_0,black_20px,black_calc(100%-20px),transparent_100%)] [scrollbar-gutter:stable] dark:[mask-image:linear-gradient(to_bottom,transparent_0,black_20px,black_calc(100%-20px),transparent_100%)]"
        style={{ scrollbarWidth: "thin" }}
      >
      <div className="rounded-[20px] border border-slate-700/80 bg-[radial-gradient(circle_at_top_right,_rgba(37,99,235,0.18),_transparent_46%),linear-gradient(180deg,_rgba(17,24,39,0.98)_0%,_rgba(15,23,42,0.98)_100%)] p-4 shadow-[0_24px_60px_-42px_rgba(37,99,235,0.65)]">
        <div className="min-w-0">
          <h2 className="cf-safe-wrap text-xl font-semibold tracking-tight text-slate-50">
            {projectName.trim() || "Unsaved workspace"}
          </h2>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Structured QA operations across manual testing, automation, execution, and reporting.
        </p>
        <div className="cf-safe-toolbar mt-4 text-xs">
          {displayProjectKey ? (
            <span className="cf-safe-chip cf-safe-wrap rounded-full border border-slate-600/80 bg-slate-900/85 px-2.5 py-1 font-semibold text-slate-200">
              {displayProjectKey}
            </span>
          ) : null}
          {shellMeta.length ? shellMeta.map((item) => (
            <span key={item} className="cf-safe-chip cf-safe-wrap rounded-full border border-slate-700/80 bg-slate-900/75 px-2.5 py-1 font-semibold text-slate-300">
              {item}
            </span>
          )) : (
            <span className="cf-safe-chip rounded-full border border-slate-700/80 bg-slate-900/75 px-2.5 py-1 font-semibold text-slate-300">
              Workspace active
            </span>
          )}
        </div>
      </div>

      <div className="cf-card rounded-[20px] p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          Project Navigation
        </p>
        <div className="space-y-3">
        {navigationGroups.map((group) => {
          const hasActiveItem = group.items.some((item) => isActiveNavItem(pathname, item));
          const isOpen = hasActiveItem ? true : group.open;

          return (
            <div
              key={group.key}
              className="rounded-[18px] border border-slate-700/70 bg-slate-900/55 p-3"
            >
              {renderSectionToggle(group.label, isOpen, () =>
                group.setOpen((current) => !current)
              )}
              {isOpen ? (
                <nav className="mt-2 space-y-1.5">
                  {group.items.map((item) => {
                    const active = isActiveNavItem(pathname, item);

                    return (
                      <SafeNavItem
                        key={item.href}
                        href={item.href}
                        active={active}
                        className={`${
                          active
                            ? "border-sky-400/20 bg-[linear-gradient(135deg,rgba(37,99,235,0.2),rgba(79,70,229,0.18),rgba(124,58,237,0.2))] text-slate-50 shadow-[0_18px_34px_-28px_rgba(79,70,229,0.85)]"
                            : "border-transparent bg-transparent text-slate-300 hover:border-slate-700 hover:bg-slate-800/70"
                        }`}
                        icon={<NavIcon kind={item.kind} />}
                        label={item.label}
                        title={item.label}
                        badge={typeof item.count === "number" ? item.count : undefined}
                        badgeClassName={active ? "bg-slate-950/85 text-cyan-200" : "bg-slate-800 text-slate-300"}
                      >
                        {active ? (
                          <span className="absolute inset-y-2 left-1.5 w-1 rounded-full bg-cyan-300" />
                        ) : null}
                      </SafeNavItem>
                    );
                  })}
                </nav>
              ) : null}
            </div>
          );
        })}
        </div>
      </div>

      <div className="cf-card rounded-[20px] p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          Secondary Tools
        </p>
        <ResponsiveToolbar>
          {secondaryNavItems.map((item) => {
            const active = isActiveNavItem(pathname, item);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`min-w-0 max-w-full rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                  active
                    ? "border-sky-400/20 bg-[linear-gradient(135deg,rgba(37,99,235,0.2),rgba(79,70,229,0.18),rgba(124,58,237,0.2))] text-slate-50"
                    : "border-slate-700 bg-slate-900/80 text-slate-300 hover:bg-slate-800"
                }`}
                title={item.label}
              >
                <LabelWithBadge
                  badge={typeof item.count === "number" ? item.count : undefined}
                  badgeClassName="bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300"
                  icon={<NavIcon kind={item.kind} />}
                  label={item.label}
                  title={item.label}
                />
              </Link>
            );
          })}
        </ResponsiveToolbar>
      </div>

      <div className="cf-card rounded-[20px] p-4">
        {renderSectionToggle("Reviewer Focus", reviewerOpen, () =>
          setReviewerOpen((current) => !current)
        )}
        {reviewerOpen ? (
          <>
            <p className="mt-2 text-sm font-semibold text-slate-100">
              <span className="cf-safe-wrap">
                {activeReviewerSession.reviewer?.name ||
                  activeReviewerSession.reviewer?.email ||
                  "No active reviewer"}
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {unreadNotifications} unread reviewer alert
              {unreadNotifications === 1 ? "" : "s"} on this project.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={buildProjectHref(`/projects/${encodedProjectKey}/notifications?unread=1`)}
                className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-semibold text-cyan-200 transition hover:bg-cyan-500/15"
              >
                Open Inbox
              </Link>
              <Link
                href="/settings/users"
                className="rounded-xl border border-slate-700 bg-slate-900/85 px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:bg-slate-800"
              >
                Change Reviewer
              </Link>
            </div>
          </>
        ) : null}
      </div>

      <Link
        href="/projects"
        className="inline-flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/85 px-3.5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
      >
        <NavIcon kind="library" />
        Project Library
      </Link>
      </div>
    </aside>
  );
}
