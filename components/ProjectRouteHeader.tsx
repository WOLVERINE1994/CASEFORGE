"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useProjectRouteMetrics } from "./ProjectRouteMetricsContext";
import { useProjectDataState } from "./ProjectDataStateContext";
import { LabelWithBadge, ResponsiveToolbar } from "./SafeLayout";
import { useActiveReviewerSession } from "./useActiveReviewerSession";
import { formatUtcDate } from "../utils/date-format";
import {
  defaultReviewerNotificationPreferences,
  loadReviewerNotificationPreferences,
} from "../utils/reviewer-notification-preferences";
import type { ReviewerNotification } from "../utils/workspace";

type Props = {
  projectKey: string;
  projectName: string;
  sprintName: string;
  releaseName: string;
  teamName: string;
  caseCount: number;
  issueCount: number;
  releaseDecision?: "safe" | "caution" | "blocked";
  releaseDecisionRecordedAt?: number;
  showNavigation?: boolean;
};

type RouteIconProps = {
  kind:
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
    | "library";
};

function RouteIcon({ kind }: RouteIconProps) {
  const commonProps = {
    className: "mr-2 h-4 w-4 shrink-0",
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
    case "board":
      return (
        <svg {...commonProps}>
          <rect x="4.5" y="5" width="5" height="14" rx="1.5" />
          <rect x="10.5" y="8" width="4" height="11" rx="1.5" />
          <rect x="15.5" y="6.5" width="4" height="12.5" rx="1.5" />
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
  }
}

const routeBadgeClassName = (active: boolean) =>
  `cf-safe-chip inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border px-1.5 text-[10px] font-bold uppercase tracking-[0.08em] ${
    active
      ? "border-cyan-400/20 bg-slate-950/85 text-cyan-200"
      : "border-slate-700 bg-slate-900/80 text-slate-400"
  }`;

const linkClassName = (active: boolean) =>
  `group relative inline-flex min-w-0 max-w-full items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
    active
      ? "border-transparent bg-[linear-gradient(135deg,#2563EB_0%,#4F46E5_52%,#7C3AED_100%)] text-white shadow-[0_18px_34px_-24px_rgba(79,70,229,0.72)]"
      : "border-slate-700 bg-slate-900/80 text-slate-200 hover:bg-slate-800"
  }`;

const countClassName = (active: boolean) =>
  `cf-safe-chip inline-flex min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
    active
      ? "bg-slate-950/85 text-cyan-200"
      : "bg-slate-800 text-slate-300"
  }`;

const isActiveRoute = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

const releaseDecisionChipTone = {
  safe: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
  caution:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
  blocked:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
} as const;

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

export default function ProjectRouteHeader({
  projectKey,
  projectName,
  sprintName,
  releaseName,
  teamName,
  caseCount,
  issueCount,
  releaseDecision,
  releaseDecisionRecordedAt,
  showNavigation = true,
}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const metrics = useProjectRouteMetrics();
  const projectDataState = useProjectDataState();
  const activeReviewerSession = useActiveReviewerSession();
  const cameFromRelease = searchParams.get("from") === "release";
  const encodedProjectKey = encodeURIComponent(projectKey);
  const buildProjectHref = (basePath: string) => {
    const nextParams = new URLSearchParams();

    if (cameFromRelease) {
      nextParams.set("from", "release");
    }

    const query = nextParams.toString();
    return query ? `${basePath}?${query}` : basePath;
  };
  const overviewHref = buildProjectHref(`/projects/${encodedProjectKey}`);
  const casesHref = buildProjectHref(`/projects/${encodedProjectKey}/cases`);
  const salesforceHref = buildProjectHref(
    `/projects/${encodedProjectKey}/salesforce`
  );
  const activityHref = buildProjectHref(`/projects/${encodedProjectKey}/activity`);
  const automationHref = buildProjectHref(`/projects/${encodedProjectKey}/automation`);
  const notificationsHref = buildProjectHref(
    `/projects/${encodedProjectKey}/notifications`
  );
  const releaseHref = buildProjectHref(`/projects/${encodedProjectKey}/release`);
  const runsHref = buildProjectHref(`/projects/${encodedProjectKey}/runs`);
  const reportsHref = buildProjectHref(`/projects/${encodedProjectKey}/reports`);
  const releasesHref = buildProjectHref(`/projects/${encodedProjectKey}/releases`);
  const workspaceHref = buildProjectHref(`/projects/${encodedProjectKey}/workspace`);
  const boardHref = buildProjectHref(`/projects/${encodedProjectKey}/board`);
  const issuesHref = buildProjectHref(`/projects/${encodedProjectKey}/issues`);
  const planningSummary = [
    projectKey.trim() || "NO-KEY",
    sprintName.trim() || "No sprint",
    releaseName.trim() || "No release",
    teamName.trim() || "No team",
  ].join(" | ");
  const resolvedCaseCount = metrics?.caseCount ?? caseCount;
  const resolvedIssueCount = metrics?.issueCount ?? issueCount;
  const resolvedReleaseDecision =
    projectDataState?.project?.releaseReview?.recordedDecision ?? releaseDecision;
  const resolvedReleaseDecisionRecordedAt =
    projectDataState?.project?.releaseReview?.decisionRecordedAt ??
    releaseDecisionRecordedAt;
  const releaseDecisionLabel =
    resolvedReleaseDecision === "safe"
      ? "Safe to Release"
      : resolvedReleaseDecision === "caution"
      ? "Release with Caution"
      : resolvedReleaseDecision === "blocked"
      ? "Not Ready"
      : null;
  const unreadReviewerNotifications = (
    projectDataState?.project?.notifications ?? []
  ).filter((notification) =>
    matchesReviewerNotification(notification, activeReviewerSession.reviewer)
  );
  const activeReviewerNotifications = unreadReviewerNotifications.filter(
    (notification) => !notification.archivedAt
  );
  const unreadReviewerNotificationCount = activeReviewerNotifications.filter(
    (notification) => !notification.readAt
  ).length;
  const unreadMentionCount = activeReviewerNotifications.filter(
    (notification) => notification.type === "case-mention" && !notification.readAt
  ).length;
  const unreadWatchCount = activeReviewerNotifications.filter(
    (notification) => notification.type === "case-watch" && !notification.readAt
  ).length;
  const unreadTemplateOperationCount = activeReviewerNotifications.filter(
    (notification) => notification.type === "template-operation" && !notification.readAt
  ).length;
  const unreadHighSeverityTemplateCount = activeReviewerNotifications.filter(
    (notification) =>
      notification.type === "template-operation" &&
      !notification.readAt &&
      notification.severity === "high"
  ).length;
  const unreadTemplateSourceSummary = Array.from(
    activeReviewerNotifications.reduce((accumulator, notification) => {
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
    .sort((left, right) => right.count - left.count || left.source.localeCompare(right.source));
  const dominantTemplateSource = unreadTemplateSourceSummary[0] ?? null;
  const affectedCaseCount = new Set(
    activeReviewerNotifications
      .filter((notification) => !notification.readAt && notification.rowId)
      .map((notification) => notification.rowId)
  ).size;
  const reviewerPreferenceId =
    activeReviewerSession.reviewer?.id ||
    activeReviewerSession.reviewer?.email ||
    activeReviewerSession.reviewer?.name ||
    "";
  const templateNotificationPreferences =
    projectDataState?.project?.id && reviewerPreferenceId
      ? loadReviewerNotificationPreferences(projectDataState.project.id, reviewerPreferenceId)
      : defaultReviewerNotificationPreferences;
  const hasTemplateSourceRules =
    templateNotificationPreferences.templateAlertAllowedSources.length > 0 ||
    templateNotificationPreferences.templateAlertBlockedSources.length > 0 ||
    templateNotificationPreferences.templateAlertHighPrioritySources.length > 0 ||
    templateNotificationPreferences.templateImportHighPrioritySources.length > 0 ||
    templateNotificationPreferences.templateExportHighPrioritySources.length > 0;
  const reviewerSummaryChips = [
    {
      key: "mentions",
      label: "Mentions",
      count: unreadMentionCount,
      href: `${notificationsHref}${notificationsHref.includes("?") ? "&" : "?"}type=case-mention&unread=1`,
      className:
        "cf-safe-chip inline-flex min-w-0 items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200 dark:hover:bg-sky-500/20",
    },
    {
      key: "watched",
      label: "Watched updates",
      count: unreadWatchCount,
      href: `${notificationsHref}${notificationsHref.includes("?") ? "&" : "?"}type=case-watch&unread=1`,
      className:
        "cf-safe-chip inline-flex min-w-0 items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20",
    },
    {
      key: "template",
      label: "Template alerts",
      count: unreadTemplateOperationCount,
      href: `${notificationsHref}${notificationsHref.includes("?") ? "&" : "?"}type=template-operation&unread=1`,
      className:
        "cf-safe-chip inline-flex min-w-0 items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800 transition hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200 dark:hover:bg-violet-500/20",
    },
  ].filter((entry) => entry.count > 0);
  const reviewerContextNotes = [
    unreadHighSeverityTemplateCount > 0
      ? `${unreadHighSeverityTemplateCount} high template alert${
          unreadHighSeverityTemplateCount === 1 ? "" : "s"
        }`
      : null,
    dominantTemplateSource ? `Top source ${dominantTemplateSource.source}` : null,
    hasTemplateSourceRules ? "source rules active" : null,
    affectedCaseCount > 0
      ? `${affectedCaseCount} case${affectedCaseCount === 1 ? "" : "s"} need attention`
      : null,
  ].filter(Boolean) as string[];

  return (
    <section className="cf-panel flex flex-col gap-4 rounded-[28px] px-5 py-5">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Project Route
          </p>
          <h1 className="cf-safe-wrap mt-1 text-3xl font-semibold tracking-tight text-slate-50">
            {projectName.trim() || "Unsaved workspace"}
          </h1>
          <p className="cf-safe-wrap mt-2 text-sm text-slate-300">{planningSummary}</p>
          <ResponsiveToolbar className="mt-3 gap-2.5">
            {cameFromRelease && (
              <div className="cf-safe-chip inline-flex items-center rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200">
                Release Review Context
              </div>
            )}
            {resolvedReleaseDecision && releaseDecisionLabel ? (
              <div
                className={`cf-safe-chip inline-flex min-w-0 items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] ${releaseDecisionChipTone[resolvedReleaseDecision]}`}
              >
                <span className="cf-safe-label">{releaseDecisionLabel}</span>
                {resolvedReleaseDecisionRecordedAt ? (
                  <span className="ml-2 shrink-0 normal-case tracking-normal opacity-80">
                    {formatUtcDate(resolvedReleaseDecisionRecordedAt)}
                  </span>
                ) : null}
              </div>
            ) : null}
            {activeReviewerSession.reviewer ? (
              <Link
                href="/settings/users"
                className="cf-safe-chip inline-flex min-w-0 items-center rounded-full border border-slate-700 bg-slate-900/85 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
              >
                <LabelWithBadge
                  label="Active Reviewer"
                  badge={activeReviewerSession.reviewer.name?.trim() ||
                    activeReviewerSession.reviewer.email?.trim() ||
                    "Selected"}
                  badgeClassName="bg-transparent px-0 py-0 text-xs text-slate-50"
                />
              </Link>
            ) : activeReviewerSession.loading ? (
                <span className="cf-safe-chip inline-flex items-center rounded-full border border-slate-700 bg-slate-900/85 px-3 py-1.5 text-xs font-semibold text-slate-400">
                  Loading reviewer...
                </span>
              ) : (
                <Link
                  href="/settings/users"
                  className="cf-safe-chip inline-flex items-center rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/15"
                >
                  Set Active Reviewer
                </Link>
            )}
            {activeReviewerSession.reviewer ? (
              <Link
                href={notificationsHref}
                className="cf-safe-chip inline-flex min-w-0 items-center rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/15"
              >
                <LabelWithBadge
                  label="Reviewer inbox"
                  badge={`${unreadReviewerNotificationCount} unread`}
                  badgeClassName="bg-transparent px-0 py-0 text-xs text-cyan-100"
                />
              </Link>
            ) : null}
          </ResponsiveToolbar>
          {activeReviewerSession.reviewer && activeReviewerNotifications.length > 0 ? (
            <div className="mt-3 rounded-[18px] border border-slate-700/80 bg-slate-900/60 px-4 py-3">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Reviewer Focus
                  </p>
                  <p className="cf-safe-wrap mt-1 text-sm text-slate-200">
                    Open the reviewer inbox for the full detail view. The header keeps only the signals you are most likely to check first.
                  </p>
                  {reviewerContextNotes.length > 0 ? (
                    <p className="cf-safe-wrap mt-2 text-xs text-slate-400">
                      {reviewerContextNotes.join(" | ")}
                    </p>
                  ) : null}
                </div>
                <ResponsiveToolbar className="lg:justify-end">
                  <Link
                    href={`${notificationsHref}${notificationsHref.includes("?") ? "&" : "?"}unread=1`}
                    className="cf-safe-chip inline-flex min-w-0 items-center rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/15"
                  >
                    <LabelWithBadge label="Unread alerts" badge={unreadReviewerNotificationCount} badgeClassName="bg-transparent px-0 py-0 text-xs text-cyan-100" />
                  </Link>
                  {reviewerSummaryChips.map((entry) => (
                    <Link key={entry.key} href={entry.href} className={entry.className}>
                      {entry.label}: <span className="ml-1 font-bold">{entry.count}</span>
                    </Link>
                  ))}
                  {affectedCaseCount > 0 ? (
                    <Link
                      href={`${casesHref}${casesHref.includes("?") ? "&" : "?"}collaboration=attention`}
                      className="cf-safe-chip inline-flex min-w-0 items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800 transition hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200 dark:hover:bg-violet-500/20"
                    >
                      <LabelWithBadge label="Cases with attention" badge={affectedCaseCount} badgeClassName="bg-transparent px-0 py-0 text-xs text-violet-100" />
                    </Link>
                  ) : null}
                </ResponsiveToolbar>
              </div>
            </div>
          ) : null}
        </div>

        {showNavigation ? (
          <div className="cf-card min-w-0 rounded-[20px] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Primary Modules
            </p>
            <ResponsiveToolbar className="mt-3">
            <Link href={overviewHref} className={linkClassName(isActiveRoute(pathname, overviewHref))}>
              <RouteIcon kind="overview" />
              <span className={routeBadgeClassName(isActiveRoute(pathname, overviewHref))}>OV</span>
              <span className="cf-safe-label">Overview</span>
            </Link>
            <Link href={casesHref} className={linkClassName(isActiveRoute(pathname, casesHref))}>
              <RouteIcon kind="cases" />
              <span className={routeBadgeClassName(isActiveRoute(pathname, casesHref))}>CS</span>
              <span className="cf-safe-label">Cases</span>
              <span className={countClassName(isActiveRoute(pathname, casesHref))}>{resolvedCaseCount}</span>
            </Link>
            <Link href={salesforceHref} className={linkClassName(isActiveRoute(pathname, salesforceHref))}>
              <RouteIcon kind="salesforce" />
              <span className={routeBadgeClassName(isActiveRoute(pathname, salesforceHref))}>SF</span>
              <span className="cf-safe-label">Salesforce</span>
            </Link>
            <Link href={runsHref} className={linkClassName(isActiveRoute(pathname, runsHref))}>
              <RouteIcon kind="runs" />
              <span className={routeBadgeClassName(isActiveRoute(pathname, runsHref))}>RN</span>
              <span className="cf-safe-label">Runs</span>
            </Link>
            <Link href={reportsHref} className={linkClassName(isActiveRoute(pathname, reportsHref))}>
              <RouteIcon kind="reports" />
              <span className={routeBadgeClassName(isActiveRoute(pathname, reportsHref))}>RP</span>
              <span className="cf-safe-label">Reports</span>
            </Link>
            <Link href={releasesHref} className={linkClassName(isActiveRoute(pathname, releasesHref) || isActiveRoute(pathname, releaseHref))}>
              <RouteIcon kind="release" />
              <span className={routeBadgeClassName(isActiveRoute(pathname, releasesHref) || isActiveRoute(pathname, releaseHref))}>RL</span>
              <span className="cf-safe-label">Releases</span>
            </Link>
            <Link href={activityHref} className={linkClassName(isActiveRoute(pathname, activityHref))}>
              <RouteIcon kind="activity" />
              <span className={routeBadgeClassName(isActiveRoute(pathname, activityHref))}>AC</span>
              <span className="cf-safe-label">Activity</span>
            </Link>
            <Link href={automationHref} className={linkClassName(isActiveRoute(pathname, automationHref))}>
              <RouteIcon kind="automation" />
              <span className={routeBadgeClassName(isActiveRoute(pathname, automationHref))}>AT</span>
              <span className="cf-safe-label">Automation</span>
            </Link>
            <Link href={issuesHref} className={linkClassName(isActiveRoute(pathname, issuesHref))}>
              <RouteIcon kind="issues" />
              <span className={routeBadgeClassName(isActiveRoute(pathname, issuesHref))}>IS</span>
              <span className="cf-safe-label">Issues</span>
              <span className={countClassName(isActiveRoute(pathname, issuesHref))}>{resolvedIssueCount}</span>
            </Link>
            </ResponsiveToolbar>
            <ResponsiveToolbar className="mt-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Secondary Tools
            </span>
            <Link href={workspaceHref} className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-800">
              <RouteIcon kind="workspace" />
              <span className="cf-safe-label">Workspace</span>
            </Link>
            <Link
              href={notificationsHref}
              className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
            >
              <RouteIcon kind="notifications" />
              <span className="cf-safe-label">Notifications</span>
              <span className="cf-safe-chip rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">
                {unreadReviewerNotificationCount}
              </span>
            </Link>
            <Link href={boardHref} className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-800">
              <RouteIcon kind="board" />
              <span className="cf-safe-label">Board</span>
            </Link>
            <Link
              href="/projects"
              className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
            >
              <RouteIcon kind="library" />
              <span className="cf-safe-label">Project Library</span>
            </Link>
            </ResponsiveToolbar>
          </div>
        ) : null}
      </div>
    </section>
  );
}
