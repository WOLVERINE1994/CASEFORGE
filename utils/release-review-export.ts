import type { ProjectReportsSummary } from "./project-reports";
import type { ReleaseRiskContext, ReleaseRiskSummary } from "./release-risk";
import type { AuditEntry } from "./workspace";
import type { ReviewerNotificationPreferences } from "./reviewer-notification-preferences";

const escapeCsv = (value: string | number | null | undefined) => {
  const normalized = value === null || value === undefined ? "" : String(value);
  return `"${normalized.replaceAll('"', '""')}"`;
};

const formatRecorder = (entry: {
  recordedBy?: {
    name?: string;
    email?: string;
  };
}) => {
  if (entry.recordedBy?.name?.trim()) {
    return entry.recordedBy.name.trim();
  }

  if (entry.recordedBy?.email?.trim()) {
    return entry.recordedBy.email.trim();
  }

  return "Pending auth wiring";
};

const formatWaiverRecorder = (entry?: {
  recordedBy?: {
    name?: string;
    email?: string;
  };
}) => {
  if (!entry) {
    return "No actor recorded";
  }

  return formatRecorder(entry);
};

export const buildReleaseReviewHistoryCsv = (
  summary: ProjectReportsSummary,
  projectName: string,
  exportedBy?: {
    name?: string;
    email?: string;
  } | null,
  auditTrail: AuditEntry[] = [],
  notificationPreferences?: ReviewerNotificationPreferences | null,
  projectKey?: string
) => {
  const projectCasesBaseHref = projectKey
    ? `/projects/${encodeURIComponent(projectKey)}/cases`
    : "";
  const providerDrilldownRows = summary.automationProviderSnapshotChanges.map((change) => {
    if (!projectCasesBaseHref) {
      return [change.provider, "", change.latestCount, change.previousCount, change.delta, change.direction];
    }

    const search = new URLSearchParams();
    search.set("automation", "candidate");
    search.set("automationProvider", change.provider);
    search.set("from", "release");

    return [
      change.provider,
      `${projectCasesBaseHref}?${search.toString()}`,
      change.latestCount,
      change.previousCount,
      change.delta,
      change.direction,
    ];
  });
  const rows = [
    ["exported_by", formatRecorder({ recordedBy: exportedBy ?? undefined })],
    ["exported_at", new Date().toISOString()],
    ["audit_entries_available", auditTrail.length],
    [
      "reviewer_inbox_defaults",
      notificationPreferences
        ? `mentions=${notificationPreferences.mentionAlerts ? "on" : "off"}; watched=${notificationPreferences.watchAlerts ? "on" : "off"}; unread_default=${notificationPreferences.unreadOnlyDefault ? "on" : "off"}`
        : "not available",
    ],
    [],
    [
      "project",
      "recorded_at",
      "decision",
      "score",
      "delta_vs_previous",
      "level",
      "recommendation",
      "recorded_by",
      "waived_providers",
      "decision_note",
    ],
    ...summary.releaseSnapshots.map((snapshot) => [
      projectName,
      new Date(snapshot.decisionRecordedAt).toISOString(),
      snapshot.recordedDecision,
      snapshot.score,
      snapshot.scoreDeltaFromPrevious ?? "",
      snapshot.level,
      snapshot.recommendation,
      formatRecorder(snapshot),
      snapshot.waivedAutomationProviders?.join(" | ") || "",
      snapshot.decisionNote?.trim() || "",
    ]),
    [],
    ["automation_hotspot", "latest_strong_ready", "previous_strong_ready", "delta", "direction"],
    ...summary.automationHotspotSnapshotChanges.map((change) => [
      change.area,
      change.latestStrongReady,
      change.previousStrongReady,
      change.delta,
      change.direction,
    ]),
    [],
    ["automation_provider", "drilldown_href", "latest", "previous", "delta", "direction"],
    ...providerDrilldownRows,
    [],
    ["template_operation", "date", "detail"],
    ...summary.templateOperations.recentHistory.map((entry) => [
      entry.action,
      new Date(entry.createdAt).toISOString(),
      entry.detail,
    ]),
    [],
    ["template_provider", "imports", "exports"],
    ...summary.templateOperations.providerTrend.map((entry) => [
      entry.provider,
      entry.importedCount,
      entry.exportedCount,
    ]),
    [],
    [
      "template_source",
      "imports",
      "exports",
      "prioritized_alerts",
      "suppressed_alerts",
    ],
    ...summary.templateOperations.sourceDashboards.map((entry) => [
      entry.source,
      entry.importedCount,
      entry.exportedCount,
      entry.prioritizedCount,
      entry.suppressedCount,
    ]),
    [],
    ["template_source_rule_date", "prioritized", "suppressed"],
    ...summary.templateOperations.sourceRuleTrend.map((entry) => [
      entry.label,
      entry.value,
      entry.secondaryValue,
    ]),
    [],
    ["template_prioritized_source", "count"],
    ...summary.templateOperations.prioritizedSources.map((entry) => [entry.source, entry.count]),
    [],
    ["template_muted_source", "count"],
    ...summary.templateOperations.mutedSources.map((entry) => [entry.source, entry.count]),
  ];

  return rows.map((row) => row.map((cell) => escapeCsv(cell)).join(",")).join("\n");
};

