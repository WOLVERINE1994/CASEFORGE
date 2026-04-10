"use client";

import Link from "next/link";
import { useActiveReviewerSession } from "./useActiveReviewerSession";
import type { Project } from "../utils/workspace";
import { loadReviewerNotificationPreferences } from "../utils/reviewer-notification-preferences";

type Props = {
  compact?: boolean;
  projects?: Project[];
};

const matchesReviewerNotification = (
  notification: NonNullable<Project["notifications"]>[number],
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

export default function ActiveReviewerBanner({
  compact = false,
  projects = [],
}: Props) {
  const activeReviewerSession = useActiveReviewerSession();

  if (activeReviewerSession.loading) {
    return (
      <div className="rounded-[24px] border border-zinc-200/80 bg-white/88 px-4 py-3 text-sm text-zinc-500 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/88 dark:text-zinc-400">
        Loading active reviewer...
      </div>
    );
  }

  if (!activeReviewerSession.reviewer) {
    return (
      <div className="rounded-[24px] border border-amber-200 bg-amber-50/90 px-4 py-3 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-800 dark:text-amber-200">
              Active Reviewer
            </p>
            <p className="mt-1 text-sm text-amber-900 dark:text-amber-100">
              No reviewer is selected for this browser session yet.
            </p>
          </div>
          <Link
            href="/settings/users"
            className="inline-flex items-center rounded-2xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-semibold text-amber-900 shadow-sm transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-zinc-950 dark:text-amber-100 dark:hover:bg-amber-500/20"
          >
            Set Active Reviewer
          </Link>
        </div>
      </div>
    );
  }

  const reviewerLabel =
    activeReviewerSession.reviewer.name?.trim() ||
    activeReviewerSession.reviewer.email?.trim() ||
    "Active reviewer";

  const reviewerNotifications = projects
    .flatMap((project) =>
      (project.notifications ?? [])
        .filter((notification) =>
          matchesReviewerNotification(notification, activeReviewerSession.reviewer) &&
          !notification.archivedAt
        )
        .map((notification) => ({
          notification,
          project,
        }))
    );
  const unreadReviewerNotifications = reviewerNotifications.filter(
    ({ notification }) => !notification.readAt
  ).length;
  const unreadMentionCount = reviewerNotifications.filter(
    ({ notification }) => notification.type === "case-mention" && !notification.readAt
  ).length;
  const unreadWatchCount = reviewerNotifications.filter(
    ({ notification }) => notification.type === "case-watch" && !notification.readAt
  ).length;
  const unreadTemplateOperationCount = reviewerNotifications.filter(
    ({ notification }) => notification.type === "template-operation" && !notification.readAt
  ).length;
  const unreadTemplateImportCount = reviewerNotifications.filter(
    ({ notification }) =>
      notification.type === "template-operation" &&
      notification.operation === "import" &&
      !notification.readAt
  ).length;
  const unreadTemplateExportCount = reviewerNotifications.filter(
    ({ notification }) =>
      notification.type === "template-operation" &&
      notification.operation === "export" &&
      !notification.readAt
  ).length;
  const unreadHighSeverityTemplateCount = reviewerNotifications.filter(
    ({ notification }) =>
      notification.type === "template-operation" &&
      !notification.readAt &&
      notification.severity === "high"
  ).length;
  const unreadTemplateSourceSummary = Array.from(
    reviewerNotifications.reduce((accumulator, { notification }) => {
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
  const hasTemplateSourceRules =
    activeReviewerSession.reviewer &&
    projects.some((project) => {
      const reviewerId =
        activeReviewerSession.reviewer?.id ||
        activeReviewerSession.reviewer?.email ||
        activeReviewerSession.reviewer?.name ||
        "";
      if (!project.id || !reviewerId) {
        return false;
      }
      const preferences = loadReviewerNotificationPreferences(
        project.id,
        reviewerId
      );
      return (
        preferences.templateAlertAllowedSources.length > 0 ||
        preferences.templateAlertBlockedSources.length > 0 ||
        preferences.templateAlertHighPrioritySources.length > 0
      );
    });
  const topNotificationProject =
    projects
      .map((project) => {
        const matchingNotifications = (project.notifications ?? []).filter((notification) =>
          matchesReviewerNotification(notification, activeReviewerSession.reviewer) &&
          !notification.archivedAt
        );

        return {
          project,
          unreadCount: matchingNotifications.filter((notification) => !notification.readAt).length,
          totalCount: matchingNotifications.length,
        };
      })
      .filter((entry) => entry.totalCount > 0)
      .sort((left, right) => right.unreadCount - left.unreadCount || right.totalCount - left.totalCount)[0] ??
    null;
  const notificationsBaseHref = topNotificationProject
    ? `/projects/${encodeURIComponent(
        topNotificationProject.project.projectKey?.trim() || topNotificationProject.project.id
      )}/notifications`
    : null;
  const mentionHref = notificationsBaseHref ? `${notificationsBaseHref}?type=case-mention` : null;
  const watchHref = notificationsBaseHref ? `${notificationsBaseHref}?type=case-watch` : null;
  const templateOperationHref = notificationsBaseHref
    ? `${notificationsBaseHref}?type=template-operation`
    : null;
  const dominantTemplateSourceHref =
    notificationsBaseHref && dominantTemplateSource
      ? `${notificationsBaseHref}?type=template-operation&source=${encodeURIComponent(
          dominantTemplateSource.source
        )}&unread=1`
      : null;
  const unreadHref = notificationsBaseHref ? `${notificationsBaseHref}?unread=1` : null;

  if (compact) {
    return (
      <div className="rounded-[24px] border border-emerald-200 bg-emerald-50/90 px-4 py-3 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
              Active Reviewer: {reviewerLabel}
            </p>
            <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-200/80">
              {unreadReviewerNotifications} unread reviewer alert
              {unreadReviewerNotifications === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-200/80">
              {unreadMentionCount} mentions | {unreadWatchCount} watched |{" "}
              {unreadTemplateOperationCount} template alerts
            </p>
            {unreadTemplateOperationCount > 0 ? (
              <p className="mt-1 text-xs text-violet-700 dark:text-violet-300">
                {unreadTemplateImportCount} imports | {unreadTemplateExportCount} exports
              </p>
            ) : null}
            {unreadHighSeverityTemplateCount > 0 ? (
              <p className="mt-1 text-xs font-semibold text-rose-700 dark:text-rose-300">
                {unreadHighSeverityTemplateCount} high-severity template alert
                {unreadHighSeverityTemplateCount === 1 ? "" : "s"}
              </p>
            ) : null}
            {dominantTemplateSource ? (
              <p className="mt-1 text-xs text-violet-700 dark:text-violet-300">
                Top template source:{" "}
                <span className="font-semibold">
                  {dominantTemplateSource.source}
                </span>{" "}
                ({dominantTemplateSource.count})
              </p>
            ) : null}
          {hasTemplateSourceRules ? (
            <p className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
              Source rules are actively shaping template alerts.
            </p>
          ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {unreadHref ? (
              <Link
                href={unreadHref}
                className="inline-flex items-center rounded-2xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-zinc-950 dark:text-emerald-100 dark:hover:bg-emerald-500/20"
              >
                Open Inbox
              </Link>
            ) : null}
            <Link
              href="/settings/users"
              className="inline-flex items-center rounded-2xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-zinc-950 dark:text-emerald-100 dark:hover:bg-emerald-500/20"
            >
              Change Reviewer
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[28px] border border-emerald-200 bg-emerald-50/90 px-5 py-4 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800 dark:text-emerald-200">
            Active Reviewer Session
          </p>
          <p className="mt-1 text-sm text-emerald-900 dark:text-emerald-100">
            {reviewerLabel}
            {activeReviewerSession.reviewer.email?.trim()
              ? ` | ${activeReviewerSession.reviewer.email.trim()}`
              : ""}
          </p>
          <p className="mt-2 text-xs text-emerald-800/80 dark:text-emerald-200/80">
            {unreadReviewerNotifications} unread reviewer alert
            {unreadReviewerNotifications === 1 ? "" : "s"} across {projects.length} project
            {projects.length === 1 ? "" : "s"}.
          </p>
          {topNotificationProject ? (
            <p className="mt-2 text-xs text-emerald-800/80 dark:text-emerald-200/80">
              Focus project:{" "}
              <span className="font-semibold">
                {topNotificationProject.project.name}
              </span>
              {" | "}
              {topNotificationProject.unreadCount} unread, {unreadMentionCount} mention
              {unreadMentionCount === 1 ? "" : "s"}, {unreadWatchCount} watch alert
              {unreadWatchCount === 1 ? "" : "s"}, {unreadTemplateOperationCount} template alert
              {unreadTemplateOperationCount === 1 ? "" : "s"}.
            </p>
          ) : null}
          {unreadTemplateOperationCount > 0 ? (
            <p className="mt-2 text-xs text-violet-700 dark:text-violet-300">
              Template mix: {unreadTemplateImportCount} import
              {unreadTemplateImportCount === 1 ? "" : "s"} | {unreadTemplateExportCount} export
              {unreadTemplateExportCount === 1 ? "" : "s"}.
            </p>
          ) : null}
          {unreadHighSeverityTemplateCount > 0 ? (
            <p className="mt-2 text-xs font-semibold text-rose-700 dark:text-rose-300">
              {unreadHighSeverityTemplateCount} high-severity template alert
              {unreadHighSeverityTemplateCount === 1 ? "" : "s"} need attention.
            </p>
          ) : null}
          {dominantTemplateSource ? (
            <p className="mt-2 text-xs text-violet-700 dark:text-violet-300">
              Dominant template source:{" "}
              <span className="font-semibold">{dominantTemplateSource.source}</span>
              {" | "}
              {dominantTemplateSource.count} unread template alert
              {dominantTemplateSource.count === 1 ? "" : "s"}.
            </p>
          ) : null}
          {hasTemplateSourceRules ? (
            <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
              Template source allow/block, priority, or import/export priority rules are active for this reviewer.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {unreadHref ? (
            <Link
              href={unreadHref}
              className="inline-flex items-center rounded-2xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-zinc-950 dark:text-emerald-100 dark:hover:bg-emerald-500/20"
            >
              Open Inbox
            </Link>
          ) : null}
          {mentionHref ? (
            <Link
              href={mentionHref}
              className="inline-flex items-center rounded-2xl border border-sky-300 bg-white px-4 py-2.5 text-sm font-semibold text-sky-900 shadow-sm transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-zinc-950 dark:text-sky-100 dark:hover:bg-sky-500/20"
            >
              Open Mentions
            </Link>
          ) : null}
          {watchHref ? (
            <Link
              href={watchHref}
              className="inline-flex items-center rounded-2xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-zinc-950 dark:text-emerald-100 dark:hover:bg-emerald-500/20"
            >
              Watched Cases
            </Link>
          ) : null}
          {templateOperationHref ? (
            <Link
              href={templateOperationHref}
              className="inline-flex items-center rounded-2xl border border-violet-300 bg-white px-4 py-2.5 text-sm font-semibold text-violet-900 shadow-sm transition hover:bg-violet-100 dark:border-violet-500/30 dark:bg-zinc-950 dark:text-violet-100 dark:hover:bg-violet-500/20"
            >
              Template Activity
            </Link>
          ) : null}
          {dominantTemplateSourceHref ? (
            <Link
              href={dominantTemplateSourceHref}
              className="inline-flex items-center rounded-2xl border border-violet-300 bg-white px-4 py-2.5 text-sm font-semibold text-violet-900 shadow-sm transition hover:bg-violet-100 dark:border-violet-500/30 dark:bg-zinc-950 dark:text-violet-100 dark:hover:bg-violet-500/20"
            >
              Source: {dominantTemplateSource?.source}
            </Link>
          ) : null}
          <Link
            href="/settings/users"
            className="inline-flex items-center rounded-2xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-zinc-950 dark:text-emerald-100 dark:hover:bg-emerald-500/20"
          >
            Manage Reviewer Session
          </Link>
        </div>
      </div>
    </div>
  );
}

