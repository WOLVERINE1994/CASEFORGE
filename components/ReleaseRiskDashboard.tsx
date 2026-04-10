"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { UserRecord } from "../services/user-service";
import type { Project, ReleaseReviewState } from "../utils/workspace";
import type {
  ReleaseHotspot,
  ReleaseRiskContext,
  ReleaseRiskSummary,
} from "../utils/release-risk";
import { buildReleaseReviewPacketHtml } from "../utils/release-review-export";
import { formatUtcDateTime } from "../utils/date-format";
import {
  buildAutomationCandidateInsights,
  buildAutomationProviderSummary,
} from "../utils/test-case-management";
import { loadReviewerNotificationPreferences } from "../utils/reviewer-notification-preferences";
import { useProjectDataState } from "./ProjectDataStateContext";
import { useActiveReviewerSession } from "./useActiveReviewerSession";

type Props = {
  projectKey: string;
  project: Project | null;
  summary: ReleaseRiskSummary;
  context: ReleaseRiskContext;
};

const levelTone: Record<ReleaseRiskSummary["level"], string> = {
  safe: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
  caution:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
  blocked:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
};

const severityTone = {
  low: "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
  medium:
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
  high: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  critical:
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
} as const;

const chipClassName =
  "rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200";

const sharedActionLinkClassName =
  "rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900";

const reviewedCardClassName =
  "border-emerald-200 bg-emerald-50/90 dark:border-emerald-500/30 dark:bg-emerald-500/10";

const releaseCoverageTone = {
  passed: "bg-emerald-500",
  failed: "bg-rose-500",
  blocked: "bg-amber-500",
  "not-run": "bg-zinc-400",
} as const;

const releaseDeltaTone = {
  up: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
  down: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
  flat: "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
  none: "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
} as const;

function buildRunFilterHref(
  projectKey: string,
  params: Record<string, string | null | undefined>
) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }

  search.set("from", "release");

  const query = search.toString();
  return `/projects/${encodeURIComponent(projectKey)}/runs${query ? `?${query}` : ""}`;
}

function buildIssueFilterHref(
  projectKey: string,
  params: Record<string, string | null | undefined>
) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }

  search.set("from", "release");

  const query = search.toString();
  return `/projects/${encodeURIComponent(projectKey)}/issues${query ? `?${query}` : ""}`;
}

function buildCasesFilterHref(
  projectKey: string,
  params: Record<string, string | null | undefined>
) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }

  search.set("from", "release");

  const query = search.toString();
  return `/projects/${encodeURIComponent(projectKey)}/cases${query ? `?${query}` : ""}`;
}

function buildIssueFocusHref(projectKey: string, issueId: string) {
  return buildIssueFilterHref(projectKey, { issueId });
}

function buildCaseFocusHref(projectKey: string, rowId: string) {
  return buildCasesFilterHref(projectKey, { rowId });
}

function SignalCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <article className="rounded-[20px] border border-zinc-200/80 bg-white/96 p-5 shadow-[0_20px_40px_-34px_rgba(15,23,42,0.2)] dark:border-zinc-800 dark:bg-zinc-900/94">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
        {value}
      </p>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{detail}</p>
    </article>
  );
}