export const buildReleaseReviewHistoryMarkdown = (
  summary: ProjectReportsSummary,
  projectName: string,
  exportedBy?: {
    name?: string;
    email?: string;
  } | null,
  auditTrail: AuditEntry[] = [],
  notificationPreferences?: ReviewerNotificationPreferences | null,
  projectKey?: string
) => {
  const projectCasesBaseHref = projectKey
    ? `/projects/${encodeURIComponent(projectKey)}/cases`
    : "";
  const lines = [
    `# Release Review History - ${projectName}`,
    "",
    `Generated: ${new Date().toLocaleString()}`,
    `Exported by: ${formatRecorder({ recordedBy: exportedBy ?? undefined })}`,
    `Reviewer inbox defaults: ${
      notificationPreferences
        ? `mentions ${notificationPreferences.mentionAlerts ? "on" : "off"}, watched-case alerts ${notificationPreferences.watchAlerts ? "on" : "off"}, unread-only default ${notificationPreferences.unreadOnlyDefault ? "on" : "off"}`
        : "not available"
    }`,
    `Total snapshots: ${summary.releaseSnapshots.length}`,
    summary.latestReleaseDelta === null
      ? "Latest delta: n/a"
      : `Latest delta: ${summary.latestReleaseDelta > 0 ? "+" : ""}${summary.latestReleaseDelta}`,
    "",
    "## Recent Audit Context",
    ...(auditTrail.length === 0
      ? ["No recent audit entries recorded."]
      : auditTrail.slice(0, 5).map((entry) => {
          const actor =
            entry.actorName?.trim() || entry.actorEmail?.trim() || "No actor recorded";
          return `- ${new Date(entry.createdAt).toLocaleString()} | ${entry.action} | ${actor} | ${entry.detail}`;
        })),
    "",
    "## Automation Hotspot Changes",
    ...(summary.automationHotspotSnapshotChanges.length === 0
      ? ["No automation hotspot snapshot changes recorded yet."]
      : [
          "| Area | Latest Strong-ready | Previous Strong-ready | Delta | Direction |",
          "| --- | ---: | ---: | ---: | --- |",
          ...summary.automationHotspotSnapshotChanges.map(
            (change) =>
              `| ${change.area} | ${change.latestStrongReady} | ${change.previousStrongReady} | ${change.delta > 0 ? "+" : ""}${change.delta} | ${change.direction} |`
          ),
        ]),
    "",
    "## Automation Provider Drill-downs",
    ...(summary.automationProviderSnapshotChanges.length === 0
      ? ["No provider drill-downs available yet."]
      : summary.automationProviderSnapshotChanges.map((change) => {
          if (!projectCasesBaseHref) {
            return `- ${change.provider}: latest ${change.latestCount}, previous ${change.previousCount}, delta ${change.delta > 0 ? "+" : ""}${change.delta}`;
          }

          const search = new URLSearchParams();
          search.set("automation", "candidate");
          search.set("automationProvider", change.provider);
          search.set("from", "release");

          return `- [${change.provider}](${projectCasesBaseHref}?${search.toString()}): latest ${change.latestCount}, previous ${change.previousCount}, delta ${change.delta > 0 ? "+" : ""}${change.delta}`;
        })),
    "",
    "## Template Operations",
    ...(summary.templateOperations.recentHistory.length === 0
      ? ["No template import or export activity recorded yet."]
      : [
          "| Action | Recorded At | Detail |",
          "| --- | --- | --- |",
          ...summary.templateOperations.recentHistory.map(
            (entry) =>
              `| ${entry.action} | ${new Date(entry.createdAt).toISOString()} | ${entry.detail.replaceAll("\n", " ")} |`
          ),
        ]),
    "",
    "## Template Provider Activity",
    ...(summary.templateOperations.providerTrend.length === 0
      ? ["No provider-tagged template activity recorded yet."]
      : [
          "| Provider | Imports | Exports |",
          "| --- | ---: | ---: |",
          ...summary.templateOperations.providerTrend.map(
            (entry) =>
              `| ${entry.provider} | ${entry.importedCount} | ${entry.exportedCount} |`
          ),
        ]),
    "",
    "## Template Source Dashboards",
    ...(summary.templateOperations.sourceDashboards.length === 0
      ? ["No source-tagged template activity recorded yet."]
      : [
          "| Source | Imports | Exports | Prioritized Alerts | Suppressed Alerts |",
          "| --- | ---: | ---: | ---: | ---: |",
          ...summary.templateOperations.sourceDashboards.map(
            (entry) =>
              `| ${entry.source} | ${entry.importedCount} | ${entry.exportedCount} | ${entry.prioritizedCount} | ${entry.suppressedCount} |`
          ),
        ]),
    "",
    "## Template Source Rule Trend",
    ...(summary.templateOperations.sourceRuleTrend.length === 0
      ? ["No source-rule trend is available yet."]
      : [
          "| Date | Prioritized | Suppressed |",
          "| --- | ---: | ---: |",
          ...summary.templateOperations.sourceRuleTrend.map(
            (entry) =>
              `| ${entry.label} | ${entry.value} | ${entry.secondaryValue} |`
          ),
        ]),
    "",
    "## Prioritized And Muted Template Sources",
    ...(summary.templateOperations.prioritizedSources.length === 0 &&
    summary.templateOperations.mutedSources.length === 0
      ? ["No prioritized or muted template sources recorded yet."]
      : [
          ...summary.templateOperations.prioritizedSources.map(
            (entry) => `- Prioritized: ${entry.source} (${entry.count})`
          ),
          ...summary.templateOperations.mutedSources.map(
            (entry) => `- Muted: ${entry.source} (${entry.count})`
          ),
        ]),
    "",
    "| Recorded At | Decision | Score | Delta vs Previous | Recorded By | Waived Providers | Note |",
    "| --- | --- | ---: | ---: | --- | --- | --- |",
    ...summary.releaseSnapshots.map((snapshot) => {
      const deltaLabel =
        snapshot.scoreDeltaFromPrevious === null
          ? "n/a"
          : `${snapshot.scoreDeltaFromPrevious > 0 ? "+" : ""}${snapshot.scoreDeltaFromPrevious}`;
      const note = (snapshot.decisionNote?.trim() || "No note").replaceAll("\n", " ");
      const waivedProviders =
        snapshot.waivedAutomationProviders?.join(", ") || "None";

      return `| ${new Date(snapshot.decisionRecordedAt).toLocaleString()} | ${snapshot.recordedDecision} | ${snapshot.score} | ${deltaLabel} | ${formatRecorder(snapshot)} | ${waivedProviders} | ${note} |`;
    }),
  ];

  return lines.join("\n");
};

