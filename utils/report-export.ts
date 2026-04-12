export type ReportMode = "business" | "qa";

type ReportSourceArtifact = {
  type: string;
  title: string;
  importedAt: number;
  normalizedContent: string;
};

type ReportAuditEntry = {
  action: string;
  detail: string;
  createdAt: number;
};

export type ReportRow = {
  id: string;
  type: string;
  testDomain?: string;
  securityCategory?: string;
  accessibilityCategory?: string;
  complianceReference?: string;
  riskLevel?: string;
  title: string;
  preconditions: string;
  steps: string;
  expectedResult: string;
  testData?: string;
};

export type ReportData = {
  projectName: string;
  requirement: string;
  generationMode: string;
  coverageDepth: string;
  persona: string;
  rows: ReportRow[];
  sourceArtifacts: ReportSourceArtifact[];
  reviewerName: string;
  reviewerNotes: string;
  signoffStatus: string;
  auditTrail: ReportAuditEntry[];
  typeCounts: Array<{ type: string; count: number }>;
  riskScore: number;
  readinessScore: number;
  coverageScore: number;
  ambiguityScore: number;
  changeImpactScore: number;
  riskHighlights: string[];
  ambiguityQuestions: string[];
  coverageHighlights: string[];
  readinessHighlights: string[];
  changeHighlights: string[];
  coveredRiskAreas: string[];
  uncoveredRequirementCount: number;
  openGapCount: number;
  impactedCaseCount: number;
  qualityHighlights: string[];
  deterministicRules: string[];
  trustRiskReasoning: string[];
  trustGapReasoning: string[];
  reviewInsights: Array<{
    id: string;
    title: string;
    whyThisExists: string;
    coveredRisk: string;
    mappedRequirementSentence: string;
    reasoning: string;
  }>;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const renderList = (items: string[], emptyText: string) => {
  if (items.length === 0) {
    return `<div class="empty">${escapeHtml(emptyText)}</div>`;
  }

  return `
    <ul class="list">
      ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ul>
  `;
};

const downloadTextFile = (filename: string, content: string) => {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const testDataCategoryOrder = [
  "Email",
  "Phone",
  "Password",
  "Payload",
  "Auth And Token",
  "Time And Expiry",
  "Boundary Values",
  "Failure Simulation",
  "General Input",
  "Other",
] as const;

const resolveTestDataCategory = (entry: string) => {
  const normalized = entry.toLowerCase();

  if (/\bemail\b/.test(normalized)) return "Email";
  if (/\bphone\b|\bmobile\b/.test(normalized)) return "Phone";
  if (/\bpassword\b/.test(normalized)) return "Password";
  if (/\bpayload\b|\bjson\b|\bbody\b/.test(normalized)) return "Payload";
  if (/\btoken\b|\bauth\b|\bbearer\b|\bsession\b/.test(normalized))
    return "Auth And Token";
  if (/\btime\b|\bdate\b|\bexpiry\b|\bexpired\b|\btimeout\b/.test(normalized))
    return "Time And Expiry";
  if (/\bminimum\b|\bmaximum\b|\bboundary\b|\bempty\b|\bnull\b|\bover-limit\b|\bover limit\b/.test(normalized))
    return "Boundary Values";
  if (/\b503\b|\bservice unavailable\b|\bfailure\b|\berror\b|\bsimulated\b/.test(normalized))
    return "Failure Simulation";
  if (/\binput\b|\bvalue\b|\btext\b|\bspecial characters\b/.test(normalized))
    return "General Input";
  return "Other";
};

const groupTestDataEntries = (testData?: string) => {
  const groups = new Map<string, string[]>();
  const entries = (testData ?? "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);

  entries.forEach((entry) => {
    const category = resolveTestDataCategory(entry);
    const existingEntries = groups.get(category) ?? [];
    existingEntries.push(entry);
    groups.set(category, existingEntries);
  });

  return testDataCategoryOrder
    .map((category) => ({
      category,
      entries: groups.get(category) ?? [],
    }))
    .filter((item) => item.entries.length > 0);
};

const renderRowsTable = (rows: ReportRow[]) => `
  <table class="cases">
    <thead>
      <tr>
        <th>ID</th>
        <th>Type</th>
        <th>Title</th>
        <th>Domain</th>
        <th>Risk</th>
        <th>Preconditions</th>
        <th>Steps</th>
        <th>Expected Result</th>
        <th>Test Data</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (row) => `
            <tr>
              <td>${escapeHtml(row.id)}</td>
              <td>${escapeHtml(row.type)}</td>
              <td>${escapeHtml(row.title)}</td>
              <td>${escapeHtml(row.testDomain ?? "")}</td>
              <td>${escapeHtml(row.riskLevel ?? "")}</td>
              <td>${escapeHtml(row.preconditions)}</td>
              <td>${escapeHtml(row.steps)}</td>
              <td>${escapeHtml(row.expectedResult)}</td>
              <td>${escapeHtml(row.testData ?? "")}</td>
            </tr>
          `
        )
        .join("")}
    </tbody>
  </table>
`;

const renderQaCaseCards = (rows: ReportRow[]) => `
  <div class="case-card-list">
    ${rows
      .map(
        (row) => {
          const testDataGroups = groupTestDataEntries(row.testData);
          const stepEntries = row.steps
            .split(";")
            .map((item) => item.trim())
            .filter(Boolean);

          return `
          <div class="case-card">
            <div class="case-card-header">
              <div>
                <div class="case-id">${escapeHtml(row.id)}</div>
                <h3>${escapeHtml(row.title)}</h3>
                <div class="case-meta">${escapeHtml(
                  [
                    row.testDomain ? `Domain: ${row.testDomain}` : "",
                    row.riskLevel ? `Risk: ${row.riskLevel}` : "",
                    row.securityCategory ? `Security: ${row.securityCategory}` : "",
                    row.accessibilityCategory
                      ? `Accessibility: ${row.accessibilityCategory}`
                      : "",
                    row.complianceReference
                      ? `Compliance: ${row.complianceReference}`
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" | ")
                )}</div>
              </div>
              <span class="case-type">${escapeHtml(row.type)}</span>
            </div>
            <div class="case-grid">
              <div class="case-block">
                <div class="case-label">Preconditions</div>
                <table class="detail-table">
                  <tbody>
                    <tr>
                      <td>Context</td>
                      <td>${escapeHtml(row.preconditions || "-")}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="case-block">
                <div class="case-label">Expected Result</div>
                <table class="detail-table">
                  <tbody>
                    <tr>
                      <td>Outcome</td>
                      <td>${escapeHtml(row.expectedResult || "-")}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div class="case-block case-block-steps">
              <div class="case-label">Steps</div>
              <table class="detail-table">
                <thead>
                  <tr>
                    <th>Step</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${
                    stepEntries.length === 0
                      ? `
                        <tr>
                          <td>1</td>
                          <td>-</td>
                        </tr>
                      `
                      : stepEntries
                          .map(
                            (step, index) => `
                              <tr>
                                <td>${index + 1}</td>
                                <td>${escapeHtml(step)}</td>
                              </tr>
                            `
                          )
                          .join("")
                  }
                </tbody>
              </table>
            </div>
            <div class="case-block case-block-testdata">
              <div class="case-label">Test Data</div>
              ${
                testDataGroups.length === 0
                  ? `<div class="case-text">-</div>`
                  : `
                    <table class="testdata-table">
                      <thead>
                        <tr>
                          <th>Category</th>
                          <th>Values</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${testDataGroups
                          .map(
                            (group) => `
                              <tr>
                                <td>${escapeHtml(group.category)}</td>
                                <td>${group.entries
                                  .map((entry) => `<div class="testdata-entry">${escapeHtml(entry)}</div>`)
                                  .join("")}</td>
                              </tr>
                            `
                          )
                          .join("")}
                      </tbody>
                    </table>
                  `
              }
            </div>
          </div>
        `;
        }
      )
      .join("")}
  </div>
`;

export const buildReportHtml = (data: ReportData, mode: ReportMode) => {
  const now = new Date().toLocaleString();
  const topRows = data.rows.slice(0, mode === "business" ? 5 : 10);
  const releaseDecision =
    data.readinessScore >= 80 &&
    data.coverageScore >= 75 &&
    data.openGapCount <= 1 &&
    data.impactedCaseCount <= 2
      ? "Go"
      : data.readinessScore >= 60 && data.coverageScore >= 55
      ? "Watch"
      : "Block";
  const executiveSummary =
    releaseDecision === "Go"
      ? "The current workspace shows healthy readiness, acceptable coverage, and limited unresolved delivery risk."
      : releaseDecision === "Watch"
      ? "The workspace is promising, but open gaps or impacted cases still need attention before confident signoff."
      : "The workspace still carries enough quality or coverage risk that release confidence should stay low until issues are addressed.";

  const renderBar = (value: number, color: string) => `
    <div style="margin-top:10px;height:10px;border-radius:999px;background:#e5e7eb;overflow:hidden;">
      <div style="width:${Math.max(0, Math.min(100, value))}%;height:100%;background:${color};"></div>
    </div>
  `;

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(data.projectName)} ${mode === "business" ? "Business Report" : "QA Report"}</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; color: #111827; background: #f4f7f6; }
          .page { max-width: 1080px; margin: 0 auto; padding: 32px 28px 56px; }
          .hero { border-radius: 28px; padding: 28px; background: linear-gradient(135deg, #0f766e 0%, #14532d 100%); color: white; box-shadow: 0 30px 70px -40px rgba(15,23,42,0.55); }
          .eyebrow { display: inline-block; padding: 8px 12px; border-radius: 999px; background: rgba(255,255,255,0.12); font-size: 11px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; }
          h1 { margin: 18px 0 8px; font-size: 36px; line-height: 1.1; }
          .hero p { margin: 0; max-width: 760px; color: rgba(255,255,255,0.88); line-height: 1.7; }
          .meta { margin-top: 18px; display: flex; flex-wrap: wrap; gap: 10px; }
          .meta span { padding: 8px 12px; border-radius: 999px; background: rgba(255,255,255,0.1); font-size: 12px; }
          .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-top: 22px; }
          .score { border-radius: 22px; padding: 18px; background: white; color: #0f172a; box-shadow: 0 20px 45px -35px rgba(15,23,42,0.5); }
          .score-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.18em; color: #6b7280; font-weight: 700; }
          .score-value { margin-top: 8px; font-size: 30px; font-weight: 700; }
          .section { margin-top: 18px; border-radius: 24px; background: white; border: 1px solid #e5e7eb; padding: 22px; box-shadow: 0 22px 50px -38px rgba(15,23,42,0.35); }
          .section h2 { margin: 0 0 6px; font-size: 20px; }
          .section-intro { margin: 0 0 16px; color: #6b7280; line-height: 1.7; }
          .requirement { white-space: pre-wrap; line-height: 1.8; color: #374151; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 18px; padding: 16px; }
          .subgrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
          .panel { border-radius: 18px; background: #fafaf9; border: 1px solid #e5e7eb; padding: 16px; }
          .panel h3 { margin: 0 0 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.18em; color: #6b7280; }
          .list { margin: 0; padding-left: 18px; color: #374151; }
          .list li { margin: 0 0 8px; line-height: 1.6; }
          .empty { color: #6b7280; line-height: 1.6; }
          .type-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
          .type-card { border-radius: 18px; border: 1px solid #e5e7eb; background: #f8fafc; padding: 14px; }
          .type-card strong { display: block; font-size: 24px; margin-top: 6px; }
          .cases { width: 100%; border-collapse: collapse; font-size: 12px; }
          .cases th, .cases td { border: 1px solid #e5e7eb; padding: 10px; text-align: left; vertical-align: top; line-height: 1.5; }
          .cases th { background: #f8fafc; font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #6b7280; }
          .case-card-list { display: flex; flex-direction: column; gap: 16px; }
          .case-card { border: 1px solid #e5e7eb; border-radius: 22px; background: #fcfcfb; padding: 18px; box-shadow: 0 18px 42px -34px rgba(15,23,42,0.28); }
          .case-card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
          .case-id { font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #6b7280; font-weight: 700; }
          .case-meta { margin-top: 6px; font-size: 12px; color: #6b7280; line-height: 1.5; }
          .case-card h3 { margin: 8px 0 0; font-size: 20px; line-height: 1.35; color: #0f172a; }
          .case-type { display: inline-flex; align-items: center; justify-content: center; padding: 8px 14px; border-radius: 999px; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; font-size: 12px; font-weight: 700; white-space: nowrap; }
          .case-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
          .case-block { border-radius: 18px; border: 1px solid #e5e7eb; background: #f8fafc; padding: 14px; }
          .case-block-steps, .case-block-testdata { margin-top: 12px; }
          .case-block-testdata { background: #f0fdf4; border-color: #bbf7d0; }
          .case-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.16em; color: #4b5563; font-weight: 800; margin-bottom: 8px; }
          .case-text { line-height: 1.7; color: #374151; white-space: pre-wrap; word-break: break-word; }
          .detail-table { width: 100%; border-collapse: collapse; font-size: 12px; background: white; border-radius: 14px; overflow: hidden; }
          .detail-table th, .detail-table td { border: 1px solid #e5e7eb; padding: 10px 12px; text-align: left; vertical-align: top; }
          .detail-table th { background: #f8fafc; color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 800; }
          .detail-table td:first-child { width: 92px; font-weight: 800; color: #0f766e; background: #f8fafc; }
          .testdata-table { width: 100%; border-collapse: collapse; font-size: 12px; background: white; border-radius: 14px; overflow: hidden; }
          .testdata-table th, .testdata-table td { border: 1px solid #d9f3e4; padding: 10px 12px; text-align: left; vertical-align: top; }
          .testdata-table th { background: #ecfdf5; color: #0f766e; font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 800; }
          .testdata-table td:first-child { width: 180px; font-weight: 800; color: #14532d; background: #f7fdf9; }
          .testdata-entry + .testdata-entry { margin-top: 6px; padding-top: 6px; border-top: 1px dashed #d1fae5; }
          @media print { body { background: white; } .page { padding: 0; } .hero, .section, .score { box-shadow: none; } }
        </style>
      </head>
      <body>
        <div class="page">
          <section class="hero">
            <span class="eyebrow">CaseForge Report</span>
            <h1>${escapeHtml(data.projectName || "Untitled Workspace")}</h1>
            <p>Business-ready QA summary generated from the current workspace. Built to communicate coverage, risk, readiness, and change impact without requiring spreadsheet review.</p>
            <div class="meta">
              <span>Mode: ${escapeHtml(data.generationMode)}</span>
              <span>Coverage: ${escapeHtml(data.coverageDepth)}</span>
              <span>Persona: ${escapeHtml(data.persona)}</span>
              <span>Cases: ${data.rows.length}</span>
              <span>Generated: ${escapeHtml(now)}</span>
            <span>Report: ${escapeHtml(mode === "business" ? "business" : "qa")}</span>
          </div>
          </section>
          <section class="grid">
            <div class="score"><div class="score-label">Readiness</div><div class="score-value">${data.readinessScore}</div>${renderBar(data.readinessScore, "#059669")}</div>
            <div class="score"><div class="score-label">Coverage</div><div class="score-value">${data.coverageScore}</div>${renderBar(data.coverageScore, "#2563eb")}</div>
            <div class="score"><div class="score-label">Risk</div><div class="score-value">${data.riskScore}</div>${renderBar(data.riskScore, "#f59e0b")}</div>
            <div class="score"><div class="score-label">Ambiguity</div><div class="score-value">${data.ambiguityScore}</div>${renderBar(data.ambiguityScore, "#7c3aed")}</div>
          </section>
          ${
            mode === "business"
              ? `<section class="section">
                  <h2>Release Decision</h2>
                  <p class="section-intro">Executive recommendation generated from readiness, coverage posture, unresolved gaps, and change impact.</p>
                  <div class="subgrid">
                    <div class="panel">
                      <h3>Recommendation</h3>
                      <div class="score-value" style="font-size:32px;margin-top:4px;">${escapeHtml(releaseDecision)}</div>
                      <div class="empty">${escapeHtml(executiveSummary)}</div>
                    </div>
                    <div class="panel">
                      <h3>Business Notes</h3>
                      <div class="empty">Open gaps: ${data.openGapCount} | Impacted cases: ${data.impactedCaseCount} | Uncovered requirement sentences: ${data.uncoveredRequirementCount}</div>
                      <div class="empty" style="margin-top:10px;">This report is optimized for signoff conversations, release readiness review, and stakeholder alignment.</div>
                    </div>
                  </div>
                </section>`
              : ""
          }
          <section class="section">
            <h2>Requirement Summary</h2>
            <p class="section-intro">This report reflects the current requirement and analysis state of the workspace.</p>
            <div class="requirement">${escapeHtml(data.requirement || "No requirement captured.")}</div>
          </section>
          <section class="section">
            <h2>Source Of Truth</h2>
            <p class="section-intro">Imported artifacts that shaped the current requirement and QA workspace.</p>
            <div class="subgrid">
              <div class="panel"><h3>Imported Sources</h3>${renderList(
                data.sourceArtifacts.map(
                  (source) =>
                    `${source.title} (${source.type}) imported on ${new Date(source.importedAt).toLocaleString()}`
                ),
                "No source artifacts were imported into this workspace."
              )}</div>
              <div class="panel"><h3>Collaboration Status</h3>${renderList(
                [
                  `Signoff status: ${data.signoffStatus}`,
                  `Reviewer: ${data.reviewerName || "Unassigned"}`,
                  data.reviewerNotes
                    ? `Reviewer notes: ${data.reviewerNotes}`
                    : "Reviewer notes: No reviewer notes were captured.",
                ],
                "No collaboration data captured."
              )}</div>
            </div>
          </section>
          <section class="section">
            <h2>${mode === "business" ? "Business Summary" : "QA Summary"}</h2>
            <div class="subgrid">
              <div class="panel"><h3>Risk Highlights</h3>${renderList(data.riskHighlights, "No major risk highlights detected.")}</div>
              <div class="panel"><h3>Coverage Highlights</h3>${renderList(data.coverageHighlights, "No major coverage gaps detected.")}</div>
              <div class="panel"><h3>Readiness Highlights</h3>${renderList(data.readinessHighlights, "The suite appears execution-ready.")}</div>
              <div class="panel"><h3>${mode === "business" ? "Open Questions" : "Ambiguity Questions"}</h3>${renderList(data.ambiguityQuestions, "No major ambiguity questions remain.")}</div>
            </div>
          </section>
          ${
            mode === "business"
              ? `<section class="section">
                  <h2>Decision Scorecards</h2>
                  <div class="subgrid">
                    <div class="panel"><h3>Open Gaps</h3><div class="score-value" style="font-size:26px;margin-top:4px;">${data.openGapCount}</div><div class="empty">Coverage gaps still open in the suite.</div></div>
                    <div class="panel"><h3>Impacted Cases</h3><div class="score-value" style="font-size:26px;margin-top:4px;">${data.impactedCaseCount}</div><div class="empty">Cases currently touched by requirement change impact.</div></div>
                    <div class="panel"><h3>Uncovered Sentences</h3><div class="score-value" style="font-size:26px;margin-top:4px;">${data.uncoveredRequirementCount}</div><div class="empty">Requirement sentences not yet linked to a case.</div></div>
                    <div class="panel"><h3>Risk Areas Covered</h3><div class="score-value" style="font-size:26px;margin-top:4px;">${data.coveredRiskAreas.length}</div><div class="empty">Distinct risk areas represented in the suite.</div></div>
                  </div>
                </section>
                <section class="section">
                  <h2>Suite Mix</h2>
                  <p class="section-intro">High-level distribution of the current suite for portfolio and release planning conversations.</p>
                  <div class="type-grid">
                    ${data.typeCounts
                      .map(
                        (item) => `
                          <div class="type-card">
                            <div>${escapeHtml(item.type)}</div>
                            <strong>${item.count}</strong>
                            ${renderBar(
                              data.rows.length === 0 ? 0 : Math.round((item.count / data.rows.length) * 100),
                              "#0f766e"
                            )}
                          </div>
                        `
                      )
                      .join("")}
                  </div>
                </section>`
              : `<section class="section">
                  <h2>QA Scorecards</h2>
                  <div class="subgrid">
                    <div class="panel"><h3>Open Gaps</h3><div class="score-value" style="font-size:26px;margin-top:4px;">${data.openGapCount}</div><div class="empty">Coverage gaps still open in the suite.</div></div>
                    <div class="panel"><h3>Impacted Cases</h3><div class="score-value" style="font-size:26px;margin-top:4px;">${data.impactedCaseCount}</div><div class="empty">Cases currently touched by requirement change impact.</div></div>
                    <div class="panel"><h3>Uncovered Sentences</h3><div class="score-value" style="font-size:26px;margin-top:4px;">${data.uncoveredRequirementCount}</div><div class="empty">Requirement sentences not yet linked to a case.</div></div>
                    <div class="panel"><h3>Risk Areas Covered</h3><div class="score-value" style="font-size:26px;margin-top:4px;">${data.coveredRiskAreas.length}</div><div class="empty">Distinct risk areas represented in the suite.</div></div>
                  </div>
                </section>
                <section class="section">
                  <h2>Type Distribution</h2>
                  <p class="section-intro">Operational mix of test case categories in the suite.</p>
                  <div class="type-grid">
                    ${data.typeCounts
                      .map(
                        (item) => `
                          <div class="type-card">
                            <div>${escapeHtml(item.type)}</div>
                            <strong>${item.count}</strong>
                            ${renderBar(
                              data.rows.length === 0 ? 0 : Math.round((item.count / data.rows.length) * 100),
                              "#0f766e"
                            )}
                          </div>
                        `
                      )
                      .join("")}
                  </div>
                </section>
                <section class="section">
                  <h2>Execution Focus</h2>
                  <p class="section-intro">Operational notes for QA review, execution readiness, and handoff.</p>
                  <div class="subgrid">
                    <div class="panel"><h3>Coverage Highlights</h3>${renderList(data.coverageHighlights, "No major coverage gaps detected.")}</div>
                    <div class="panel"><h3>Readiness Highlights</h3>${renderList(data.readinessHighlights, "The suite appears execution-ready.")}</div>
                    <div class="panel"><h3>Ambiguity Questions</h3>${renderList(data.ambiguityQuestions, "No major ambiguity questions remain.")}</div>
                    <div class="panel"><h3>Quality Review</h3>${renderList(data.qualityHighlights, "No major quality issues detected.")}</div>
                  </div>
                </section>`
          }
          ${data.changeHighlights.length > 0 ? `<section class="section"><h2>Change Impact Summary</h2><p class="section-intro">Current requirement comparison signals that may affect regression planning.</p>${renderList(data.changeHighlights, "No major change impacts detected.")}</section>` : ""}
          <section class="section">
            <h2>Trust Signals</h2>
            <p class="section-intro">Deterministic rules, visible reasoning, and recent audit history behind the current workspace state.</p>
            <div class="subgrid">
              <div class="panel"><h3>Deterministic Rules</h3>${renderList(data.deterministicRules, "No deterministic rules recorded.")}</div>
              <div class="panel"><h3>Risk Reasoning</h3>${renderList(data.trustRiskReasoning, "No risk reasoning was captured.")}</div>
              <div class="panel"><h3>Gap Reasoning</h3>${renderList(data.trustGapReasoning, "No gap reasoning was captured.")}</div>
              <div class="panel"><h3>Audit Trail</h3>${renderList(
                data.auditTrail.map(
                  (entry) =>
                    `${new Date(entry.createdAt).toLocaleString()}: ${entry.action} - ${entry.detail}`
                ),
                "No audit events recorded yet."
              )}</div>
            </div>
          </section>
          ${
            mode === "qa"
              ? `<section class="section"><h2>Traceability And Readiness</h2><p class="section-intro">Execution-oriented visibility into how completely the requirement is represented in the suite.</p><div class="subgrid"><div class="panel"><h3>Covered Risk Areas</h3>${renderList(data.coveredRiskAreas, "No distinct risk areas are mapped yet.")}</div><div class="panel"><h3>Readiness Notes</h3>${renderList(data.readinessHighlights, "The suite appears execution-ready.")}</div></div></section>
                 <section class="section"><h2>Review Intelligence</h2><p class="section-intro">Why each case exists, what risk it covers, and the requirement sentence it protects.</p>
                 <div class="case-card-list">
                 ${data.reviewInsights
                   .slice(0, 12)
                   .map(
                     (insight) => `
                       <div class="case-card">
                         <div class="case-card-header">
                           <div>
                             <div class="case-id">${escapeHtml(insight.id)}</div>
                             <h3>${escapeHtml(insight.title || "Untitled test case")}</h3>
                           </div>
                           <span class="case-type">${escapeHtml(insight.coveredRisk)}</span>
                         </div>
                         <div class="case-text"><strong>Requirement:</strong> ${escapeHtml(insight.mappedRequirementSentence)}</div>
                         <div class="case-text"><strong>Why this exists:</strong> ${escapeHtml(insight.whyThisExists)}</div>
                         <div class="case-text"><strong>Review reasoning:</strong> ${escapeHtml(insight.reasoning)}</div>
                       </div>
                     `
                   )
                   .join("")}
                 </div>
                 </section>`
              : ""
          }
          ${mode === "qa" ? `<section class="section"><h2>Detailed Case Appendix</h2><p class="section-intro">Full case export for review, signoff, or execution handoff.</p>${renderQaCaseCards(data.rows)}</section>` : `<section class="section"><h2>Highlighted Test Cases</h2><p class="section-intro">A short sample of representative cases from the current suite for stakeholder review.</p>${renderRowsTable(topRows)}</section>`}
        </div>
      </body>
    </html>
  `;
};

export const openReportWindow = (
  data: ReportData,
  mode: ReportMode,
  autoPrint = false
) => {
  const reportWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!reportWindow) {
    alert("Unable to open the report window. Please allow pop-ups and try again.");
    return;
  }

  reportWindow.document.open();
  reportWindow.document.write(buildReportHtml(data, mode));
  reportWindow.document.close();

  if (autoPrint) {
    reportWindow.onload = () => {
      reportWindow.focus();
      reportWindow.print();
    };
  }
};

const escapePdfText = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r/g, "")
    .replace(/\n/g, " ");

const wrapText = (text: string, maxChars: number) => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  words.forEach((word) => {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length > maxChars) {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [""];
};

type PdfItem =
  | { kind: "text"; text: string; size?: number; gap?: number }
  | {
      kind: "bar";
      label: string;
      value: number;
      color: [number, number, number];
      gap?: number;
    }
  | {
      kind: "testdata-row";
      category: string;
      value: string;
      gap?: number;
    };

const buildPdfLines = (data: ReportData, mode: ReportMode) => {
  const lines: PdfItem[] = [];
  const releaseDecision =
    data.readinessScore >= 80 &&
    data.coverageScore >= 75 &&
    data.openGapCount <= 1 &&
    data.impactedCaseCount <= 2
      ? "Go"
      : data.readinessScore >= 60 && data.coverageScore >= 55
      ? "Watch"
      : "Block";
  const addLine = (text: string, size = 11, gap = 16) => {
    wrapText(text, size >= 18 ? 58 : 92).forEach((line) => {
      lines.push({ kind: "text", text: line, size, gap });
    });
  };
  const addBar = (
    label: string,
    value: number,
    color: [number, number, number],
    gap = 22
  ) => {
    lines.push({ kind: "bar", label, value, color, gap });
  };
  const addSpacer = (gap = 10) => {
    lines.push({ kind: "text", text: "", size: 11, gap });
  };
  const addTestDataRow = (category: string, value: string, gap = 26) => {
    lines.push({ kind: "testdata-row", category, value, gap });
  };
  const addLabelValueRows = (
    title: string,
    rows: Array<{ label: string; value: string }>
  ) => {
    addLine(title, 11, 16);
    rows.forEach((row) => addTestDataRow(row.label, row.value, 24));
  };

  addLine("Summary Scores", 14, 18);
  addBar("Readiness", data.readinessScore, [0.02, 0.59, 0.41]);
  addBar("Coverage", data.coverageScore, [0.15, 0.39, 0.92]);
  addBar("Risk", data.riskScore, [0.96, 0.62, 0.04]);
  addBar("Ambiguity", data.ambiguityScore, [0.49, 0.24, 0.93]);
  if (data.changeHighlights.length > 0) {
    addBar("Change Impact", data.changeImpactScore, [0.86, 0.08, 0.24]);
  }
  addSpacer(10);

  if (mode === "business") {
    addLine("Release Decision", 14, 18);
    addLine(`Recommendation: ${releaseDecision}`);
    addLine(
      releaseDecision === "Go"
        ? "Readiness and coverage are strong enough to support confident business review."
        : releaseDecision === "Watch"
        ? "The workspace is promising, but unresolved gaps or change impact still need attention."
        : "Coverage and readiness remain too weak for confident release signoff."
    );
    addSpacer(10);
  }

  addLine("Requirement Summary", 14, 18);
  addLine(data.requirement || "No requirement captured.");
  addSpacer(10);

  addLine(mode === "business" ? "Suite Mix" : "Type Distribution", 14, 18);
  data.typeCounts.forEach((item) =>
    addLine(
      `${item.type}: ${item.count} (${Math.round(
        (item.count / Math.max(1, data.rows.length)) * 100
      )}%)`
    )
  );
  addSpacer(10);

  addLine("Risk Highlights", 14, 18);
  (data.riskHighlights.length > 0
    ? data.riskHighlights
    : ["No major risk highlights detected."]).forEach((item) =>
    addLine(`- ${item}`)
  );
  addSpacer(10);

  addLine("Coverage Highlights", 14, 18);
  (data.coverageHighlights.length > 0
    ? data.coverageHighlights
    : ["No major coverage gaps detected."]).forEach((item) =>
    addLine(`- ${item}`)
  );
  addSpacer(10);

  addLine(mode === "business" ? "Execution Readiness" : "Readiness Notes", 14, 18);
  (data.readinessHighlights.length > 0
    ? data.readinessHighlights
    : ["The suite appears execution-ready."]).forEach((item) =>
    addLine(`- ${item}`)
  );
  addSpacer(10);

  addLine(mode === "business" ? "Open Questions" : "Ambiguity Questions", 14, 18);
  (data.ambiguityQuestions.length > 0
    ? data.ambiguityQuestions
    : ["No major ambiguity questions remain."]).forEach((item) =>
    addLine(`- ${item}`)
  );

  if (data.changeHighlights.length > 0) {
    addSpacer(10);
    addLine("Change Impact Highlights", 14, 18);
    data.changeHighlights.forEach((item) => addLine(`- ${item}`));
  }

  addSpacer(10);
  addLine(mode === "business" ? "Decision Scorecards" : "QA Scorecards", 14, 18);
  addLine(`Open coverage gaps: ${data.openGapCount}`);
  addLine(`Impacted existing cases: ${data.impactedCaseCount}`);
  addLine(`Uncovered requirement sentences: ${data.uncoveredRequirementCount}`);
  addLine(`Risk areas covered: ${data.coveredRiskAreas.length}`);

  if (mode === "qa") {
    addSpacer(10);
    addLine("Case Quality Review", 14, 18);
    (data.qualityHighlights.length > 0
      ? data.qualityHighlights
      : ["No major quality issues detected."]).forEach((item) =>
      addLine(`- ${item}`)
    );
    addSpacer(10);
    addLine("Covered Risk Areas", 14, 18);
    (data.coveredRiskAreas.length > 0
      ? data.coveredRiskAreas
      : ["No distinct risk areas are mapped yet."]).forEach((item) =>
      addLine(`- ${item}`)
    );
  }

  addSpacer(12);
  addLine(mode === "qa" ? "Detailed Case Appendix" : "Highlighted Test Cases", 14, 18);
  (mode === "qa" ? data.rows : data.rows.slice(0, 6)).forEach((row) => {
    addLine(`${row.id} | ${row.type} | ${row.title}`, 11, 16);
    if (mode === "qa") {
      addLabelValueRows("Preconditions", [
        { label: "Context", value: row.preconditions || "-" },
      ]);

      const stepEntries = row.steps
        .split(";")
        .map((item) => item.trim())
        .filter(Boolean);
      addLabelValueRows(
        "Steps",
        stepEntries.length === 0
          ? [{ label: "Step 1", value: "-" }]
          : stepEntries.map((step, index) => ({
              label: `Step ${index + 1}`,
              value: step,
            }))
      );

      addLabelValueRows("Expected Result", [
        { label: "Outcome", value: row.expectedResult || "-" },
      ]);

      const testDataGroups = groupTestDataEntries(row.testData);
      if (testDataGroups.length === 0) {
        addLabelValueRows("Test Data", [{ label: "General", value: "-" }]);
      } else {
        addLine("Test Data", 11, 16);
        testDataGroups.forEach((group) => {
          addTestDataRow(group.category, group.entries.join("; "));
        });
      }
    } else {
      addLine(`Preconditions: ${row.preconditions || "-"}`);
      addLine(`Steps: ${row.steps || "-"}`);
      addLine(`Expected Result: ${row.expectedResult || "-"}`);
      addLine(`Test Data: ${row.testData || "-"}`);
    }
    addSpacer(8);
  });

  return lines;
};

const buildPdfBlob = (data: ReportData, mode: ReportMode) => {
  const pageWidth = 595;
  const pageHeight = 842;
  const left = 48;
  const top = 728;
  const bottom = 56;
  const defaultFontSize = 11;

  const lines = buildPdfLines(data, mode);
  const pages: string[] = [];
  let currentPage = "";
  let y = top;
  const palette = {
    ink: [0.07, 0.09, 0.14] as [number, number, number],
    muted: [0.39, 0.44, 0.52] as [number, number, number],
    panel: [0.97, 0.98, 0.98] as [number, number, number],
    panelBorder: [0.86, 0.89, 0.92] as [number, number, number],
    track: [0.89, 0.92, 0.94] as [number, number, number],
    readiness: [0.06, 0.58, 0.50] as [number, number, number],
    coverage: [0.13, 0.51, 0.77] as [number, number, number],
    risk: [0.83, 0.53, 0.12] as [number, number, number],
    ambiguity: [0.37, 0.32, 0.76] as [number, number, number],
    accent: [0.08, 0.46, 0.43] as [number, number, number],
  };

  const startPage = () => {
    currentPage =
      `${palette.panel[0]} ${palette.panel[1]} ${palette.panel[2]} rg\n` +
      `28 760 539 54 re f\n` +
      `${palette.accent[0]} ${palette.accent[1]} ${palette.accent[2]} rg\n` +
      `28 805 539 9 re f\n` +
      `${palette.panelBorder[0]} ${palette.panelBorder[1]} ${palette.panelBorder[2]} RG\n` +
      `28 760 539 54 re S\n` +
      `BT\n/F1 11 Tf\n` +
      `${palette.muted[0]} ${palette.muted[1]} ${palette.muted[2]} rg\n` +
      `1 0 0 1 46 798 Tm (${escapePdfText(
        mode === "business" ? "CASEFORGE BUSINESS REPORT" : "CASEFORGE QA REPORT"
      )}) Tj\n` +
      `${palette.ink[0]} ${palette.ink[1]} ${palette.ink[2]} rg\n` +
      `/F1 18 Tf\n1 0 0 1 46 776 Tm (${escapePdfText(
        data.projectName || "Untitled Workspace"
      )}) Tj\n` +
      `/F1 10 Tf\n${palette.muted[0]} ${palette.muted[1]} ${palette.muted[2]} rg\n` +
      `1 0 0 1 46 762 Tm (${escapePdfText(
        `${data.generationMode} mode | ${data.coverageDepth} coverage | ${data.persona} persona | ${data.rows.length} cases`
      )}) Tj\n`;
    y = top;
  };

  const finishPage = () => {
    currentPage += "ET\n";
    pages.push(currentPage);
  };

  startPage();

  lines.forEach((line) => {
    const gap = line.gap ?? 16;
    if (y - gap < bottom) {
      finishPage();
      startPage();
    }

    if (line.kind === "text") {
      const size = line.size ?? defaultFontSize;
      const color =
        size >= 18
          ? palette.ink
          : size >= 14
          ? palette.accent
          : palette.ink;
      currentPage += `${color[0]} ${color[1]} ${color[2]} rg\n/F1 ${size} Tf\n1 0 0 1 ${left} ${y} Tm (${escapePdfText(
        line.text
      )}) Tj\n`;
      y -= gap;
      return;
    }

    if (line.kind === "testdata-row") {
      const rowHeight = 22;
      const categoryWidth = 132;
      const totalWidth = 468;
      const valueX = left + categoryWidth + 12;
      const wrappedValueLines = wrapText(line.value, 62);
      const dynamicHeight = Math.max(rowHeight, 12 + wrappedValueLines.length * 12);
      const baseY = y - dynamicHeight + 6;

      if (y - dynamicHeight < bottom) {
        finishPage();
        startPage();
      }

      currentPage += `0.94 0.98 0.96 rg\n${left} ${baseY} ${categoryWidth} ${dynamicHeight} re f\n`;
      currentPage += `0.98 0.99 0.99 rg\n${left + categoryWidth} ${baseY} ${totalWidth - categoryWidth} ${dynamicHeight} re f\n`;
      currentPage += `${palette.panelBorder[0]} ${palette.panelBorder[1]} ${palette.panelBorder[2]} RG\n${left} ${baseY} ${totalWidth} ${dynamicHeight} re S\n`;
      currentPage += `${palette.accent[0]} ${palette.accent[1]} ${palette.accent[2]} rg\n/F1 10 Tf\n1 0 0 1 ${left + 8} ${baseY + dynamicHeight - 14} Tm (${escapePdfText(
        line.category
      )}) Tj\n`;
      wrappedValueLines.forEach((valueLine, index) => {
        currentPage += `${palette.ink[0]} ${palette.ink[1]} ${palette.ink[2]} rg\n/F1 9 Tf\n1 0 0 1 ${valueX} ${
          baseY + dynamicHeight - 14 - index * 11
        } Tm (${escapePdfText(valueLine)}) Tj\n`;
      });
      y -= dynamicHeight + 6;
      return;
    }

    const labelY = y;
    const cardY = y - 18;
    const barY = y - 12;
    const barWidth = 180;
    const barHeight = 10;
    const safeValue = Math.max(0, Math.min(100, line.value));
    const filledWidth = (barWidth * safeValue) / 100;
    const [r, g, b] = line.color;

    currentPage += `${palette.panel[0]} ${palette.panel[1]} ${palette.panel[2]} rg\n${left - 8} ${cardY} 252 30 re f\n`;
    currentPage += `${palette.panelBorder[0]} ${palette.panelBorder[1]} ${palette.panelBorder[2]} RG\n${left - 8} ${cardY} 252 30 re S\n`;
    currentPage += `${palette.ink[0]} ${palette.ink[1]} ${palette.ink[2]} rg\n/F1 11 Tf\n1 0 0 1 ${left} ${labelY} Tm (${escapePdfText(
      line.label
    )}) Tj\n`;
    currentPage += `${palette.muted[0]} ${palette.muted[1]} ${palette.muted[2]} rg\n/F1 10 Tf\n1 0 0 1 ${left + 198} ${labelY} Tm (${escapePdfText(
      String(safeValue)
    )}) Tj\n`;
    currentPage += `${palette.track[0]} ${palette.track[1]} ${palette.track[2]} rg\n${left} ${barY} ${barWidth} ${barHeight} re f\n`;
    currentPage += `${r} ${g} ${b} rg\n${left} ${barY} ${filledWidth} ${barHeight} re f\n`;
    currentPage += `${palette.panelBorder[0]} ${palette.panelBorder[1]} ${palette.panelBorder[2]} RG\n${left} ${barY} ${barWidth} ${barHeight} re S\n`;
    y -= gap + 8;
  });

  finishPage();

  const objects: string[] = [];
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj");
  objects.push(
    `2 0 obj\n<< /Type /Pages /Count ${pages.length} /Kids [${pages
      .map((_, index) => `${index + 3} 0 R`)
      .join(" ")}] >>\nendobj`
  );

  const fontObjectId = pages.length + 3;

  pages.forEach((pageContent, index) => {
    const contentObjectId = fontObjectId + 1 + index;
    objects.push(
      `${index + 3} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>\nendobj`
    );
  });

  objects.push(
    `${fontObjectId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`
  );

  pages.forEach((pageContent, index) => {
    const contentObjectId = fontObjectId + 1 + index;
    objects.push(
      `${contentObjectId} 0 obj\n<< /Length ${pageContent.length} >>\nstream\n${pageContent}endstream\nendobj`
    );
  });

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  objects.forEach((object) => {
    offsets.push(pdf.length);
    pdf += `${object}\n`;
  });

  const xrefPosition = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPosition}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
};

export const downloadReportPdf = (data: ReportData, mode: ReportMode) => {
  const blob = buildPdfBlob(data, mode);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeName = (data.projectName || "caseforge-report")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  link.href = url;
  link.download = `${safeName || "caseforge-report"}-${mode === "business" ? "business-report" : "qa-report"}.pdf`;
  link.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const downloadCollaborationMarkdown = (data: ReportData) => {
  const lines = [
    `# ${data.projectName} Review Summary`,
    "",
    `- Signoff status: ${data.signoffStatus}`,
    `- Reviewer: ${data.reviewerName || "Unassigned"}`,
    `- Persona: ${data.persona}`,
    `- Generation mode: ${data.generationMode}`,
    `- Coverage depth: ${data.coverageDepth}`,
    "",
    "## Reviewer Notes",
    "",
    data.reviewerNotes || "No reviewer notes captured.",
    "",
    "## Imported Sources",
    "",
    ...(data.sourceArtifacts.length === 0
      ? ["- No imported source artifacts."]
      : data.sourceArtifacts.map(
          (source) =>
            `- ${source.title} (${source.type}) imported on ${new Date(
              source.importedAt
            ).toLocaleString()}`
        )),
    "",
    "## Audit Trail",
    "",
    ...(data.auditTrail.length === 0
      ? ["- No audit events recorded."]
      : data.auditTrail.map(
          (entry) =>
            `- ${new Date(entry.createdAt).toLocaleString()}: ${entry.action} - ${entry.detail}`
        )),
  ];

  const safeName = (data.projectName || "caseforge-review")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  downloadTextFile(
    `${safeName || "caseforge-review"}-review-summary.md`,
    lines.join("\n")
  );
};
