"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { OverlayFormShell } from "./FilterWorkspaceSections";
import ProjectModuleSubnav from "./ProjectModuleSubnav";
import { useProjectDataState } from "./ProjectDataStateContext";
import { useProjectIssueState } from "./ProjectIssueStateContext";
import { parseResultToRows } from "../utils/parser";
import { buildProjectReportsSummary } from "../utils/project-reports";
import {
  buildSalesforceExecutionFailuresByObject,
  buildSalesforceRunBreakdown,
  getSalesforceEnvironmentBindings,
  getSalesforceRows,
  inferSalesforceModule,
  inferSalesforceObjectType,
  inferSalesforceTestType,
  salesforceModuleOptions,
  salesforceObjectOptions,
  salesforceTestTypeOptions,
} from "../utils/salesforce";
import { formatUtcDate } from "../utils/date-format";
import {
  CompactMetricCard,
  CompactMetricGrid,
  compactBadgeClassName,
  compactEyebrowClassName,
} from "./FilterWorkspaceSections";
import {
  formatTestCaseId,
  prepareGeneratedRows,
  type AutomationBinding,
  type AutomationEnvironmentBinding,
  type AutomationExecution,
  type AutomationProvider,
  type AutomationStep,
  type Project,
} from "../utils/workspace";

type SalesforceSection =
  | "overview"
  | "cases"
  | "runs"
  | "reports"
  | "objects"
  | "environments"
  | "mappings";

type Props = {
  projectKey: string;
  initialProject: Project | null;
  initialSection: SalesforceSection;
};

const navItems = [
  ["overview", "Salesforce Overview", ""],
  ["cases", "Manual Cases", "/cases"],
  ["runs", "Runs", "/runs"],
  ["reports", "Reports", "/reports"],
  ["objects", "Objects & Modules", "/objects"],
  ["environments", "Environments", "/environments"],
  ["mappings", "Mappings", "/mappings"],
] as const;

const cardClassName =
  "rounded-[24px] border border-zinc-200/80 bg-white/96 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/94";

const fieldClassName =
  "w-full rounded-2xl border border-zinc-200/80 bg-white px-3 py-2.5 text-sm outline-none dark:border-zinc-700 dark:bg-zinc-950";

const fieldLabelClassName =
  "mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400";

const chipTone = {
  passed:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
  failed:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
  blocked:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
  "not-run":
    "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
} as const;

const nowTimestamp = () => Date.now();

const parseAutomationApiResponse = async <T,>(response: Response): Promise<T> => {
  const raw = await response.text();

  try {
    return raw ? (JSON.parse(raw) as T) : ({} as T);
  } catch {
    const trimmed = raw.trim();
    if (/^<!doctype html>|^<html/i.test(trimmed)) {
      throw new Error(
        "The automation API returned an HTML error page instead of JSON. Check the server console for the underlying error."
      );
    }

    throw new Error("The automation API returned an invalid response.");
  }
};