export const buildReleaseReviewPacketHtml = ({
  projectName,
  projectKey,
  releaseSummary,
  releaseContext,
  latestDecision,
  latestDecisionRecordedAt,
  latestDecisionNote,
  latestDecisionRecordedBy,
  waivedAutomationProviders = [],
  exportedBy,
  auditTrail = [],
  notificationPreferences,
}: {
  projectName: string;
  projectKey?: string;
  releaseSummary: ReleaseRiskSummary;
  releaseContext: ReleaseRiskContext;
  latestDecision?: "safe" | "caution" | "blocked";
  latestDecisionRecordedAt?: number;
  latestDecisionNote?: string;
  latestDecisionRecordedBy?: {
    name?: string;
    email?: string;
  };
  waivedAutomationProviders?: NonNullable<
    import("./workspace").ReleaseReviewState["waivedAutomationProviders"]
  >;
  exportedBy?: {
    name?: string;
    email?: string;
  } | null;
  auditTrail?: AuditEntry[];
  notificationPreferences?: ReviewerNotificationPreferences | null;
}) => {
  const decisionLabel =
    latestDecision === "safe"
      ? "Safe to Release"
      : latestDecision === "caution"
      ? "Release with Caution"
      : latestDecision === "blocked"
      ? "Not Ready for Release"
      : "No Recorded Decision";

  const recordedBy =
    latestDecisionRecordedBy?.name?.trim() ||
    latestDecisionRecordedBy?.email?.trim() ||
    "Pending auth wiring";
  const exportedByLabel = formatRecorder({ recordedBy: exportedBy ?? undefined });
  const projectCasesBaseHref = projectKey
    ? `/projects/${encodeURIComponent(projectKey)}/cases`
    : null;

  const riskReasons = releaseSummary.reasons
    .map(
      (reason) =>
        `<li><strong>${reason.title}</strong> (${reason.severity}) - ${reason.description}${
          reason.actionHint ? ` Action: ${reason.actionHint}` : ""
        }</li>`
    )
    .join("");

  const actions = releaseSummary.actions
    .map(
      (action) =>
        `<li><strong>${action.title}</strong> (${action.priority}) - ${action.description}</li>`
    )
    .join("");
  const providerDrilldowns = releaseSummary.actions
    .filter((action) => action.automationProvider)
    .map((action) => {
      if (!projectCasesBaseHref || !action.automationProvider) {
        return "";
      }

      const search = new URLSearchParams();
      search.set("from", "release");
      search.set("automation", "candidate");
      search.set("automationProvider", action.automationProvider);
      if (action.linkedCaseIds?.length) {
        search.set("rowIds", action.linkedCaseIds.join(","));
      }

      return `<li><strong>${action.automationProvider}</strong> - <a href="${projectCasesBaseHref}?${search.toString()}">Open provider candidate queue</a></li>`;
    })
    .filter(Boolean)
    .join("");
  const providerWaivers = waivedAutomationProviders
    .map(
      (waiver) =>
        `<li><strong>${waiver.provider}</strong> - waived ${waiver.note ? `(${waiver.note})` : "(no note)"} by ${formatWaiverRecorder({
          recordedBy: waiver.recordedBy,
        })}</li>`
    )
    .join("");

  const hotspots = releaseSummary.hotspots
    .slice(0, 5)
    .map(
      (hotspot) =>
        `<tr>
          <td>${hotspot.area}</td>
          <td>${hotspot.totalCases}</td>
          <td>${hotspot.failed}</td>
          <td>${hotspot.blocked}</td>
          <td>${hotspot.notRun}</td>
          <td>${hotspot.openIssues}</td>
          <td>${hotspot.riskScore}</td>
        </tr>`
    )
    .join("");

  const assumptions = releaseContext.dataNotes.map((note) => `<li>${note}</li>`).join("");
  const auditRows = auditTrail
    .slice(0, 5)
    .map(
      (entry) =>
        `<tr>
          <td>${new Date(entry.createdAt).toLocaleString()}</td>
          <td>${entry.action}</td>
          <td>${
            entry.actorName?.trim() || entry.actorEmail?.trim() || "No actor recorded"
          }</td>
          <td>${entry.detail}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Release Review Packet - ${projectName}</title>
    <style>
      body { font-family: Arial, sans-serif; color: #111827; padding: 32px; line-height: 1.5; }
      h1, h2, h3 { margin-bottom: 8px; }
      .muted { color: #6b7280; font-size: 12px; }
      .hero { border: 1px solid #e5e7eb; border-radius: 18px; padding: 20px; margin-bottom: 20px; }
      .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 16px 0 24px; }
      .card { border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px; }
      .score { font-size: 44px; font-weight: 700; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; font-size: 13px; }
      th { background: #f9fafb; }
      ul { padding-left: 18px; }
      @media print {
        body { padding: 12px; }
      }
    </style>
  </head>
  <body>
    <h1>Release Review Packet</h1>
    <p class="muted">Project: ${projectName} | Generated: ${new Date().toLocaleString()} | Exported by: ${exportedByLabel}</p>
    <p class="muted">Reviewer inbox defaults: ${
      notificationPreferences
        ? `mentions ${notificationPreferences.mentionAlerts ? "on" : "off"} | watched-case alerts ${notificationPreferences.watchAlerts ? "on" : "off"} | unread-only default ${notificationPreferences.unreadOnlyDefault ? "on" : "off"}`
        : "not available"
    }</p>

    <section class="hero">
      <h2>${decisionLabel}</h2>
      <div class="score">${releaseSummary.score}</div>
      <p>${releaseSummary.recommendation}</p>
      <p class="muted">
        Latest recorded decision: ${decisionLabel}
        ${latestDecisionRecordedAt ? `| Recorded: ${new Date(latestDecisionRecordedAt).toLocaleString()}` : ""}
        | Recorded by: ${recordedBy}
      </p>
      <p>${latestDecisionNote?.trim() || "No manager note recorded."}</p>
    </section>

    <div class="grid">
      <div class="card"><strong>Execution Completion</strong><br />${releaseSummary.executionCompletionPercent}%</div>
      <div class="card"><strong>Critical Areas Untested</strong><br />${releaseSummary.criticalAreasUntestedPercent}%</div>
      <div class="card"><strong>Open Blockers</strong><br />${releaseSummary.blockerIssues}</div>
      <div class="card"><strong>Open Critical/High</strong><br />${releaseSummary.openHighPriorityIssues}</div>
    </div>

    <h3>Top Risk Reasons</h3>
    <ul>${riskReasons || "<li>No major risk reasons detected.</li>"}</ul>

    <h3>Required Actions Before Release</h3>
    <ul>${actions || "<li>No urgent release actions generated.</li>"}</ul>

    <h3>Provider Drill-down Links</h3>
    <ul>${providerDrilldowns || "<li>No provider-specific drill-down links available.</li>"}</ul>

    <h3>Provider Waivers</h3>
    <ul>${providerWaivers || "<li>No provider waivers recorded.</li>"}</ul>

    <h3>Failure Hotspots</h3>
    <table>
      <thead>
        <tr>
          <th>Area</th>
          <th>Total Cases</th>
          <th>Failed</th>
          <th>Blocked</th>
          <th>Not Run</th>
          <th>Open Issues</th>
          <th>Risk Score</th>
        </tr>
      </thead>
      <tbody>${hotspots || "<tr><td colspan='7'>No hotspots available.</td></tr>"}</tbody>
    </table>

    <h3>Assumptions / Data Notes</h3>
    <ul>${assumptions || "<li>No special assumptions noted.</li>"}</ul>

    <h3>Recent Audit Context</h3>
    <table>
      <thead>
        <tr>
          <th>When</th>
          <th>Action</th>
          <th>Actor</th>
          <th>Detail</th>
        </tr>
      </thead>
      <tbody>${auditRows || "<tr><td colspan='4'>No recent audit entries recorded.</td></tr>"}</tbody>
    </table>
  </body>
</html>`;
};
