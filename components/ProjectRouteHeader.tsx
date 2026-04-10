"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useProjectRouteMetrics } from "./ProjectRouteMetricsContext";
import { useProjectDataState } from "./ProjectDataStateContext";
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
  `mr-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full border px-1.5 text-[10px] font-bold uppercase tracking-[0.08em] ${
    active
      ? "border-emerald-200 bg-white text-emerald-800 dark:border-emerald-500/20 dark:bg-zinc-950 dark:text-emerald-200"
      : "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
  }`;

const linkClassName = (active: boolean) =>
  `group relative inline-flex items-center rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
    active
      ? "border-emerald-200 bg-emerald-50 text-emerald-950 shadow-sm ring-1 ring-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100 dark:ring-emerald-500/10"
      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
  }`;

const countClassName = (active: boolean) =>
  `ml-2 inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
    active
      ? "bg-white text-emerald-800 dark:bg-zinc-950 dark:text-emerald-200"
      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
  }`;

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
  const workspaceHref = buildProjectHref(`/projects/${encodedProjectKey}/workspace`);
  const casesHref = buildProjectHref(`/projects/${encodedProjectKey}/cases`);
  const notificationsHref = buildProjectHref(
    `/projects/${encodedProjectKey}/notifications`
  );
  const releaseHref = buildProjectHref(`/projects/${encodedProjectKey}/release`);
  const runsHref = buildProjectHref(`/projects/${encodedProjectKey}/runs`);
  const reportsHref = buildProjectHref(`/projects/${encodedProjectKey}/reports`);
  const boardHref = buildProjectHref(`/projects/${encodedProjectKey}/board`);
  const issuesHref = buildProjectHref(`/projects/${encodedProjectKey}/issues`);
  const planningSummary = [
    projectKey.trim() || "NO-KEY",
    sprintName.trim() || "No sprint",
    releaseName.trim() || "No release",
    teamName.trim() || "No team",
  ].join(" · ");
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
  const unreadTemplateImportCount = activeReviewerNotifications.filter(
    (notification) =>
      notification.type === "template-operation" &&
      notification.operation === "import" &&
      !notification.readAt
  ).length;
  const unreadTemplateExportCount = activeReviewerNotifications.filter(
    (notification) =>
      notification.type === "template-operation" &&
      notification.operation === "export" &&
      !notification.readAt
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

  return (
    <section className="sticky top-4 z-20 flex flex-col gap-4 rounded-[24px] border border-zinc-200/80 bg-white/94 px-5 py-5 shadow-[0_24px_55px_-38px_rgba(15,23,42,0.26)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/94">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
            Project Route
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            {projectName.trim() || "Unsaved workspace"}
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{planningSummary}</p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {cameFromRelease && (
              <div className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
                Release Review Context
              </div>
            )}
            {resolvedReleaseDecision && releaseDecisionLabel ? (
              <div
                className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] ${releaseDecisionChipTone[resolvedReleaseDecision]}`}
              >
                {releaseDecisionLabel}
                {resolvedReleaseDecisionRecordedAt ? (
                  <span className="ml-2 normal-case tracking-normal opacity-80">
                    {formatUtcDate(resolvedReleaseDecisionRecordedAt)}
                  </span>
                ) : null}
              </div>
            ) : null}
            {activeReviewerSession.reviewer ? (
              <Link
                href="/settings/users"
                className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Active Reviewer:{" "}
                <span className="ml-1 font-bold">
                  {activeReviewerSession.reviewer.name?.trim() ||
                    activeReviewerSession.reviewer.email?.trim() ||
                    "Selected"}
                </span>
              </Link>
            ) : activeReviewerSession.loading ? (
              <span className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                Loading reviewer...
              </span>
            ) : (
              <Link
                href="/settings/users"
                className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
              >
                Set Active Reviewer
              </Link>
            )}
            {activeReviewerSession.reviewer ? (
              <Link
                href={notificationsHref}
                className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
              >
                Reviewer Alerts:{" "}
                <span className="ml-1 font-bold">
                  {unreadReviewerNotificationCount} unread
                </span>
              </Link>
            ) : null}
          </div>
          {activeReviewerSession.reviewer && activeReviewerNotifications.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={`${notificationsHref}${notificationsHref.includes("?") ? "&" : "?"}unread=1`}
                className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
              >
                Unread alerts: <span className="ml-1 font-bold">{unreadReviewerNotificationCount}</span>
              </Link>
              <Link
                href={`${notificationsHref}${notificationsHref.includes("?") ? "&" : "?"}type=case-mention&unread=1`}
                className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200 dark:hover:bg-sky-500/20"
              >
                Mentions: <span className="ml-1 font-bold">{unreadMentionCount}</span>
              </Link>
              <Link
                href={`${notificationsHref}${notificationsHref.includes("?") ? "&" : "?"}type=case-watch&unread=1`}
                className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20"
              >
                Watched updates: <span className="ml-1 font-bold">{unreadWatchCount}</span>
              </Link>
              <Link
                href={`${notificationsHref}${notificationsHref.includes("?") ? "&" : "?"}type=template-operation&unread=1`}
                className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800 transition hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200 dark:hover:bg-violet-500/20"
              >
                Template alerts: <span className="ml-1 font-bold">{unreadTemplateOperationCount}</span>
              </Link>
              {unreadTemplateImportCount > 0 ? (
                <Link
                  href={`${notificationsHref}${notificationsHref.includes("?") ? "&" : "?"}type=template-operation&unread=1`}
                  className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-800 transition hover:bg-cyan-100 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-200 dark:hover:bg-cyan-500/20"
                >
                  Template imports: <span className="ml-1 font-bold">{unreadTemplateImportCount}</span>
                </Link>
              ) : null}
              {unreadTemplateExportCount > 0 ? (
                <Link
                  href={`${notificationsHref}${notificationsHref.includes("?") ? "&" : "?"}type=template-operation&unread=1`}
                  className="inline-flex items-center rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1.5 text-xs font-semibold text-fuchsia-800 transition hover:bg-fuchsia-100 dark:border-fuchsia-500/30 dark:bg-fuchsia-500/10 dark:text-fuchsia-200 dark:hover:bg-fuchsia-500/20"
                >
                  Template exports: <span className="ml-1 font-bold">{unreadTemplateExportCount}</span>
                </Link>
              ) : null}
              {unreadHighSeverityTemplateCount > 0 ? (
                <Link
                  href={`${notificationsHref}${notificationsHref.includes("?") ? "&" : "?"}type=template-operation&severity=high&unread=1`}
                  className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20"
                >
                  High template alerts: <span className="ml-1 font-bold">{unreadHighSeverityTemplateCount}</span>
                </Link>
              ) : null}
              {dominantTemplateSource ? (
                <Link
                  href={`${notificationsHref}${notificationsHref.includes("?") ? "&" : "?"}type=template-operation&source=${encodeURIComponent(
                    dominantTemplateSource.source
                  )}&unread=1`}
                  className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800 transition hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200 dark:hover:bg-violet-500/20"
                >
                  Top source: <span className="ml-1 font-bold">{dominantTemplateSource.source}</span>
                </Link>
              ) : null}
              {hasTemplateSourceRules ? (
                <Link
                  href={`${notificationsHref}${notificationsHref.includes("?") ? "&" : "?"}type=template-operation`}
                  className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
                >
                  Source rules active
                </Link>
              ) : null}
              <Link
                href={`${casesHref}${casesHref.includes("?") ? "&" : "?"}collaboration=attention`}
                className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800 transition hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200 dark:hover:bg-violet-500/20"
              >
                Cases with attention: <span className="ml-1 font-bold">{affectedCaseCount}</span>
              </Link>
            </div>
          ) : null}
        </div>

        {showNavigation ? (
          <div className="rounded-[20px] border border-zinc-200/80 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/55">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              Route Navigation
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
            <Link href={overviewHref} className={linkClassName(pathname === overviewHref)}>
              <RouteIcon kind="overview" />
              <span className={routeBadgeClassName(pathname === overviewHref)}>OV</span>
              Overview
            </Link>
            <Link href={workspaceHref} className={linkClassName(pathname === workspaceHref)}>
              <RouteIcon kind="workspace" />
              <span className={routeBadgeClassName(pathname === workspaceHref)}>WS</span>
              Workspace
            </Link>
            <Link href={casesHref} className={linkClassName(pathname === casesHref)}>
              <RouteIcon kind="cases" />
              <span className={routeBadgeClassName(pathname === casesHref)}>CS</span>
              Cases
              <span className={countClassName(pathname === casesHref)}>{resolvedCaseCount}</span>
            </Link>
            <Link
              href={notificationsHref}
              className={linkClassName(pathname === notificationsHref)}
            >
              <RouteIcon kind="notifications" />
              <span className={routeBadgeClassName(pathname === notificationsHref)}>NT</span>
              Notifications
              <span className={countClassName(pathname === notificationsHref)}>
                {unreadReviewerNotificationCount}
              </span>
            </Link>
            <Link href={releaseHref} className={linkClassName(pathname === releaseHref)}>
              <RouteIcon kind="release" />
              <span className={routeBadgeClassName(pathname === releaseHref)}>RL</span>
              Release
            </Link>
            <Link href={runsHref} className={linkClassName(pathname === runsHref)}>
              <RouteIcon kind="runs" />
              <span className={routeBadgeClassName(pathname === runsHref)}>RN</span>
              Runs
            </Link>
            <Link href={reportsHref} className={linkClassName(pathname === reportsHref)}>
              <RouteIcon kind="reports" />
              <span className={routeBadgeClassName(pathname === reportsHref)}>RP</span>
              Reports
            </Link>
            <Link href={boardHref} className={linkClassName(pathname === boardHref)}>
              <RouteIcon kind="board" />
              <span className={routeBadgeClassName(pathname === boardHref)}>BD</span>
              Board
            </Link>
            <Link href={issuesHref} className={linkClassName(pathname === issuesHref)}>
              <RouteIcon kind="issues" />
              <span className={routeBadgeClassName(pathname === issuesHref)}>IS</span>
              Issues
              <span className={countClassName(pathname === issuesHref)}>{resolvedIssueCount}</span>
            </Link>
            <Link
              href="/projects"
              className="inline-flex items-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              <RouteIcon kind="library" />
              Project Library
            </Link>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
