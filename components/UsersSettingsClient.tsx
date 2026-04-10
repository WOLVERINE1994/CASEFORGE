"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { UserRecord } from "../services/user-service";
import AppSidebar from "./AppSidebar";
import ResponsiveShell from "./ResponsiveShell";
import {
  defaultReviewerNotificationPreferences,
  loadGlobalReviewerNotificationPreferences,
  saveGlobalReviewerNotificationPreferences,
  type ReviewerNotificationPreferences,
} from "../utils/reviewer-notification-preferences";

type ReviewerSession = {
  id?: string;
  name?: string;
  email?: string;
} | null;

const toneByRole: Record<UserRecord["role"], string> = {
  admin: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
  manager:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
  tester: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200",
  reviewer:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
};

export default function UsersSettingsClient() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [sessionReviewer, setSessionReviewer] = useState<ReviewerSession>(null);
  const [directoryState, setDirectoryState] = useState<"loading" | "ready" | "unavailable">(
    "loading"
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [notificationPreferences, setNotificationPreferences] =
    useState<ReviewerNotificationPreferences>(defaultReviewerNotificationPreferences);
  const [templateAllowedSourcesInput, setTemplateAllowedSourcesInput] = useState("");
  const [templateBlockedSourcesInput, setTemplateBlockedSourcesInput] = useState("");
  const [templateHighPrioritySourcesInput, setTemplateHighPrioritySourcesInput] = useState("");
  const [templateImportHighPrioritySourcesInput, setTemplateImportHighPrioritySourcesInput] =
    useState("");
  const [templateExportHighPrioritySourcesInput, setTemplateExportHighPrioritySourcesInput] =
    useState("");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [usersResponse, reviewerResponse] = await Promise.all([
          fetch("/api/users", { cache: "no-store" }),
          fetch("/api/session/reviewer", { cache: "no-store" }),
        ]);

        const usersPayload = (await usersResponse.json()) as {
          users?: UserRecord[];
        };
        const reviewerPayload = (await reviewerResponse.json()) as {
          reviewer?: ReviewerSession;
        };

        if (cancelled) {
          return;
        }

        if (usersResponse.ok && Array.isArray(usersPayload.users)) {
          setUsers(usersPayload.users.filter((user) => user.isActive));
          setDirectoryState("ready");
        } else {
          setDirectoryState("unavailable");
        }

        setSessionReviewer(reviewerPayload.reviewer ?? null);
      } catch {
        if (!cancelled) {
          setDirectoryState("unavailable");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const reviewerPreferenceId =
      sessionReviewer?.id || sessionReviewer?.email || sessionReviewer?.name || "";

    if (!reviewerPreferenceId) {
      setNotificationPreferences(defaultReviewerNotificationPreferences);
      return;
    }

    setNotificationPreferences(loadGlobalReviewerNotificationPreferences(reviewerPreferenceId));
  }, [sessionReviewer?.email, sessionReviewer?.id, sessionReviewer?.name]);

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

  const activeReviewerLabel = useMemo(() => {
    if (!sessionReviewer) {
      return "No active reviewer selected";
    }

    return sessionReviewer.name?.trim() || sessionReviewer.email?.trim() || "Unnamed reviewer";
  }, [sessionReviewer]);

  const updateSessionReviewer = async (reviewer: ReviewerSession) => {
    setIsSaving(true);
    setNotice(null);

    try {
      const response = await fetch("/api/session/reviewer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reviewer }),
      });
      const payload = (await response.json()) as {
        reviewer?: ReviewerSession;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to update active reviewer.");
      }

      setSessionReviewer(payload.reviewer ?? null);
      setNotice(
        payload.reviewer
          ? "Active reviewer updated for this browser session."
          : "Active reviewer cleared for this browser session."
      );
    } catch (error) {
      setNotice(
        error instanceof Error && error.message.trim()
          ? error.message
          : "Failed to update active reviewer."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const updateNotificationPreferences = (
    updater: (current: ReviewerNotificationPreferences) => ReviewerNotificationPreferences
  ) => {
    const reviewerPreferenceId =
      sessionReviewer?.id || sessionReviewer?.email || sessionReviewer?.name || "";
    if (!reviewerPreferenceId) {
      return;
    }

    setNotificationPreferences((current) => {
      const nextPreferences = updater(current);
      saveGlobalReviewerNotificationPreferences(reviewerPreferenceId, nextPreferences);
      return nextPreferences;
    });
    setNotice("Default reviewer inbox preferences updated for this browser session.");
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f6faf8_0%,_#eef4f1_100%)] px-6 py-8 text-zinc-950 dark:bg-[linear-gradient(180deg,_#09090b_0%,_#111827_100%)] dark:text-zinc-50">
      <ResponsiveShell
        mobileTitle="Users"
        mobileSubtitle="Reviewer session and directory"
        desktopSidebar={<AppSidebar />}
        mobileSidebar={<AppSidebar />}
        storageKey="caseforge:drawer:users"
      >
        <div className="flex min-w-0 flex-col gap-6">
        <section className="rounded-[32px] border border-white/80 bg-white/92 px-8 py-8 shadow-[0_24px_65px_-36px_rgba(15,23,42,0.35)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/88">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
            Settings
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Users</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
            Pick the active reviewer for this browser session so release decisions can auto-fill
            `recorded by` without making the release page guess who is operating the tool.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
              Active Reviewer: {activeReviewerLabel}
            </span>
            {sessionReviewer ? (
              <button
                type="button"
                onClick={() => void updateSessionReviewer(null)}
                disabled={isSaving}
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Clear Active Reviewer
              </button>
            ) : null}
          </div>

          {notice ? (
            <div className="mt-4 rounded-[20px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
              {notice}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/settings/admin"
              className="rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              Open Admin
            </Link>
            <Link
              href="/"
              className="rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              Back to Dashboard
            </Link>
            <Link
              href="/projects"
              className="rounded-2xl bg-[linear-gradient(135deg,_#0f766e_0%,_#14532d_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_-18px_rgba(5,150,105,0.7)] transition hover:brightness-110"
            >
              Open Projects
            </Link>
          </div>
        </section>

        <section className="rounded-[32px] border border-white/80 bg-white/92 px-8 py-8 shadow-[0_24px_65px_-36px_rgba(15,23,42,0.35)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/88">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
              Inbox Defaults
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Reviewer notification preferences
            </h2>
            <p className="text-sm leading-7 text-zinc-600 dark:text-zinc-300">
              Set default inbox behavior for the active reviewer in this browser. Project-level
              notification screens can still override the current project slice.
            </p>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <label className="flex items-start gap-3 rounded-[24px] border border-zinc-200/80 bg-zinc-50/80 p-5 text-sm text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-200">
              <input
                type="checkbox"
                checked={notificationPreferences.mentionAlerts}
                disabled={!sessionReviewer}
                onChange={(event) =>
                  updateNotificationPreferences((current) => ({
                    ...current,
                    mentionAlerts: event.target.checked,
                  }))
                }
                className="mt-1 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>
                <span className="font-semibold">Mention alerts</span>
                <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                  Keep alerts when review comments tag this reviewer directly.
                </span>
              </span>
            </label>
            <label className="flex flex-col gap-2 rounded-[24px] border border-zinc-200/80 bg-zinc-50/80 p-5 text-sm text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-200 lg:col-span-3">
              <span className="font-semibold">Allowed template sources</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Optional comma-separated allowlist. When set, only these template sources can create template alerts.
              </span>
              <input
                type="text"
                value={templateAllowedSourcesInput}
                disabled={!sessionReviewer}
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
                className="mt-1 min-h-[40px] rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              />
            </label>
            <label className="flex flex-col gap-2 rounded-[24px] border border-zinc-200/80 bg-zinc-50/80 p-5 text-sm text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-200 lg:col-span-3">
              <span className="font-semibold">Blocked template sources</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Optional comma-separated blocklist. Matching sources will not create template alerts.
              </span>
              <input
                type="text"
                value={templateBlockedSourcesInput}
                disabled={!sessionReviewer}
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
                className="mt-1 min-h-[40px] rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              />
            </label>
            <label className="flex flex-col gap-2 rounded-[24px] border border-zinc-200/80 bg-zinc-50/80 p-5 text-sm text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-200 lg:col-span-3">
              <span className="font-semibold">High-priority template sources</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Optional comma-separated list. Matching sources get their template-alert severity elevated before thresholds apply.
              </span>
              <input
                type="text"
                value={templateHighPrioritySourcesInput}
                disabled={!sessionReviewer}
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
                className="mt-1 min-h-[40px] rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              />
            </label>
            <label className="flex flex-col gap-2 rounded-[24px] border border-zinc-200/80 bg-zinc-50/80 p-5 text-sm text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-200 lg:col-span-3">
              <span className="font-semibold">Import-priority sources</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Optional comma-separated list. Matching sources get extra severity lift only for template imports.
              </span>
              <input
                type="text"
                value={templateImportHighPrioritySourcesInput}
                disabled={!sessionReviewer}
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
                className="mt-1 min-h-[40px] rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              />
            </label>
            <label className="flex flex-col gap-2 rounded-[24px] border border-zinc-200/80 bg-zinc-50/80 p-5 text-sm text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-200 lg:col-span-3">
              <span className="font-semibold">Export-priority sources</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Optional comma-separated list. Matching sources get extra severity lift only for template exports.
              </span>
              <input
                type="text"
                value={templateExportHighPrioritySourcesInput}
                disabled={!sessionReviewer}
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
                className="mt-1 min-h-[40px] rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              />
            </label>
            <label className="flex flex-col gap-2 rounded-[24px] border border-zinc-200/80 bg-zinc-50/80 p-5 text-sm text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-200">
              <span className="font-semibold">Template import threshold</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Choose the minimum import severity that should create inbox alerts.
              </span>
              <select
                value={notificationPreferences.templateImportAlertMinimumSeverity}
                disabled={!sessionReviewer}
                onChange={(event) =>
                  updateNotificationPreferences((current) => ({
                    ...current,
                    templateImportAlertMinimumSeverity: event.target.value as "low" | "medium" | "high",
                    templateAlertMinimumSeverity: event.target.value as "low" | "medium" | "high",
                  }))
                }
                className="mt-1 min-h-[40px] rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              >
                <option value="low">Low and above</option>
                <option value="medium">Medium and above</option>
                <option value="high">High only</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 rounded-[24px] border border-zinc-200/80 bg-zinc-50/80 p-5 text-sm text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-200">
              <span className="font-semibold">Template export threshold</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Choose the minimum export severity that should create inbox alerts.
              </span>
              <select
                value={notificationPreferences.templateExportAlertMinimumSeverity}
                disabled={!sessionReviewer}
                onChange={(event) =>
                  updateNotificationPreferences((current) => ({
                    ...current,
                    templateExportAlertMinimumSeverity: event.target.value as "low" | "medium" | "high",
                  }))
                }
                className="mt-1 min-h-[40px] rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              >
                <option value="low">Low and above</option>
                <option value="medium">Medium and above</option>
                <option value="high">High only</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 rounded-[24px] border border-zinc-200/80 bg-zinc-50/80 p-5 text-sm text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-200">
              <span className="font-semibold">Local source threshold</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Minimum severity for template alerts created from this project&apos;s own source context.
              </span>
              <select
                value={notificationPreferences.templateLocalAlertMinimumSeverity}
                disabled={!sessionReviewer}
                onChange={(event) =>
                  updateNotificationPreferences((current) => ({
                    ...current,
                    templateLocalAlertMinimumSeverity: event.target.value as "low" | "medium" | "high",
                  }))
                }
                className="mt-1 min-h-[40px] rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              >
                <option value="low">Low and above</option>
                <option value="medium">Medium and above</option>
                <option value="high">High only</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 rounded-[24px] border border-zinc-200/80 bg-zinc-50/80 p-5 text-sm text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-200">
              <span className="font-semibold">External source threshold</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Minimum severity for template alerts coming from another project or imported pack source.
              </span>
              <select
                value={notificationPreferences.templateExternalAlertMinimumSeverity}
                disabled={!sessionReviewer}
                onChange={(event) =>
                  updateNotificationPreferences((current) => ({
                    ...current,
                    templateExternalAlertMinimumSeverity: event.target.value as "low" | "medium" | "high",
                  }))
                }
                className="mt-1 min-h-[40px] rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              >
                <option value="low">Low and above</option>
                <option value="medium">Medium and above</option>
                <option value="high">High only</option>
              </select>
            </label>
            <label className="flex items-start gap-3 rounded-[24px] border border-zinc-200/80 bg-zinc-50/80 p-5 text-sm text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-200">
              <input
                type="checkbox"
                checked={notificationPreferences.watchAlerts}
                disabled={!sessionReviewer}
                onChange={(event) =>
                  updateNotificationPreferences((current) => ({
                    ...current,
                    watchAlerts: event.target.checked,
                  }))
                }
                className="mt-1 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>
                <span className="font-semibold">Watched-case alerts</span>
                <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                  Keep alerts when followed cases get new review activity.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-[24px] border border-zinc-200/80 bg-zinc-50/80 p-5 text-sm text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-200">
              <input
                type="checkbox"
                checked={notificationPreferences.templateAlerts}
                disabled={!sessionReviewer}
                onChange={(event) =>
                  updateNotificationPreferences((current) => ({
                    ...current,
                    templateAlerts: event.target.checked,
                  }))
                }
                className="mt-1 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>
                <span className="font-semibold">Template activity alerts</span>
                <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                  Keep inbox entries when reusable template packs are imported or exported.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-[24px] border border-zinc-200/80 bg-zinc-50/80 p-5 text-sm text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-200">
              <input
                type="checkbox"
                checked={notificationPreferences.unreadOnlyDefault}
                disabled={!sessionReviewer}
                onChange={(event) =>
                  updateNotificationPreferences((current) => ({
                    ...current,
                    unreadOnlyDefault: event.target.checked,
                  }))
                }
                className="mt-1 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>
                <span className="font-semibold">Unread-only default</span>
                <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                  Open reviewer inboxes in unread mode unless a route asks for a different slice.
                </span>
              </span>
            </label>
          </div>

          {!sessionReviewer ? (
            <div className="mt-5 rounded-[20px] border border-dashed border-zinc-200 px-4 py-3 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              Choose an active reviewer first to save browser-level inbox defaults.
            </div>
          ) : null}
        </section>

        <section className="rounded-[32px] border border-white/80 bg-white/92 px-8 py-8 shadow-[0_24px_65px_-36px_rgba(15,23,42,0.35)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/88">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
              Reviewer Directory
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Available active users
            </h2>
          </div>

          {directoryState === "loading" ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-zinc-200 px-5 py-8 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              Loading the reviewer directory...
            </div>
          ) : directoryState === "unavailable" ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-zinc-200 px-5 py-8 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              The user directory is unavailable right now. Apply the latest user migration before using browser-level reviewer sessions.
            </div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {users.map((user) => {
                const isActiveReviewer = sessionReviewer?.id
                  ? sessionReviewer.id === user.id
                  : sessionReviewer?.email && sessionReviewer.email === user.email;

                return (
                  <article
                    key={user.id}
                    className="rounded-[24px] border border-zinc-200/80 bg-zinc-50/80 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                          {user.name}
                        </p>
                        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                          {user.email}
                        </p>
                      </div>
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${toneByRole[user.role]}`}
                      >
                        {user.role}
                      </span>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      {isActiveReviewer ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                          Active Reviewer
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          void updateSessionReviewer({
                            id: user.id,
                            name: user.name,
                            email: user.email,
                          })
                        }
                        disabled={isSaving}
                        className="rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                      >
                        {isActiveReviewer ? "Selected for this browser" : "Set as Active Reviewer"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
        </div>
      </ResponsiveShell>
    </main>
  );
}