export default function ProjectSalesforceClient({
  projectKey,
  initialProject,
  initialSection,
}: Props) {
  const router = useRouter();
  const projectState = useProjectDataState();
  const issueState = useProjectIssueState();
  const [localProject, setLocalProject] = useState<Project | null>(initialProject);
  const [requirement, setRequirement] = useState("");
  const [moduleName, setModuleName] = useState("");
  const [objectType, setObjectType] = useState("");
  const [testType, setTestType] = useState("");
  const [permissionScope, setPermissionScope] = useState("");
  const [environmentScope, setEnvironmentScope] = useState("");
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingEnvironmentId, setEditingEnvironmentId] = useState<string | null>(null);
  const [environmentName, setEnvironmentName] = useState("");
  const [environmentBaseUrl, setEnvironmentBaseUrl] = useState("");
  const [environmentOrgAlias, setEnvironmentOrgAlias] = useState("");
  const [environmentUserAliases, setEnvironmentUserAliases] = useState("");
  const [environmentProfileAliases, setEnvironmentProfileAliases] = useState("");
  const [environmentAppAliases, setEnvironmentAppAliases] = useState("");

  const project = projectState?.project ?? localProject ?? initialProject;
  const encodedProjectKey = encodeURIComponent(projectKey);
  const rows = useMemo(() => getSalesforceRows(project), [project]);
  const reportsSummary = useMemo(
    () => buildProjectReportsSummary(project, issueState?.issues ?? []),
    [issueState?.issues, project]
  );
  const rowIds = useMemo(() => new Set(rows.map((row) => row.id)), [rows]);
  const scripts = project?.automationScripts ?? [];
  const bindings = (project?.automationBindings ?? []).filter((item) =>
    rowIds.has(item.testCaseId)
  );
  const executions = (project?.automationExecutions ?? []).filter((item) =>
    rowIds.has(item.caseId)
  );
  const automationRows = rows.filter(
    (row) => row.automationScriptId || row.automationStatus === "automated"
  );
  const manualRows = rows.filter((row) => !row.automationScriptId);
  const selectedRow =
    automationRows.find((row) => row.id === selectedCaseId) ?? automationRows[0] ?? null;
  const scriptById = Object.fromEntries(scripts.map((script) => [script.id, script]));
  const latestExecutionByCaseId = [...executions]
    .sort((left, right) => right.startedAt - left.startedAt)
    .reduce<Record<string, (typeof executions)[number]>>((accumulator, execution) => {
      if (!accumulator[execution.caseId]) {
        accumulator[execution.caseId] = execution;
      }
      return accumulator;
    }, {});
  const salesforceRuns = (project?.runs ?? []).filter((run) =>
    Object.keys(run.rowResults ?? {}).some((rowId) => rowIds.has(rowId))
  );
  const runBreakdown = buildSalesforceRunBreakdown(rows, salesforceRuns);
  const failuresByObject = buildSalesforceExecutionFailuresByObject(rows, executions);
  const environments = getSalesforceEnvironmentBindings(project);
  const allEnvironments = project?.automationEnvironmentBindings ?? [];
  const activeEnvironmentId = project?.activeAutomationEnvironmentId ?? "";
  const activeRunId = project?.activeRunId ?? "";

  const persistProject = async (nextProject: Project) => {
    const response = await fetch("/api/projects", { cache: "no-store" });
    const payload = (await response.json()) as { projects?: Project[] };
    const nextProjects = (payload.projects ?? []).map((entry) =>
      entry.id === nextProject.id ||
      entry.projectKey?.trim().toLowerCase() === projectKey.trim().toLowerCase()
        ? nextProject
        : entry
    );
    const saveResponse = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projects: nextProjects }),
    });
    const savePayload = (await saveResponse.json()) as { projects?: Project[] };
    const savedProject =
      savePayload.projects?.find((entry) => entry.id === nextProject.id) ?? nextProject;
    setLocalProject(savedProject);
    projectState?.setProject(savedProject);
    router.refresh();
    return savedProject;
  };

  const generateSalesforceCases = async () => {
    if (!project || !requirement.trim()) {
      setNotice("Add a Salesforce requirement before generating cases.");
      return;
    }
    setGenerating(true);
    setNotice(null);
    try {
      const contextualRequirement = [
        requirement.trim(),
        moduleName ? `Salesforce module: ${moduleName}` : null,
        objectType ? `Salesforce object: ${objectType}` : null,
        testType ? `Salesforce test type: ${testType}` : null,
        permissionScope ? `Permission scope: ${permissionScope}` : null,
        environmentScope ? `Environment scope: ${environmentScope}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requirement: contextualRequirement,
          mode: "salesforce",
          coverage: "thorough",
          persona: "all",
        }),
      });
      const data = (await response.json()) as { result?: string };
      const nextRows = prepareGeneratedRows(
        parseResultToRows(data.result || ""),
        "salesforce"
      ).map((row, index) => ({
        ...row,
        id: formatTestCaseId((project.rows?.length ?? 0) + index),
        platformDomain: "salesforce" as const,
        salesforceModule: moduleName || inferSalesforceModule(row),
        salesforceObjectType: objectType || inferSalesforceObjectType(row),
        salesforceTestType: testType || inferSalesforceTestType(row),
        permissionScope: permissionScope || undefined,
        environmentScope: environmentScope || undefined,
        suiteName: row.suiteName || "Salesforce",
        componentArea: row.componentArea || moduleName || "Salesforce",
        generationSource: "ai-generated" as const,
        createdAt: nowTimestamp() + index,
        updatedAt: nowTimestamp() + index,
      }));
      await persistProject({
        ...(project as Project),
        rows: [...(project?.rows ?? []), ...nextRows],
        updatedAt: nowTimestamp(),
      });
      setNotice(`Generated ${nextRows.length} Salesforce manual cases.`);
      setRequirement("");
    } catch (error) {
      console.error(error);
      setNotice("Unable to generate Salesforce manual cases.");
    } finally {
      setGenerating(false);
    }
  };

  const saveSalesforceEnvironment = async () => {
    if (!project || !environmentName.trim()) return;
    const now = nowTimestamp();
    const id = editingEnvironmentId ?? crypto.randomUUID();
    const nextEnvironment: AutomationEnvironmentBinding = {
      id,
      name: environmentName.trim(),
      baseUrl: environmentBaseUrl.trim() || undefined,
      platformDomain: "salesforce",
      environmentScope: environmentScope.trim() || undefined,
      salesforceOrgAlias: environmentOrgAlias.trim() || undefined,
      salesforceUserAliases: environmentUserAliases.split(",").map((item) => item.trim()).filter(Boolean),
      salesforceProfileAliases: environmentProfileAliases.split(",").map((item) => item.trim()).filter(Boolean),
      salesforceAppAliases: environmentAppAliases.split(",").map((item) => item.trim()).filter(Boolean),
      credentialAliases: [],
      isDefault: false,
      createdAt: allEnvironments.find((item) => item.id === id)?.createdAt ?? now,
      updatedAt: now,
    };
    await persistProject({
      ...(project as Project),
      automationEnvironmentBindings: [
        ...allEnvironments.filter((item) => item.id !== id),
        nextEnvironment,
      ],
      updatedAt: now,
    });
    setEditorOpen(false);
  };

  const saveReuseLibrary = async (payload: {
    reusableBlocks: Project["automationReusableBlocks"];
    environments: AutomationEnvironmentBinding[];
    activeEnvironmentId: string;
  }) => {
    if (!project) return;
    await persistProject({
      ...project,
      automationReusableBlocks: payload.reusableBlocks,
      automationEnvironmentBindings: payload.environments,
      activeAutomationEnvironmentId: payload.activeEnvironmentId,
      updatedAt: nowTimestamp(),
    });
  };

  const saveAutomationForRow = async (payload: {
    rowId: string;
    mode: "manual" | "automated" | "hybrid";
    provider: AutomationProvider;
    executionMode: "headless" | "headed";
    environmentBindingId?: string;
    name: string;
    description?: string;
    steps: AutomationStep[];
  }) => {
    if (!project) return;
    const now = nowTimestamp();
    const existingBinding =
      bindings.find((binding) => binding.testCaseId === payload.rowId) ?? null;
    const existingScript =
      existingBinding?.scriptId
        ? project.automationScripts?.find((script) => script.id === existingBinding.scriptId) ??
          null
        : null;
    const scriptId = existingScript?.id ?? crypto.randomUUID();
    await persistProject({
      ...project,
      automationScripts: [
        ...(project.automationScripts ?? []).filter((script) => script.id !== scriptId),
        {
          id: scriptId,
          projectId: project.id,
          provider: payload.provider,
          executionMode: payload.executionMode,
          environmentBindingId: payload.environmentBindingId,
          name: payload.name.trim() || `Salesforce automation for ${payload.rowId}`,
          description: payload.description?.trim() || undefined,
          createdAt: existingScript?.createdAt ?? now,
          updatedAt: now,
        },
      ],
      automationSteps: {
        ...(project.automationSteps ?? {}),
        [scriptId]: payload.steps.map((step, index) => ({
          ...step,
          id: step.id || crypto.randomUUID(),
          scriptId,
          order: index,
        })),
      },
      automationBindings: [
        ...(project.automationBindings ?? []).filter(
          (binding) => binding.testCaseId !== payload.rowId
        ),
        {
          id: existingBinding?.id ?? crypto.randomUUID(),
          testCaseId: payload.rowId,
          scriptId,
          mode: payload.mode,
        } satisfies AutomationBinding,
      ],
      rows: (project.rows ?? []).map((row) =>
        row.id === payload.rowId
          ? {
              ...row,
              automationStatus:
                payload.mode === "manual" ? "manual" : ("automated" as const),
              automationProvider:
                payload.provider === "api"
                  ? "API Automation"
                  : payload.provider === "mobile"
                    ? "Mobile Automation"
                    : payload.provider === "cypress"
                      ? "Cypress"
                      : "Playwright",
              automationReference: scriptId,
              automationScriptId: scriptId,
              automationBindingMode: payload.mode,
              updatedAt: now,
            }
          : row
      ),
      updatedAt: now,
    });
  };

  const runAutomationForRow = async (
    rowId: string,
    options?: { scriptId?: string; executionMode?: "headless" | "headed" }
  ) => {
    void options;
    return {
      tone: "info" as const,
      text: `Automation has been removed. ${rowId} cannot be executed from Salesforce.`,
    };
  };

  const openEnvironmentEditor = (environment?: AutomationEnvironmentBinding) => {
    setEditingEnvironmentId(environment?.id ?? null);
    setEnvironmentName(environment?.name ?? "");
    setEnvironmentBaseUrl(environment?.baseUrl ?? "");
    setEnvironmentOrgAlias(environment?.salesforceOrgAlias ?? "");
    setEnvironmentUserAliases((environment?.salesforceUserAliases ?? []).join(", "));
    setEnvironmentProfileAliases((environment?.salesforceProfileAliases ?? []).join(", "));
    setEnvironmentAppAliases((environment?.salesforceAppAliases ?? []).join(", "));
    setEnvironmentScope(environment?.environmentScope ?? "");
    setEditorOpen(true);
  };

  const mappingRows = rows.reduce<Record<string, { module: string; cases: number; automated: number; failures: number }>>(
    (accumulator, row) => {
      const key = row.salesforceObjectType || "Unmapped";
      if (!accumulator[key]) {
        accumulator[key] = { module: row.salesforceModule || "Unmapped", cases: 0, automated: 0, failures: 0 };
      }
      accumulator[key].cases += 1;
      if (row.automationScriptId || row.automationStatus === "automated") {
        accumulator[key].automated += 1;
      }
      const latest = latestExecutionByCaseId[row.id];
      if (latest?.status === "failed" || latest?.status === "blocked") {
        accumulator[key].failures += 1;
      }
      return accumulator;
    },
    {}
  );

  return (
    <div className="flex flex-col gap-6">
      <section className={cardClassName}>
        <p className={compactEyebrowClassName}>Salesforce</p>
        <h2 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">Domain testing workspace</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
          Salesforce testing now lives as a dedicated enterprise QA module built on the shared cases, automation, runs, reports, and release foundations.
        </p>
      </section>

      <ProjectModuleSubnav
        label="Salesforce Module"
        items={navItems.map(([, label, href]) => ({
          href: `/projects/${encodedProjectKey}/salesforce${href}`,
          label,
        }))}
      />

      {initialSection === "overview" ? (
        <CompactMetricGrid>
          {[
            ["Manual Cases", manualRows.length],
            ["Automated Cases", automationRows.length],
            ["Salesforce Runs", salesforceRuns.length],
            ["Shared Failures", reportsSummary.executionSummary.failed],
          ].map(([label, value]) => (
            <CompactMetricCard key={String(label)} label={String(label)} value={value} className={cardClassName} valueClassName="mt-2 text-2xl font-semibold leading-none text-zinc-950 dark:text-zinc-50" />
          ))}
        </CompactMetricGrid>
      ) : null}

      {initialSection === "cases" ? (
        <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <article className={cardClassName}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">Salesforce Manual Generation</p>
            <div className="mt-4">
              <label className="block">
                <span className={fieldLabelClassName}>Requirement</span>
                <textarea value={requirement} onChange={(event) => setRequirement(event.target.value)} placeholder="Describe the workflow, object behavior, permissions, validation rules, or Lightning flow to cover." className="min-h-[180px] w-full rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-sm outline-none dark:border-zinc-700 dark:bg-zinc-950" />
              </label>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className={fieldLabelClassName}>Salesforce Module</span>
                <select value={moduleName} onChange={(event) => setModuleName(event.target.value)} className={fieldClassName}><option value="">Select module</option>{salesforceModuleOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>
              </label>
              <label className="block">
                <span className={fieldLabelClassName}>Object Type</span>
                <select value={objectType} onChange={(event) => setObjectType(event.target.value)} className={fieldClassName}><option value="">Select object</option>{salesforceObjectOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>
              </label>
              <label className="block">
                <span className={fieldLabelClassName}>Test Type</span>
                <select value={testType} onChange={(event) => setTestType(event.target.value)} className={fieldClassName}><option value="">Select test type</option>{salesforceTestTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>
              </label>
              <label className="block">
                <span className={fieldLabelClassName}>Permission Scope</span>
                <input value={permissionScope} onChange={(event) => setPermissionScope(event.target.value)} placeholder="Manager, support agent, system admin..." className={fieldClassName} />
              </label>
              <label className="block md:col-span-2">
                <span className={fieldLabelClassName}>Environment Scope</span>
                <input value={environmentScope} onChange={(event) => setEnvironmentScope(event.target.value)} placeholder="Sandbox, UAT, staging org..." className={fieldClassName} />
              </label>
            </div>
            <div className="mt-4 flex gap-3">
              <button type="button" onClick={() => void generateSalesforceCases()} disabled={generating} className="rounded-2xl bg-[linear-gradient(135deg,_#0f766e_0%,_#14532d_100%)] px-5 py-3 text-sm font-semibold text-white">{generating ? "Generating..." : "Generate Salesforce Cases"}</button>
              <Link href={`/projects/${encodedProjectKey}/cases`} className="rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">Open Shared Cases</Link>
            </div>
            {notice ? <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">{notice}</p> : null}
          </article>
          <article className={cardClassName}>
            <p className={compactEyebrowClassName}>Recent Salesforce Cases</p>
            <div className="mt-4 space-y-3">{manualRows.slice(0, 8).map((row) => <div key={row.id} className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/70"><p className="font-semibold text-zinc-950 dark:text-zinc-50">{row.id} | {row.title}</p><p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{row.salesforceModule || "Salesforce"} | {row.salesforceObjectType || "Object"} | {row.salesforceTestType || "Scenario"}</p></div>)}</div>
          </article>
        </section>
      ) : null}

      {initialSection === "runs" || initialSection === "reports" ? (
        <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <article className={cardClassName}>
            <p className={compactEyebrowClassName}>Run Breakdown</p>
            <div className="mt-4 flex flex-wrap gap-3">{Object.entries(runBreakdown).map(([status, count]) => <div key={status} className={`${compactBadgeClassName} min-w-[11rem] border px-4 py-3 text-sm ${chipTone[status as keyof typeof chipTone]}`}>{status}: {count}</div>)}</div>
          </article>
          <article className={cardClassName}>
            <p className={compactEyebrowClassName}>{initialSection === "runs" ? "Recent Salesforce Runs" : "Failures By Object"}</p>
            <div className="mt-4 space-y-3">{initialSection === "runs" ? salesforceRuns.slice(0, 6).map((run) => <div key={run.id} className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/70"><p className="font-semibold text-zinc-950 dark:text-zinc-50">{run.name}</p><p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{formatUtcDate(run.updatedAt)}</p></div>) : Object.entries(failuresByObject).map(([object, count]) => <div key={object} className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/70">{object}: {count}</div>)}</div>
          </article>
        </section>
      ) : null}

      {initialSection === "objects" || initialSection === "mappings" ? (
        <section className={cardClassName}>
          <p className={compactEyebrowClassName}>{initialSection === "objects" ? "Objects & Modules" : "Mappings"}</p>
          <div className="mt-4 space-y-3">{Object.entries(mappingRows).map(([object, summary]) => <div key={object} className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950/70"><div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><p className="break-words font-semibold text-zinc-950 dark:text-zinc-50">{object}</p><p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{summary.module}</p></div><div className="flex flex-wrap gap-2 text-xs"><span className={`${compactBadgeClassName} border border-zinc-200 bg-white px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-950`}>Cases {summary.cases}</span><span className={`${compactBadgeClassName} border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200`}>Automated {summary.automated}</span><span className={`${compactBadgeClassName} border border-rose-200 bg-rose-50 px-3 py-1.5 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200`}>Failed {summary.failures}</span></div></div></div>)}</div>
        </section>
      ) : null}

      {initialSection === "environments" ? (
        <>
          <section className={cardClassName}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">Salesforce Environments</p><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Keep org aliases, app aliases, and role/profile summaries here without pushing long forms into case pages.</p></div>
              <button type="button" onClick={() => openEnvironmentEditor()} className="rounded-2xl bg-[linear-gradient(135deg,_#1d4ed8_0%,_#0f766e_100%)] px-4 py-2 text-sm font-semibold text-white">Add Salesforce Environment</button>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">{environments.map((environment) => <article key={environment.id} className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-zinc-950 dark:text-zinc-50">{environment.name}</p><p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{environment.salesforceOrgAlias || "Org alias not set"} | {environment.environmentScope || "No scope"}</p></div><button type="button" onClick={() => openEnvironmentEditor(environment)} className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">Edit</button></div><p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">{environment.baseUrl || "No org URL configured"}</p></article>)}</div>
          </section>
          <OverlayFormShell open={editorOpen} onClose={() => setEditorOpen(false)} title={editingEnvironmentId ? "Edit Salesforce environment" : "Add Salesforce environment"} description="Use aliases and safe URLs only. Keep secrets outside client storage.">
            <div className="grid gap-3">
              <label className="block">
                <span className={fieldLabelClassName}>Environment Label</span>
                <input value={environmentName} onChange={(event) => setEnvironmentName(event.target.value)} placeholder="Sales sandbox" className={fieldClassName} />
              </label>
              <label className="block">
                <span className={fieldLabelClassName}>Org URL</span>
                <input value={environmentBaseUrl} onChange={(event) => setEnvironmentBaseUrl(event.target.value)} placeholder="https://example.my.salesforce.com" className={fieldClassName} />
              </label>
              <label className="block">
                <span className={fieldLabelClassName}>Org Alias</span>
                <input value={environmentOrgAlias} onChange={(event) => setEnvironmentOrgAlias(event.target.value)} placeholder="uat-west" className={fieldClassName} />
              </label>
              <label className="block">
                <span className={fieldLabelClassName}>Environment Scope</span>
                <input value={environmentScope} onChange={(event) => setEnvironmentScope(event.target.value)} placeholder="UAT, regression, release validation" className={fieldClassName} />
              </label>
              <label className="block">
                <span className={fieldLabelClassName}>User Aliases</span>
                <input value={environmentUserAliases} onChange={(event) => setEnvironmentUserAliases(event.target.value)} placeholder="qa_user, sales_mgr" className={fieldClassName} />
              </label>
              <label className="block">
                <span className={fieldLabelClassName}>Profile / Role Aliases</span>
                <input value={environmentProfileAliases} onChange={(event) => setEnvironmentProfileAliases(event.target.value)} placeholder="inside_sales, support_manager" className={fieldClassName} />
              </label>
              <label className="block">
                <span className={fieldLabelClassName}>App / Module Aliases</span>
                <input value={environmentAppAliases} onChange={(event) => setEnvironmentAppAliases(event.target.value)} placeholder="sales_console, service_console" className={fieldClassName} />
              </label>
              <div className="flex justify-end gap-3"><button type="button" onClick={() => setEditorOpen(false)} className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">Cancel</button><button type="button" onClick={() => void saveSalesforceEnvironment()} className="rounded-2xl bg-[linear-gradient(135deg,_#1d4ed8_0%,_#0f766e_100%)] px-4 py-2 text-sm font-semibold text-white">Save Environment</button></div>
            </div>
          </OverlayFormShell>
        </>
      ) : null}

      <section className={cardClassName}>
        <div className="flex flex-wrap gap-2">
          <Link href={`/projects/${encodedProjectKey}/cases`} className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">Shared Cases</Link>
          <Link href={`/projects/${encodedProjectKey}/runs`} className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">Shared Runs</Link>
          <Link href={`/projects/${encodedProjectKey}/reports`} className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">Shared Reports</Link>
        </div>
      </section>
    </div>
  );
}