function HotspotBar({
  hotspot,
  projectKey,
}: {
  hotspot: ReleaseHotspot;
  projectKey: string;
}) {
  const executed = hotspot.passed + hotspot.failed + hotspot.blocked;
  const executionPercent =
    hotspot.totalCases === 0 ? 0 : Math.round((executed / hotspot.totalCases) * 100);

  return (
    <div className="rounded-[24px] border border-zinc-200/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.92)_0%,_rgba(247,249,248,0.98)_100%)] px-4 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            {hotspot.area}
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {hotspot.totalCases} cases | {hotspot.openIssues} open issues | {hotspot.criticalOpenIssues} critical/high issues
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
            Area Safety
          </p>
          <p className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            {hotspot.riskScore}
          </p>
        </div>
      </div>

      <div className="mt-4 h-3 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className={`h-full rounded-full ${
            hotspot.riskScore >= 80
              ? "bg-emerald-500"
              : hotspot.riskScore >= 55
              ? "bg-amber-500"
              : "bg-rose-500"
          }`}
          style={{ width: `${Math.max(8, hotspot.riskScore)}%` }}
        />
      </div>

      <div className="mt-4 grid gap-2 text-xs text-zinc-600 dark:text-zinc-300 sm:grid-cols-5">
        <span>Passed: {hotspot.passed}</span>
        <span>Failed: {hotspot.failed}</span>
        <span>Blocked: {hotspot.blocked}</span>
        <span>Not Run: {hotspot.notRun}</span>
        <span>Exec: {executionPercent}%</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={buildRunFilterHref(projectKey, {
            search: hotspot.area,
            execution:
              hotspot.failed > 0 ? "failed" : hotspot.blocked > 0 ? "blocked" : undefined,
          })}
          className={sharedActionLinkClassName}
        >
          Open Run Cases
        </Link>
        <Link
          href={buildCasesFilterHref(projectKey, {
            search: hotspot.area,
            execution: hotspot.notRun > 0 ? "not-run" : undefined,
          })}
          className={sharedActionLinkClassName}
        >
          Open Area Cases
        </Link>
        <Link
          href={buildIssueFilterHref(projectKey, {
            search: hotspot.area,
            status: hotspot.criticalOpenIssues > 0 ? "blocked" : undefined,
          })}
          className={sharedActionLinkClassName}
        >
          Open Related Issues
        </Link>
      </div>
    </div>
  );
}

export default function ReleaseRiskDashboard({
  projectKey,
  project,
  summary,
  context,
}: Props) {
  const projectDataState = useProjectDataState();
  const activeReviewerSession = useActiveReviewerSession();
  const projectId = project?.id ?? null;
  const reviewerPreferenceId =
    activeReviewerSession.reviewer?.id ||
    activeReviewerSession.reviewer?.email ||
    activeReviewerSession.reviewer?.name ||
    "";
  const reviewerNotificationPreferences = useMemo(() => {
    if (!projectId || !reviewerPreferenceId) {
      return null;
    }

    return loadReviewerNotificationPreferences(projectId, reviewerPreferenceId);
  }, [projectId, reviewerPreferenceId]);
  const initialReviewState: ReleaseReviewState = {
    reviewedReasonIds: project?.releaseReview?.reviewedReasonIds ?? [],
    reviewedActionIds: project?.releaseReview?.reviewedActionIds ?? [],
    lastReviewedAt: project?.releaseReview?.lastReviewedAt,
    recordedDecision: project?.releaseReview?.recordedDecision,
    decisionNote: project?.releaseReview?.decisionNote ?? "",
    decisionRecordedAt: project?.releaseReview?.decisionRecordedAt,
    decisionRecordedBy: project?.releaseReview?.decisionRecordedBy,
    waivedAutomationProviders: project?.releaseReview?.waivedAutomationProviders ?? [],
    snapshots: project?.releaseReview?.snapshots ?? [],
  };
  const statusLabel =
    summary.level === "safe"
      ? "SAFE TO RELEASE"
      : summary.level === "caution"
      ? "RELEASE WITH CAUTION"
      : "NOT READY FOR RELEASE";

  const hasUsableData = summary.totalCases > 0 || summary.openIssues > 0;
  const primaryUntestedArea = context.untestedCriticalAreas[0] ?? context.lowCoverageAreas[0]?.area ?? null;
  const [releaseReview, setReleaseReview] = useState<ReleaseReviewState>(() => initialReviewState);
  const [reviewNotice, setReviewNotice] = useState<{
    tone: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [isPersistingReview, setIsPersistingReview] = useState(false);
  const [decisionDraft, setDecisionDraft] = useState<
    NonNullable<ReleaseReviewState["recordedDecision"]>
  >(initialReviewState.recordedDecision ?? summary.level);
  const [decisionNoteDraft, setDecisionNoteDraft] = useState(
    initialReviewState.decisionNote ?? ""
  );
  const [waiverNoteDrafts, setWaiverNoteDrafts] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        (initialReviewState.waivedAutomationProviders ?? []).map((entry) => [
          entry.provider,
          entry.note ?? "",
        ])
      )
  );
  const [reviewerOptions, setReviewerOptions] = useState<UserRecord[]>([]);
  const [reviewerDirectoryState, setReviewerDirectoryState] = useState<
    "idle" | "ready" | "unavailable"
  >("idle");
  const [sessionReviewer, setSessionReviewer] = useState<{
    id?: string;
    name?: string;
    email?: string;
  } | null>(initialReviewState.decisionRecordedBy ?? null);
  const [reviewerIdDraft, setReviewerIdDraft] = useState(
    initialReviewState.decisionRecordedBy?.id ?? ""
  );

  const reviewedReasonSet = useMemo(
    () => new Set(releaseReview.reviewedReasonIds),
    [releaseReview.reviewedReasonIds]
  );
  const reviewedActionSet = useMemo(
    () => new Set(releaseReview.reviewedActionIds),
    [releaseReview.reviewedActionIds]
  );
  const waivedAutomationProviderSet = useMemo(
    () =>
      new Set(
        (releaseReview.waivedAutomationProviders ?? []).map((entry) => entry.provider)
      ),
    [releaseReview.waivedAutomationProviders]
  );
  useEffect(() => {
    setWaiverNoteDrafts(
      Object.fromEntries(
        (releaseReview.waivedAutomationProviders ?? []).map((entry) => [
          entry.provider,
          entry.note ?? "",
        ])
      )
    );
  }, [releaseReview.waivedAutomationProviders]);
  useEffect(() => {
    if (reviewerDirectoryState !== "idle") {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const [usersResponse, sessionResponse] = await Promise.all([
          fetch("/api/users", { cache: "no-store" }),
          fetch("/api/session/reviewer", { cache: "no-store" }),
        ]);
        const payload = (await usersResponse.json()) as {
          users?: UserRecord[];
          error?: string;
        };
        const sessionPayload = (await sessionResponse.json()) as {
          reviewer?: {
            id?: string;
            name?: string;
            email?: string;
          } | null;
        };

        if (!usersResponse.ok || !Array.isArray(payload.users)) {
          if (!cancelled) {
            setReviewerDirectoryState("unavailable");
          }
          return;
        }

        const activeUsers = payload.users.filter((user) => user.isActive);

        if (!cancelled) {
          setReviewerOptions(activeUsers);
          setReviewerDirectoryState("ready");
          setSessionReviewer(sessionPayload.reviewer ?? null);
          setReviewerIdDraft((current) => {
            if (current) {
              return current;
            }

            if (sessionPayload.reviewer?.id) {
              return sessionPayload.reviewer.id;
            }

            const matchedByEmail = sessionPayload.reviewer?.email
              ? activeUsers.find((user) => user.email === sessionPayload.reviewer?.email)
              : null;

            return matchedByEmail?.id || activeUsers[0]?.id || "";
          });
        }
      } catch {
        if (!cancelled) {
          setReviewerDirectoryState("unavailable");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reviewerDirectoryState]);

  const selectedReviewer = useMemo(
    () =>
      reviewerOptions.find((user) => user.id === reviewerIdDraft) ??
      (sessionReviewer
        ? {
            id: sessionReviewer.id ?? "",
            name: sessionReviewer.name ?? "",
            email: sessionReviewer.email ?? "",
            avatarUrl: null,
            role: "manager" as const,
            isActive: true,
            createdAt: "",
            updatedAt: "",
          }
        : releaseReview.decisionRecordedBy
        ? {
            id: releaseReview.decisionRecordedBy.id ?? "",
            name: releaseReview.decisionRecordedBy.name ?? "",
            email: releaseReview.decisionRecordedBy.email ?? "",
            avatarUrl: null,
            role: "manager" as const,
            isActive: true,
            createdAt: "",
            updatedAt: "",
          }
        : null),
    [releaseReview.decisionRecordedBy, reviewerIdDraft, reviewerOptions, sessionReviewer]
  );
  useEffect(() => {
    if (reviewerDirectoryState !== "ready" || !selectedReviewer) {
      return;
    }

    const sessionMatches =
      (sessionReviewer?.id && selectedReviewer.id === sessionReviewer.id) ||
      (sessionReviewer?.email && selectedReviewer.email === sessionReviewer.email);

    if (sessionMatches) {
      return;
    }

    void fetch("/api/session/reviewer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reviewer: {
          id: selectedReviewer.id,
          name: selectedReviewer.name,
          email: selectedReviewer.email,
        },
      }),
    }).then(() => {
      setSessionReviewer({
        id: selectedReviewer.id,
        name: selectedReviewer.name,
        email: selectedReviewer.email,
      });
    });
  }, [reviewerDirectoryState, selectedReviewer, sessionReviewer]);
  const releaseCoverageSegments = [
    {
      key: "passed" as const,
      label: "Passed",
      count: summary.passedCases,
    },
    {
      key: "failed" as const,
      label: "Failed",
      count: summary.failedCases,
    },
    {
      key: "blocked" as const,
      label: "Blocked",
      count: summary.blockedCases,
    },
    {
      key: "not-run" as const,
      label: "Not Run",
      count: summary.notRunCases,
    },
  ].map((entry) => ({
    ...entry,
    percent:
      summary.totalCases === 0 ? 0 : Math.round((entry.count / summary.totalCases) * 100),
  }));
  const sortedSnapshots = useMemo(
    () =>
      [...(releaseReview.snapshots ?? [])].sort(
        (left, right) => right.decisionRecordedAt - left.decisionRecordedAt
      ),
    [releaseReview.snapshots]
  );
  const latestSnapshot = sortedSnapshots[0];
  const previousSnapshot = sortedSnapshots[1];
  const latestSnapshotDelta =
    latestSnapshot && previousSnapshot ? latestSnapshot.score - previousSnapshot.score : null;
  const latestSnapshotDeltaDirection =
    latestSnapshotDelta === null
      ? "none"
      : latestSnapshotDelta > 0
      ? "up"
      : latestSnapshotDelta < 0
      ? "down"
      : "flat";
  const automationRiskCaseCount = context.automationRiskAreas.reduce(
    (total, area) => total + area.uncoveredCriticalCases,
    0
  );
  const automationInsights = useMemo(
    () => buildAutomationCandidateInsights(project?.rows ?? []),
    [project?.rows]
  );
  const automationSnapshotMetrics = useMemo(() => {
    const rows = project?.rows ?? [];
    const automatedCases = rows.filter(
      (row) => (row.automationStatus ?? "manual") === "automated"
    ).length;
    const candidateCases = rows.filter(
      (row) => (row.automationStatus ?? "manual") === "candidate"
    ).length;
    const automationReadyCases = automationInsights.filter(
      (entry) => entry.automationStatus !== "automated" && entry.isStrongCandidate
    ).length;

    return {
      automationCoveragePercent:
        rows.length === 0 ? 0 : Math.round((automatedCases / rows.length) * 100),
      automatedCases,
      candidateCases,
      automationReadyCases,
    };
  }, [automationInsights, project?.rows]);
  const automationSnapshotHotspots = useMemo(() => {
    const hotspotMap = new Map<
      string,
      {
        area: string;
        automated: number;
        candidate: number;
        strongReady: number;
        rowIds: string[];
      }
    >();

    for (const row of project?.rows ?? []) {
      const area =
        row.componentArea?.trim() ||
        row.suiteName?.trim() ||
        row.labels?.[0]?.trim() ||
        "Uncategorized";
      const insight = automationInsights.find((entry) => entry.rowId === row.id);
      const current = hotspotMap.get(area) ?? {
        area,
        automated: 0,
        candidate: 0,
        strongReady: 0,
        rowIds: [],
      };

      if ((row.automationStatus ?? "manual") === "automated") {
        current.automated += 1;
      }
      if ((row.automationStatus ?? "manual") === "candidate") {
        current.candidate += 1;
      }
      if (insight && insight.automationStatus !== "automated" && insight.isStrongCandidate) {
        current.strongReady += 1;
        if (current.rowIds.length < 8) {
          current.rowIds.push(row.id);
        }
      }

      if (
        current.rowIds.length < 8 &&
        !current.rowIds.includes(row.id) &&
        (row.automationStatus ?? "manual") === "candidate"
      ) {
        current.rowIds.push(row.id);
      }

      hotspotMap.set(area, current);
    }

    return Array.from(hotspotMap.values())
      .filter((entry) => entry.automated > 0 || entry.candidate > 0 || entry.strongReady > 0)
      .sort((left, right) => right.strongReady - left.strongReady || right.candidate - left.candidate)
      .slice(0, 5);
  }, [automationInsights, project?.rows]);
  const topAutomationHotspotLeadRowId = useMemo(() => {
    const topArea = context.automationRiskAreas[0]?.area;
    if (!topArea) {
      return "";
    }

    const matchingInsight = automationInsights.find(
      (entry) =>
        entry.area === topArea &&
        entry.automationStatus !== "automated" &&
        entry.isStrongCandidate
    );

    if (matchingInsight) {
      return matchingInsight.rowId;
    }

    return (
      project?.rows.find(
        (row) =>
          ((row.componentArea?.trim() ||
            row.suiteName?.trim() ||
            row.labels?.[0]?.trim() ||
            "Uncategorized") === topArea &&
            (row.automationStatus ?? "manual") === "candidate")
      )?.id || ""
    );
  }, [automationInsights, context.automationRiskAreas, project?.rows]);
  const topAutomationHotspotRowIds = useMemo(() => {
    const topArea = context.automationRiskAreas[0]?.area;
    if (!topArea) {
      return [] as string[];
    }

    const strongReadyRows = automationInsights
      .filter(
        (entry) =>
          entry.area === topArea &&
          entry.automationStatus !== "automated" &&
          entry.isStrongCandidate
      )
      .slice(0, 8)
      .map((entry) => entry.rowId);

    if (strongReadyRows.length > 0) {
      return strongReadyRows;
    }

    return (project?.rows ?? [])
      .filter(
        (row) =>
          ((row.componentArea?.trim() ||
            row.suiteName?.trim() ||
            row.labels?.[0]?.trim() ||
            "Uncategorized") === topArea &&
            (row.automationStatus ?? "manual") === "candidate")
      )
      .slice(0, 8)
      .map((row) => row.id);
  }, [automationInsights, context.automationRiskAreas, project?.rows]);

  const exportReleasePacket = () => {
    const packetHtml = buildReleaseReviewPacketHtml({
      projectName: project?.name?.trim() || "Project",
      projectKey,
      releaseSummary: summary,
      releaseContext: context,
      latestDecision: releaseReview.recordedDecision,
      latestDecisionRecordedAt: releaseReview.decisionRecordedAt,
      latestDecisionNote: releaseReview.decisionNote,
      latestDecisionRecordedBy: releaseReview.decisionRecordedBy,
      waivedAutomationProviders: releaseReview.waivedAutomationProviders ?? [],
      exportedBy: activeReviewerSession.reviewer,
      auditTrail: projectDataState?.project?.auditTrail ?? project?.auditTrail ?? [],
      notificationPreferences: reviewerNotificationPreferences,
    });
    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1080,height=840");

    if (!printWindow) {
      setReviewNotice({
        tone: "error",
        text: "Unable to open the PDF export window. Please allow pop-ups and try again.",
      });
      return;
    }

    printWindow.document.open();
    printWindow.document.write(packetHtml);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const persistReleaseReview = async (nextState: ReleaseReviewState) => {
    if (!project) {
      setReleaseReview(nextState);
      return;
    }

    setIsPersistingReview(true);
    setReleaseReview(nextState);

    try {
      const projectsResponse = await fetch("/api/projects", {
        cache: "no-store",
      });
      const projectsPayload = (await projectsResponse.json()) as {
        projects?: Project[];
        error?: string;
      };

      if (!projectsResponse.ok || !Array.isArray(projectsPayload.projects)) {
        throw new Error(projectsPayload.error || "Failed to load projects.");
      }

      const updatedProjects = projectsPayload.projects.map((entry) =>
        entry.id === project.id ||
        entry.projectKey?.trim().toLowerCase() === projectKey.trim().toLowerCase()
          ? {
              ...entry,
              releaseReview: nextState,
              updatedAt: Date.now(),
            }
          : entry
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
        throw new Error(persistPayload.error || "Failed to save release review state.");
      }

      const savedProject =
        persistPayload.projects.find((entry) => entry.id === project.id) ?? null;
      if (savedProject) {
        projectDataState?.setProject(savedProject);
      }

      setReviewNotice({
        tone: "success",
        text: "Release review progress saved.",
      });
    } catch (error) {
      setReleaseReview(initialReviewState);
      setDecisionDraft(initialReviewState.recordedDecision ?? summary.level);
      setDecisionNoteDraft(initialReviewState.decisionNote ?? "");
      setReviewNotice({
        tone: "error",
        text:
          error instanceof Error && error.message.trim()
            ? error.message
            : "Failed to persist release review state.",
      });
    } finally {
      setIsPersistingReview(false);
    }
  };

  const buildReleaseAuditEntry = (action: string, detail: string) => ({
    id: crypto.randomUUID(),
    action,
    detail,
    createdAt: Date.now(),
    actorName: selectedReviewer?.name || undefined,
    actorEmail: selectedReviewer?.email || undefined,
  });

  const persistReleaseReviewWithAudit = async (
    nextState: ReleaseReviewState,
    auditEntry?: ReturnType<typeof buildReleaseAuditEntry>
  ) => {
    if (!project) {
      await persistReleaseReview(nextState);
      return;
    }

    setIsPersistingReview(true);
    setReleaseReview(nextState);

    try {
      const projectsResponse = await fetch("/api/projects", {
        cache: "no-store",
      });
      const projectsPayload = (await projectsResponse.json()) as {
        projects?: Project[];
        error?: string;
      };

      if (!projectsResponse.ok || !Array.isArray(projectsPayload.projects)) {
        throw new Error(projectsPayload.error || "Failed to load projects.");
      }

      const updatedProjects = projectsPayload.projects.map((entry) =>
        entry.id === project.id ||
        entry.projectKey?.trim().toLowerCase() === projectKey.trim().toLowerCase()
          ? {
              ...entry,
              releaseReview: nextState,
              auditTrail: auditEntry ? [auditEntry, ...(entry.auditTrail ?? [])].slice(0, 40) : entry.auditTrail ?? [],
              updatedAt: Date.now(),
            }
          : entry
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
        throw new Error(persistPayload.error || "Failed to save release review state.");
      }

      const savedProject =
        persistPayload.projects.find((entry) => entry.id === project.id) ?? null;
      if (savedProject) {
        projectDataState?.setProject(savedProject);
      }

      setReviewNotice({
        tone: "success",
        text: "Release review progress saved.",
      });
    } catch (error) {
      setReleaseReview(initialReviewState);
      setDecisionDraft(initialReviewState.recordedDecision ?? summary.level);
      setDecisionNoteDraft(initialReviewState.decisionNote ?? "");
      setReviewNotice({
        tone: "error",
        text:
          error instanceof Error && error.message.trim()
            ? error.message
            : "Failed to persist release review state.",
      });
    } finally {
      setIsPersistingReview(false);
    }
  };

  const toggleReviewedReason = async (reasonId: string) => {
    const nextReasonIds = reviewedReasonSet.has(reasonId)
      ? releaseReview.reviewedReasonIds.filter((id) => id !== reasonId)
      : [...releaseReview.reviewedReasonIds, reasonId];

    await persistReleaseReviewWithAudit(
      {
      ...releaseReview,
      reviewedReasonIds: nextReasonIds,
      lastReviewedAt: Date.now(),
      },
      buildReleaseAuditEntry(
        reviewedReasonSet.has(reasonId) ? "Release reason unreviewed" : "Release reason reviewed",
        `${reviewedReasonSet.has(reasonId) ? "Removed" : "Marked"} risk reason ${reasonId} during release review.`
      )
    );
  };

  const toggleReviewedAction = async (actionId: string) => {
    const nextActionIds = reviewedActionSet.has(actionId)
      ? releaseReview.reviewedActionIds.filter((id) => id !== actionId)
      : [...releaseReview.reviewedActionIds, actionId];

    await persistReleaseReviewWithAudit(
      {
      ...releaseReview,
      reviewedActionIds: nextActionIds,
      lastReviewedAt: Date.now(),
      },
      buildReleaseAuditEntry(
        reviewedActionSet.has(actionId) ? "Release action unreviewed" : "Release action reviewed",
        `${reviewedActionSet.has(actionId) ? "Removed" : "Marked"} release action ${actionId} during release review.`
      )
    );
  };

  const toggleAutomationProviderWaiver = async (provider: string) => {
    const isWaived = waivedAutomationProviderSet.has(provider);
    const recordedAt = Date.now();
    const recordedBy = selectedReviewer
      ? {
          id: selectedReviewer.id || undefined,
          name: selectedReviewer.name || undefined,
          email: selectedReviewer.email || undefined,
        }
      : releaseReview.decisionRecordedBy;

    await persistReleaseReviewWithAudit(
      {
        ...releaseReview,
        lastReviewedAt: recordedAt,
        waivedAutomationProviders: isWaived
          ? (releaseReview.waivedAutomationProviders ?? []).filter(
              (entry) => entry.provider !== provider
            )
          : [
              {
                provider,
                note:
                  waiverNoteDrafts[provider]?.trim() ||
                  "Intentional provider-specific release deferral.",
                recordedAt,
                recordedBy,
              },
              ...(releaseReview.waivedAutomationProviders ?? []).filter(
                (entry) => entry.provider !== provider
              ),
            ],
      },
      buildReleaseAuditEntry(
        isWaived ? "Automation provider waiver removed" : "Automation provider waived",
        `${provider} was ${isWaived ? "returned to active release pressure" : "marked as intentionally deferred for this release review"}.`
      )
    );
  };

  const saveAutomationProviderWaiverNote = async (provider: string) => {
    const waiver = (releaseReview.waivedAutomationProviders ?? []).find(
      (entry) => entry.provider === provider
    );
    if (!waiver) {
      return;
    }

    const trimmedNote = waiverNoteDrafts[provider]?.trim();
    const nextState: ReleaseReviewState = {
      ...releaseReview,
      lastReviewedAt: Date.now(),
      waivedAutomationProviders: (releaseReview.waivedAutomationProviders ?? []).map((entry) =>
        entry.provider === provider
          ? {
              ...entry,
              note: trimmedNote || "Intentional provider-specific release deferral.",
            }
          : entry
      ),
    };

    await persistReleaseReviewWithAudit(
      nextState,
      buildReleaseAuditEntry(
        "Automation provider waiver note updated",
        `Updated the waiver note for ${provider}.`
      )
    );
  };

  const recordReleaseDecision = async () => {
    const recordedAt = Date.now();
    const recordedBy = selectedReviewer
      ? {
          id: selectedReviewer.id || undefined,
          name: selectedReviewer.name || undefined,
          email: selectedReviewer.email || undefined,
        }
      : releaseReview.decisionRecordedBy;

    await persistReleaseReviewWithAudit(
      {
      ...releaseReview,
      recordedDecision: decisionDraft,
      decisionNote: decisionNoteDraft.trim(),
      decisionRecordedAt: recordedAt,
      decisionRecordedBy: recordedBy,
      lastReviewedAt: recordedAt,
      waivedAutomationProviders: releaseReview.waivedAutomationProviders ?? [],
      snapshots: [
        {
          id: crypto.randomUUID(),
          recordedDecision: decisionDraft,
          decisionNote: decisionNoteDraft.trim(),
          decisionRecordedAt: recordedAt,
          recordedBy,
          score: summary.score,
          level: summary.level,
          recommendation: summary.recommendation,
          automationCoveragePercent:
            automationSnapshotMetrics.automationCoveragePercent,
          automatedCases: automationSnapshotMetrics.automatedCases,
          candidateCases: automationSnapshotMetrics.candidateCases,
          automationReadyCases: automationSnapshotMetrics.automationReadyCases,
          automationProviders: buildAutomationProviderSummary(project?.rows ?? []).map((entry) => ({
            provider: entry.provider,
            count: entry.count,
          })),
          waivedAutomationProviders: (releaseReview.waivedAutomationProviders ?? []).map(
            (entry) => ({
              provider: entry.provider,
              note: entry.note,
            })
          ),
          automationHotspots: automationSnapshotHotspots,
        },
        ...(releaseReview.snapshots ?? []),
      ].slice(0, 20),
      },
      buildReleaseAuditEntry(
        "Release decision recorded",
        `Recorded ${decisionDraft} with score ${summary.score}.${decisionNoteDraft.trim() ? ` Note: ${decisionNoteDraft.trim()}` : ""}`
      )
    );

    setReviewNotice({
      tone: "success",
      text: "Release decision recorded for this project.",
    });
  };

  if (!hasUsableData) {
    return (
      <section className="rounded-[32px] border border-dashed border-zinc-300 bg-white/88 px-8 py-16 text-center shadow-sm dark:border-zinc-700 dark:bg-zinc-900/80">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
          Release
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Not enough release data yet
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
          {project?.name?.trim() || "This project"} needs executed cases, linked issues, or named runs before the
          release dashboard can make a trustworthy decision. Start by running cases or linking important cases to
          tracked issues.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={buildRunFilterHref(projectKey, {})}
            className="rounded-2xl bg-[linear-gradient(135deg,_#0f766e_0%,_#14532d_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_-18px_rgba(5,150,105,0.7)] transition hover:brightness-110"
          >
            Open Runs
          </Link>
          <Link
            href={buildCasesFilterHref(projectKey, {})}
            className="rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Open Cases
          </Link>
          <Link
            href={buildIssueFilterHref(projectKey, {})}
            className="rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Open Issues
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-[34px] border border-white/80 bg-white/92 px-8 py-8 shadow-[0_28px_70px_-40px_rgba(15,23,42,0.34)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/88">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              Release Decision
            </p>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Manager-facing release risk dashboard
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
              Use this view to decide whether the current release is safe to ship, what is driving the risk, and what
              must be resolved first.
            </p>
          </div>
          <div className={`rounded-[24px] border px-5 py-4 text-right shadow-sm ${levelTone[summary.level]}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em]">
              Release Status
            </p>
            <p className="mt-2 text-2xl font-semibold">{statusLabel}</p>
            <p className="mt-1 text-sm opacity-80">
              Generated {formatUtcDateTime(summary.generatedAt)}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[28px] border border-zinc-200/80 bg-[linear-gradient(135deg,_rgba(255,255,255,0.95)_0%,_rgba(246,248,247,0.96)_100%)] px-6 py-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Release Safety Score
            </p>
            <p className="mt-3 text-6xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              {summary.score}
            </p>
            <p className="mt-4 max-w-xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
              {summary.recommendation}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={buildIssueFilterHref(projectKey, { status: "blocked" })}
                className={sharedActionLinkClassName}
              >
                Open Blocker Issues
              </Link>
              <Link
                href={buildRunFilterHref(projectKey, { execution: "failed" })}
                className={sharedActionLinkClassName}
              >
                Open Failing Run Cases
              </Link>
              <Link
                href={buildRunFilterHref(projectKey, { execution: "blocked" })}
                className={sharedActionLinkClassName}
              >
                Open Blocked Run Cases
              </Link>
              <Link
                href={buildCasesFilterHref(projectKey, { execution: "not-run", linked: "unlinked" })}
                className={sharedActionLinkClassName}
              >
                Open Untested Unlinked Cases
              </Link>
              <button
                type="button"
                onClick={exportReleasePacket}
                className={sharedActionLinkClassName}
              >
                Export PDF Packet
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <span className={chipClassName}>Execution completion {summary.executionCompletionPercent}%</span>
            <span className={chipClassName}>
              Critical areas untested {summary.criticalAreasUntestedPercent}%
            </span>
            <span className={chipClassName}>Open blockers {summary.blockerIssues}</span>
            <span className={chipClassName}>
              Open critical/high {summary.openHighPriorityIssues}
            </span>
            <span className={`${chipClassName} ${releaseDeltaTone[latestSnapshotDeltaDirection]}`}>
              {latestSnapshotDelta === null
                ? "Release delta n/a"
                : latestSnapshotDelta > 0
                ? `Release delta +${latestSnapshotDelta}`
                : `Release delta ${latestSnapshotDelta}`}
            </span>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-zinc-200/80 bg-zinc-50/85 px-5 py-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/72">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              Release Command Center
            </p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Make the ship or no-ship call with the right signals in front of you.
            </h3>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              The decision and risk sections stay primary, while review governance and history are grouped more intentionally below.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-[22px] border border-zinc-200/80 bg-white/85 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Score
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {summary.score}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                release safety score
              </p>
            </div>
            <div className="rounded-[22px] border border-zinc-200/80 bg-white/85 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Completion
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {summary.executionCompletionPercent}%
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                execution completion
              </p>
            </div>
            <div className="rounded-[22px] border border-zinc-200/80 bg-white/85 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Open Risk
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {summary.openHighPriorityIssues}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                critical or high priority issues
              </p>
            </div>
            <div className="rounded-[22px] border border-zinc-200/80 bg-white/85 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Automation
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {automationRiskCaseCount}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                high-priority cases still manual
              </p>
            </div>
          </div>
        </div>
      </section>

      {context.dataNotes.length > 0 && (
        <section className="rounded-[24px] border border-sky-200 bg-sky-50/90 px-5 py-4 text-sm text-sky-900 shadow-sm dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
          <p className="font-semibold">Release assumptions</p>
          <ul className="mt-2 space-y-1.5">
            {context.dataNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      )}

      {context.automationRiskAreas.length > 0 && (
        <section className="rounded-[24px] border border-amber-200 bg-amber-50/90 px-5 py-4 text-sm text-amber-900 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-semibold">Automation gap signals</p>
              <p className="mt-1 text-amber-800/80 dark:text-amber-200/80">
                High-priority manual coverage is concentrated in{" "}
                {context.automationRiskAreas
                  .slice(0, 3)
                  .map((area) => `${area.area} (${area.uncoveredCriticalCases})`)
                  .join(", ")}
                .
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={chipClassName}>
                {automationRiskCaseCount} manual high-priority cases
              </span>
              <span className={chipClassName}>
                {context.automationRiskAreas.length} automation hotspot
                {context.automationRiskAreas.length === 1 ? "" : "s"}
              </span>
              <Link
                href={buildCasesFilterHref(projectKey, { automation: "candidate" })}
                className={sharedActionLinkClassName}
              >
                Open Candidate Cases
              </Link>
              {context.automationRiskAreas[0]?.area ? (
                <Link
                  href={
                    topAutomationHotspotRowIds.length > 0
                      ? buildCasesFilterHref(projectKey, {
                          automation: "candidate",
                          rowId: topAutomationHotspotLeadRowId || topAutomationHotspotRowIds[0],
                          rowIds: topAutomationHotspotRowIds.join(","),
                        })
                      : buildCasesFilterHref(projectKey, {
                          automation: "candidate",
                          search: context.automationRiskAreas[0].area,
                        })
                  }
                  className={sharedActionLinkClassName}
                >
                  {topAutomationHotspotRowIds.length > 1
                    ? `Open ${topAutomationHotspotRowIds.length} Automation Candidates`
                    : topAutomationHotspotLeadRowId
                    ? "Open Lead Automation Candidate"
                    : "Open Top Automation Hotspot"}
                </Link>
              ) : null}
            </div>
          </div>
        </section>
      )}

      {context.automationProviderGaps.length > 0 && (
        <section className="rounded-[24px] border border-cyan-200 bg-cyan-50/90 px-5 py-4 text-sm text-cyan-900 shadow-sm dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-200">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-semibold">Automation provider pressure</p>
              <p className="mt-1 text-cyan-800/80 dark:text-cyan-200/80">
                Strong automation-ready manual coverage is clustering around{" "}
                {context.automationProviderGaps
                  .slice(0, 3)
                  .map((entry) => `${entry.provider} (${entry.manualReadyCases})`)
                  .join(", ")}
                .
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {context.automationProviderGaps.map((entry) => (
                <div key={entry.provider} className="flex flex-wrap gap-2">
                  <Link
                    href={buildCasesFilterHref(projectKey, {
                      automation: "candidate",
                      automationProvider: entry.provider,
                    })}
                    className={sharedActionLinkClassName}
                  >
                    {entry.provider}: {entry.manualReadyCases}
                  </Link>
                  <button
                    type="button"
                    onClick={() => void toggleAutomationProviderWaiver(entry.provider)}
                    className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold shadow-sm transition ${
                      waivedAutomationProviderSet.has(entry.provider)
                        ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    }`}
                  >
                    {waivedAutomationProviderSet.has(entry.provider)
                      ? "Remove Waiver"
                      : "Waive For Release"}
                  </button>
                </div>
              ))}
            </div>
            {(releaseReview.waivedAutomationProviders ?? []).length > 0 ? (
              <div className="mt-4 grid gap-3">
                {(releaseReview.waivedAutomationProviders ?? []).map((entry) => (
                  <div
                    key={`waived-${entry.provider}`}
                    className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/10"
                  >
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
                          Waived: {entry.provider}
                        </p>
                        <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-200/80">
                          {entry.recordedBy?.name?.trim() ||
                            entry.recordedBy?.email?.trim() ||
                            "No reviewer recorded"}{" "}
                          | {formatUtcDateTime(entry.recordedAt)}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          type="text"
                          value={waiverNoteDrafts[entry.provider] ?? ""}
                          onChange={(event) =>
                            setWaiverNoteDrafts((current) => ({
                              ...current,
                              [entry.provider]: event.target.value,
                            }))
                          }
                          placeholder="Why is this provider intentionally deferred?"
                          className="min-h-[40px] rounded-2xl border border-amber-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100 dark:border-amber-500/30 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-amber-500/60 dark:focus:ring-amber-500/10"
                        />
                        <button
                          type="button"
                          onClick={() => void saveAutomationProviderWaiverNote(entry.provider)}
                          className="rounded-2xl border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-zinc-950 dark:text-amber-300 dark:hover:bg-amber-500/20"
                        >
                          Save Note
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-amber-900 dark:text-amber-100">
                      {entry.note?.trim() || "No waiver note captured yet."}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      )}

      <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <article className="rounded-[26px] border border-zinc-200 bg-white/88 px-5 py-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/88">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Review Progress
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Track which reasons and required actions have already been reviewed in this release call.
              </p>
            </div>
            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
              Governance
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[22px] border border-zinc-200/80 bg-zinc-50/80 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                Reasons Reviewed
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {releaseReview.reviewedReasonIds.length}/{summary.reasons.length}
              </p>
            </div>
            <div className="rounded-[22px] border border-zinc-200/80 bg-zinc-50/80 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                Actions Reviewed
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {releaseReview.reviewedActionIds.length}/{summary.actions.length}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {releaseReview.lastReviewedAt ? (
              <span className={chipClassName}>
                Last reviewed {formatUtcDateTime(releaseReview.lastReviewedAt)}
              </span>
            ) : (
              <span className={chipClassName}>No review checkpoint recorded yet</span>
            )}
            {isPersistingReview ? <span className={chipClassName}>Saving review state...</span> : null}
          </div>
        </article>

        <article className="rounded-[26px] border border-zinc-200 bg-white/88 px-5 py-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/88">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                  Release Decision Record
                </p>
                <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                  Decision Log
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Capture the manager call so the team can see the latest release decision and context.
              </p>
              {releaseReview.decisionRecordedAt ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={chipClassName}>
                    Recorded {formatUtcDateTime(releaseReview.decisionRecordedAt)}
                  </span>
                  {releaseReview.recordedDecision ? (
                    <span className={`${chipClassName} ${levelTone[releaseReview.recordedDecision]}`}>
                      {releaseReview.recordedDecision === "safe"
                        ? "Safe"
                        : releaseReview.recordedDecision === "caution"
                        ? "Caution"
                        : "Blocked"}
                    </span>
                  ) : null}
                  <span className={chipClassName}>
                    Recorded by{" "}
                    {releaseReview.decisionRecordedBy?.name?.trim() ||
                      releaseReview.decisionRecordedBy?.email?.trim() ||
                      "pending auth wiring"}
                  </span>
                  <span className={`${chipClassName} ${releaseDeltaTone[latestSnapshotDeltaDirection]}`}>
                    {latestSnapshotDelta === null
                      ? "No previous review to compare"
                      : latestSnapshotDelta > 0
                      ? `Score up +${latestSnapshotDelta}`
                      : latestSnapshotDelta < 0
                      ? `Score down ${latestSnapshotDelta}`
                      : "Score unchanged"}
                  </span>
                </div>
              ) : (
                <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                  No release decision has been recorded yet.
                </p>
              )}
              {!releaseReview.decisionRecordedBy ? (
                <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                  We are using the user directory as an interim reviewer selector here. Once real auth is wired, this can auto-fill from the signed-in user instead.
                </p>
              ) : null}
            </div>

            <div className="w-full max-w-xl space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                    Record As
                  </span>
                  <select
                    value={reviewerIdDraft}
                    onChange={(event) => setReviewerIdDraft(event.target.value)}
                    disabled={reviewerDirectoryState === "unavailable"}
                    className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500 dark:focus:ring-emerald-500/20"
                  >
                    <option value="">
                      {reviewerDirectoryState === "ready"
                        ? "Select reviewer"
                        : reviewerDirectoryState === "unavailable"
                        ? "User directory unavailable"
                        : "Loading reviewers..."}
                    </option>
                    {reviewerOptions.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} | {user.email}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                    Decision
                  </span>
                  <select
                    value={decisionDraft}
                    onChange={(event) =>
                      setDecisionDraft(
                        event.target.value as NonNullable<ReleaseReviewState["recordedDecision"]>
                      )
                    }
                    className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500 dark:focus:ring-emerald-500/20"
                  >
                    <option value="safe">Safe to release</option>
                    <option value="caution">Release with caution</option>
                    <option value="blocked">Not ready for release</option>
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                  Decision Note
                </span>
                <textarea
                  value={decisionNoteDraft}
                  onChange={(event) => setDecisionNoteDraft(event.target.value)}
                  rows={4}
                  placeholder="Capture what remains risky, who is following up, or why this release was approved."
                  className="mt-2 w-full rounded-[20px] border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500 dark:focus:ring-emerald-500/20"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void recordReleaseDecision()}
                  disabled={isPersistingReview}
                  className="rounded-2xl bg-[linear-gradient(135deg,_#0f766e_0%,_#14532d_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_-18px_rgba(5,150,105,0.7)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Record Release Decision
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDecisionDraft(releaseReview.recordedDecision ?? summary.level);
                    setDecisionNoteDraft(releaseReview.decisionNote ?? "");
                  }}
                  disabled={isPersistingReview}
                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  Reset Draft
                </button>
              </div>
            </div>
          </div>
        </article>
      </section>

      {reviewNotice && (
        <section
          className={`rounded-[24px] border px-5 py-4 text-sm shadow-sm ${
            reviewNotice.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
              : reviewNotice.tone === "error"
              ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
              : "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200"
          }`}
        >
          {reviewNotice.text}
        </section>
      )}

      <section className="rounded-[24px] border border-zinc-200/80 bg-white/96 p-6 shadow-[0_24px_55px_-38px_rgba(15,23,42,0.22)] dark:border-zinc-800 dark:bg-zinc-900/94">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
              Release Signals
            </p>
            <h3 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              Supporting metrics behind the ship decision
            </h3>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            A compact read of coverage, execution outcomes, and traceability depth.
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SignalCard
            label="Total Cases"
            value={summary.totalCases}
            detail="All manual and generated cases in the release scope."
          />
          <SignalCard
            label="Pass / Fail"
            value={`${summary.passedCases} / ${summary.failedCases}`}
            detail="Executed outcomes currently driving the release call."
          />
          <SignalCard
            label="Blocked / Not Run"
            value={`${summary.blockedCases} / ${summary.notRunCases}`}
            detail="Cases still blocked or never executed in the release view."
          />
          <SignalCard
            label="Linked Coverage"
            value={`${summary.linkedCoveragePercent}%`}
            detail="Share of cases linked back to tracked issue scope."
          />
        </div>
      </section>

      <section className="rounded-[24px] border border-zinc-200/80 bg-white/96 p-6 shadow-[0_24px_55px_-38px_rgba(15,23,42,0.22)] dark:border-zinc-800 dark:bg-zinc-900/94">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
              Release Coverage Mix
            </p>
            <h3 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              Execution coverage at release time
            </h3>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            A single compact view of passed, failed, blocked, and unexecuted release scope.
          </p>
        </div>

        <div className="mt-5 h-4 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          {releaseCoverageSegments.map((entry) =>
            entry.percent > 0 ? (
              <div
                key={entry.key}
                className={`h-full ${releaseCoverageTone[entry.key]}`}
                style={{ width: `${entry.percent}%`, float: "left" }}
              />
            ) : null
          )}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {releaseCoverageSegments.map((entry) => (
            <div
              key={entry.key}
              className="rounded-[20px] border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/70"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${releaseCoverageTone[entry.key]}`}
                  />
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {entry.label}
                  </span>
                </div>
                <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                  {entry.percent}%
                </span>
              </div>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                {entry.count} case{entry.count === 1 ? "" : "s"}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <article className="rounded-[24px] border border-zinc-200/80 bg-white/96 p-6 shadow-[0_24px_55px_-38px_rgba(15,23,42,0.22)] dark:border-zinc-800 dark:bg-zinc-900/94">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
              Top Risk Reasons
            </p>
            <h3 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              Why this release is risky
            </h3>
          </div>

          <div className="mt-5 space-y-3">
            {summary.reasons.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-zinc-200 px-5 py-8 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                No major risk reasons were detected from the current release data.
              </div>
            ) : (
              summary.reasons.map((reason) => {
                const isReviewed = reviewedReasonSet.has(reason.id);

                return (
                <div
                  key={reason.id}
                  className={`rounded-[24px] border border-zinc-200/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.92)_0%,_rgba(247,249,248,0.98)_100%)] p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70 ${
                    isReviewed ? reviewedCardClassName : ""
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${severityTone[reason.severity]}`}
                    >
                      {reason.severity}
                    </span>
                    {typeof reason.metric === "number" ? (
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                        Metric {reason.metric}
                      </span>
                    ) : null}
                    {isReviewed ? <span className={chipClassName}>Reviewed</span> : null}
                  </div>
                  <p className="mt-3 text-base font-semibold text-zinc-950 dark:text-zinc-50">
                    {reason.title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                    {reason.description}
                  </p>
                  {reason.actionHint ? (
                    <p className="mt-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Action: {reason.actionHint}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {reason.linkedIssueIds?.[0] ? (
                      <Link
                        href={buildIssueFocusHref(projectKey, reason.linkedIssueIds[0])}
                        className={sharedActionLinkClassName}
                      >
                        Inspect Exact Issue
                      </Link>
                    ) : null}
                    {reason.linkedCaseIds?.[0] ? (
                      <Link
                        href={buildCaseFocusHref(projectKey, reason.linkedCaseIds[0])}
                        className={sharedActionLinkClassName}
                      >
                        Inspect Exact Case
                      </Link>
                    ) : null}
                    {reason.affectedArea ? (
                      <Link
                        href={buildCasesFilterHref(projectKey, { search: reason.affectedArea })}
                        className={sharedActionLinkClassName}
                      >
                        Open Area Slice
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void toggleReviewedReason(reason.id)}
                      disabled={isPersistingReview}
                      className="rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    >
                      {isReviewed ? "Mark Unreviewed" : "Mark Reviewed"}
                    </button>
                  </div>
                </div>
              );
            })
            )}
          </div>
        </article>

        <article className="rounded-[24px] border border-zinc-200/80 bg-white/96 p-6 shadow-[0_24px_55px_-38px_rgba(15,23,42,0.22)] dark:border-zinc-800 dark:bg-zinc-900/94">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
              Required Actions Before Release
            </p>
            <h3 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              What should happen next
            </h3>
          </div>

          <div className="mt-5 space-y-3">
            {summary.actions.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-zinc-200 px-5 py-8 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                No urgent action items were generated from the current release state.
              </div>
            ) : (
              summary.actions.map((action) => {
                const isReviewed = reviewedActionSet.has(action.id);
                const isProviderWaived =
                  action.automationProvider &&
                  waivedAutomationProviderSet.has(action.automationProvider);

                return (
                <div
                  key={action.id}
                  className={`rounded-[24px] border border-zinc-200/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.92)_0%,_rgba(247,249,248,0.98)_100%)] p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70 ${
                    isReviewed ? reviewedCardClassName : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                      {action.title}
                    </p>
                    <div className="flex items-center gap-2">
                      {isReviewed ? <span className={chipClassName}>Reviewed</span> : null}
                      {isProviderWaived ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                          Provider Waived
                        </span>
                      ) : null}
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                          action.priority === "high"
                            ? severityTone.critical
                            : action.priority === "medium"
                            ? severityTone.high
                            : severityTone.medium
                        }`}
                      >
                        {action.priority}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                    {action.description}
                  </p>
                  {isProviderWaived && action.automationProvider ? (
                    <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                      {action.automationProvider} is currently marked as an intentional release waiver.
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {action.linkedIssueIds?.length ? (
                      <Link
                        href={buildIssueFilterHref(projectKey, { search: action.linkedIssueIds[0] })}
                        className={sharedActionLinkClassName}
                      >
                        Open Linked Issues
                      </Link>
                    ) : null}
                    {action.linkedCaseIds?.length ? (
                      <>
                        <Link
                          href={buildRunFilterHref(projectKey, { search: action.linkedCaseIds[0] })}
                          className={sharedActionLinkClassName}
                        >
                          Open Related Run Cases
                        </Link>
                        <Link
                          href={buildCasesFilterHref(projectKey, { search: action.linkedCaseIds[0] })}
                          className={sharedActionLinkClassName}
                        >
                          Open Related Cases
                        </Link>
                      </>
                    ) : null}
                    {action.automationProvider ? (
                      <Link
                        href={buildCasesFilterHref(projectKey, {
                          automation: "candidate",
                          automationProvider: action.automationProvider,
                          rowIds: action.linkedCaseIds?.length
                            ? action.linkedCaseIds.join(",")
                            : undefined,
                        })}
                        className={sharedActionLinkClassName}
                      >
                        Open {action.automationProvider} Candidates
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void toggleReviewedAction(action.id)}
                      disabled={isPersistingReview}
                      className="rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    >
                      {isReviewed ? "Mark Unreviewed" : "Mark Reviewed"}
                    </button>
                  </div>
                </div>
              );
            })
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-[24px] border border-zinc-200/80 bg-white/96 p-6 shadow-[0_24px_55px_-38px_rgba(15,23,42,0.22)] dark:border-zinc-800 dark:bg-zinc-900/94">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
            Critical Coverage Summary
          </p>
          <h3 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
            Where coverage is still thin
          </h3>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[24px] border border-zinc-200/80 bg-white/80 px-4 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                Total Areas
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {context.totalAreas}
              </p>
            </div>
            <div className="rounded-[24px] border border-zinc-200/80 bg-white/80 px-4 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                Critical Areas
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {context.criticalAreas.length}
              </p>
            </div>
            <div className="rounded-[24px] border border-zinc-200/80 bg-white/80 px-4 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                Untested Critical Areas
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {context.untestedCriticalAreas.length}
              </p>
            </div>
            <div className="rounded-[24px] border border-zinc-200/80 bg-white/80 px-4 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                Grouping Mode
              </p>
              <p className="mt-2 text-base font-semibold text-zinc-950 dark:text-zinc-50">
                {context.groupingStrategy}
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {context.untestedCriticalAreas.length > 0 ? (
              <div className="rounded-[24px] border border-rose-200 bg-rose-50/90 px-4 py-4 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                Untested critical areas: {context.untestedCriticalAreas.join(", ")}
              </div>
            ) : null}

            {context.lowCoverageAreas.length > 0 ? (
              <div className="rounded-[24px] border border-amber-200 bg-amber-50/90 px-4 py-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                Low execution coverage:{" "}
                {context.lowCoverageAreas
                  .slice(0, 4)
                  .map((area) => `${area.area} (${area.completionPercent}%)`)
                  .join(", ")}
              </div>
            ) : (
              <div className="rounded-[24px] border border-dashed border-zinc-200 px-5 py-6 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                No low-coverage areas were detected from the current release state.
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href={buildCasesFilterHref(projectKey, { execution: "not-run" })}
              className={sharedActionLinkClassName}
            >
              Open Not Run Cases
            </Link>
            <Link
              href={buildCasesFilterHref(projectKey, { linked: "unlinked" })}
              className={sharedActionLinkClassName}
            >
              Open Unlinked Cases
            </Link>
            {primaryUntestedArea ? (
              <Link
                href={buildCasesFilterHref(projectKey, {
                  search: primaryUntestedArea,
                  execution: "not-run",
                })}
                className={sharedActionLinkClassName}
              >
                Open Critical Area Gaps
              </Link>
            ) : null}
          </div>
        </article>

        <article className="rounded-[24px] border border-zinc-200/80 bg-white/96 p-6 shadow-[0_24px_55px_-38px_rgba(15,23,42,0.22)] dark:border-zinc-800 dark:bg-zinc-900/94">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                Failure Hotspots
              </p>
              <h3 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                Highest-risk areas in the release
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={buildRunFilterHref(projectKey, {})} className={sharedActionLinkClassName}>
                Open Runs
              </Link>
              <Link
                href={buildIssueFilterHref(projectKey, { priority: "highest" })}
                className={sharedActionLinkClassName}
              >
                Open Highest Priority Issues
              </Link>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {summary.hotspots.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-zinc-200 px-5 py-8 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                No hotspot grouping could be derived from the current release data.
              </div>
            ) : (
              summary.hotspots.map((hotspot) => (
                <HotspotBar key={hotspot.area} hotspot={hotspot} projectKey={projectKey} />
              ))
            )}
          </div>
        </article>
      </section>
    </div>
  );
}






