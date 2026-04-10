import Link from "next/link";
import ActiveReviewerBanner from "../components/ActiveReviewerBanner";
import AppSidebar from "../components/AppSidebar";
import TrendChart from "../components/charts/TrendChart";
import ResponsiveShell from "../components/ResponsiveShell";
import { readProjects } from "../utils/project-store";

const projectHref = (projectKey: string | undefined, projectId: string) =>
  `/projects/${encodeURIComponent(projectKey?.trim() || projectId)}`;

const formatUtcDate = (value: number) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));

export default async function HomePage() {
  let projects = [] as Awaited<ReturnType<typeof readProjects>>;
  let projectLoadError = false;

  try {
    projects = await readProjects();
  } catch (error) {
    projectLoadError = true;
    console.error("Failed to load dashboard projects:", error);
  }
  const totalCases = projects.reduce(
    (count, project) => count + (project.testCaseCount ?? project.rows.length),
    0
  );
  const activeSprints = projects.filter((project) => project.sprintName?.trim()).length;
  const assignedProjects = projects.filter((project) => project.teamName?.trim()).length;
  const featuredProjects = projects.slice(0, 3);
  const templateImportCount = projects.reduce(
    (count, project) =>
      count +
      (project.auditTrail ?? []).filter(
        (entry) => entry.action === "Case template pack imported"
      ).length,
    0
  );
  const templateExportCount = projects.reduce(
    (count, project) =>
      count +
      (project.auditTrail ?? []).filter(
        (entry) => entry.action === "Case template pack exported"
      ).length,
    0
  );
  const recentTemplateActivity = projects
    .flatMap((project) =>
      (project.auditTrail ?? [])
        .filter(
          (entry) =>
            entry.action === "Case template pack imported" ||
            entry.action === "Case template pack exported"
        )
        .map((entry) => ({
          ...entry,
          projectName: project.name,
          href: `${projectHref(project.projectKey, project.id)}/workspace?focus=template-library`,
        }))
    )
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 3);
  const prioritizedTemplateAlertCount = projects.reduce(
    (count, project) =>
      count +
      (project.notifications ?? []).filter(
        (notification) =>
          !notification.archivedAt &&
          notification.type === "template-operation" &&
          notification.severityLifted
      ).length,
    0
  );
  const mutedTemplateAlertCount = projects.reduce(
    (count, project) =>
      count +
      (project.auditTrail ?? []).filter(
        (entry) => entry.action === "Template alert suppressed"
      ).length,
    0
  );
  const prioritizedSourceCards = Array.from(
    projects.reduce((accumulator, project) => {
      (project.notifications ?? []).forEach((notification) => {
        if (
          notification.archivedAt ||
          notification.type !== "template-operation" ||
          !notification.severityLifted ||
          !notification.sourceLabel?.trim()
        ) {
          return;
        }

        const source = notification.sourceLabel.trim();
        const current = accumulator.get(source) ?? {
          source,
          count: 0,
          projectHref: `${projectHref(project.projectKey, project.id)}/notifications?type=template-operation&source=${encodeURIComponent(
            source
          )}&unread=1`,
          strongestProjectCount: 0,
        };
        current.count += 1;
        if (current.strongestProjectCount < 1) {
          current.strongestProjectCount = 1;
          current.projectHref = `${projectHref(project.projectKey, project.id)}/notifications?type=template-operation&source=${encodeURIComponent(
            source
          )}&unread=1`;
        }
        accumulator.set(source, current);
      });
      return accumulator;
    }, new Map<string, { source: string; count: number; projectHref: string; strongestProjectCount: number }>())
  )
    .map(([, value]) => value)
    .sort((left, right) => right.count - left.count || left.source.localeCompare(right.source))
    .slice(0, 4);
  const mutedSourceCards = Array.from(
    projects.reduce((accumulator, project) => {
      (project.auditTrail ?? []).forEach((entry) => {
        if (entry.action !== "Template alert suppressed") {
          return;
        }
        const source = entry.detail.match(/from (.+?) was suppressed/i)?.[1]?.trim();
        if (!source) {
          return;
        }
        const current = accumulator.get(source) ?? {
          source,
          count: 0,
          projectHref: `${projectHref(project.projectKey, project.id)}/notifications?type=template-operation&source=${encodeURIComponent(
            source
          )}`,
          strongestProjectCount: 0,
        };
        current.count += 1;
        if (current.strongestProjectCount < 1) {
          current.strongestProjectCount = 1;
          current.projectHref = `${projectHref(project.projectKey, project.id)}/notifications?type=template-operation&source=${encodeURIComponent(
            source
          )}`;
        }
        accumulator.set(source, current);
      });
      return accumulator;
    }, new Map<string, { source: string; count: number; projectHref: string; strongestProjectCount: number }>())
  )
    .map(([, value]) => value)
    .sort((left, right) => right.count - left.count || left.source.localeCompare(right.source))
    .slice(0, 4);
  const strongestPrioritizedSource = prioritizedSourceCards[0] ?? null;
  const strongestMutedSource = mutedSourceCards[0] ?? null;
  const sourceGovernanceTrendPoints = Array.from(
    projects.reduce((accumulator, project) => {
      (project.notifications ?? []).forEach((notification) => {
        if (
          notification.archivedAt ||
          notification.type !== "template-operation" ||
          !notification.severityLifted
        ) {
          return;
        }
        const bucket = formatUtcDate(notification.createdAt);
        const current = accumulator.get(bucket) ?? { prioritized: 0, muted: 0 };
        current.prioritized += 1;
        accumulator.set(bucket, current);
      });
      (project.auditTrail ?? []).forEach((entry) => {
        if (entry.action !== "Template alert suppressed") {
          return;
        }
        const bucket = formatUtcDate(entry.createdAt);
        const current = accumulator.get(bucket) ?? { prioritized: 0, muted: 0 };
        current.muted += 1;
        accumulator.set(bucket, current);
      });
      return accumulator;
    }, new Map<string, { prioritized: number; muted: number }>())
  )
    .map(([label, counts], index) => ({
      key: `dashboard-source-governance-${index}-${label}`,
      label,
      value: counts.prioritized,
      secondaryValue: counts.muted,
    }))
    .sort((left, right) => left.label.localeCompare(right.label))
    .slice(-6);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.1),_transparent_28%),linear-gradient(180deg,_#f8faf9_0%,_#eef3f1_100%)] px-6 py-8 text-zinc-950 dark:bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.08),_transparent_22%),linear-gradient(180deg,_#09090b_0%,_#111827_100%)] dark:text-zinc-50">
      <ResponsiveShell
        mobileTitle="Dashboard"
        mobileSubtitle="App navigation and reviewer context"
        desktopSidebar={<AppSidebar projectCount={projects.length} />}
        mobileSidebar={<AppSidebar projectCount={projects.length} />}
        storageKey="caseforge:drawer:dashboard"
      >
        <div className="flex min-w-0 flex-col gap-8">
          <ActiveReviewerBanner projects={projects} />

          {projectLoadError ? (
            <section className="rounded-[24px] border border-amber-200 bg-amber-50/90 px-5 py-4 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-800 dark:text-amber-200">
                Dashboard Fallback
              </p>
              <h2 className="mt-1 text-lg font-semibold text-amber-950 dark:text-amber-50">
                We could not load saved project data right now.
              </h2>
              <p className="mt-2 text-sm leading-6 text-amber-900/80 dark:text-amber-100/80">
                You can still start with one requirement and generate test cases. Portfolio counts and recent project data will return once the project store connection is available again.
              </p>
            </section>
          ) : null}

          <section className="overflow-hidden rounded-[24px] border border-zinc-200/80 bg-white/96 shadow-[0_26px_58px_-40px_rgba(15,23,42,0.24)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/94">
          <div className="grid gap-8 px-8 py-10 lg:grid-cols-[minmax(0,1.25fr)_360px]">
            <div>
              <p className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                CaseForge Platform
              </p>
              <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
                Turn one requirement into editable test cases in about 10 minutes.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
                Start with a single requirement, generate a useful QA draft fast, then review and refine it inline without setting up the whole system first.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href="/projects/new?focus=requirement"
                  className="rounded-xl bg-[linear-gradient(135deg,_#0f766e_0%,_#14532d_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_-18px_rgba(5,150,105,0.52)] transition hover:brightness-110"
                >
                  Start with One Requirement
                </Link>
                <Link
                  href="/projects"
                  className="rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                >
                  Open Project Library
                </Link>
              </div>
              <p className="mt-3 text-xs leading-6 text-zinc-500 dark:text-zinc-400">
                Fastest path: paste one requirement, generate the draft, tighten weak cases, then export or continue in the cases route.
              </p>
              <p className="mt-2 text-xs leading-6 text-zinc-500 dark:text-zinc-400">
                No project setup is required before the first draft. The workspace can name and save it for you once you generate.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-4 lg:grid-cols-1">
              <div className="rounded-[20px] border border-emerald-200/80 bg-emerald-50/70 px-5 py-4 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                  Quick Start
                </p>
                <ol className="mt-3 space-y-2 text-sm text-emerald-950 dark:text-emerald-50">
                  <li>1. Open a new workspace.</li>
                  <li>2. Paste one requirement.</li>
                  <li>3. Generate, clean up weak cases, and hand off the draft.</li>
                </ol>
              </div>
              <div className="rounded-[20px] border border-zinc-200/80 bg-zinc-50/80 px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                  Saved Projects
                </p>
                <p className="mt-2 text-2xl font-semibold">{projects.length}</p>
              </div>
              <div className="rounded-[20px] border border-zinc-200/80 bg-zinc-50/80 px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                  Managed Cases
                </p>
                <p className="mt-2 text-2xl font-semibold">{totalCases}</p>
              </div>
              <div className="rounded-[20px] border border-zinc-200/80 bg-zinc-50/80 px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                  Sprint Projects
                </p>
                <p className="mt-2 text-2xl font-semibold">{activeSprints}</p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {assignedProjects} with team ownership
                </p>
              </div>
              <div className="rounded-[20px] border border-zinc-200/80 bg-zinc-50/80 px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                  Template Ops
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {templateImportCount}
                  <span className="mx-1 text-zinc-400">/</span>
                  {templateExportCount}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  imports / exports across projects
                </p>
              </div>
              <div className="rounded-[20px] border border-zinc-200/80 bg-zinc-50/80 px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                  Source Governance
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {prioritizedTemplateAlertCount}
                  <span className="mx-1 text-zinc-400">/</span>
                  {mutedTemplateAlertCount}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  prioritized / muted template source alerts
                </p>
              </div>
            </div>
          </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
          <div className="rounded-[24px] border border-zinc-200/80 bg-white/96 p-6 shadow-[0_24px_55px_-38px_rgba(15,23,42,0.22)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/94">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                  Recent Projects
                </p>
                <h2 className="mt-1 text-xl font-semibold">Pick up where you left off</h2>
              </div>
              <Link
                href="/projects"
                className="text-sm font-semibold text-emerald-700 transition hover:text-emerald-600 dark:text-emerald-300"
              >
                Open library
              </Link>
            </div>

            <div className="mt-5 grid gap-4">
              {featuredProjects.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-zinc-200 px-5 py-8 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  No saved projects yet. Start with one requirement first, then save the draft as a project when it is useful.
                </div>
              ) : (
                featuredProjects.map((project) => (
                  <Link
                    key={project.id}
                    href={projectHref(project.projectKey, project.id)}
                    className="rounded-[20px] border border-zinc-200/80 bg-zinc-50/75 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_18px_40px_-28px_rgba(15,23,42,0.22)] dark:border-zinc-800 dark:bg-zinc-950/70 dark:hover:border-zinc-700"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                          {project.name}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          {(project.projectKey || "NO-KEY").trim()} | {(project.sprintName || "No sprint").trim()} |{" "}
                          {(project.releaseName || "No release").trim()}
                        </p>
                      </div>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                        Open
                      </span>
                    </div>

                    <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                      {(project.teamName || "No team").trim()} |{" "}
                      {project.testCaseCount ?? project.rows.length} managed cases
                    </p>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-zinc-200/80 bg-white/96 p-6 shadow-[0_24px_55px_-38px_rgba(15,23,42,0.22)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/94">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
              Start Here
            </p>
            <h2 className="mt-1 text-xl font-semibold">Fastest path to value</h2>
            <div className="mt-5 space-y-3">
              {[
                "Paste one requirement into a new workspace.",
                "Generate the first draft and tighten weak cases inline.",
                "Save or open a project only after the draft is useful.",
                "Use project routes for deeper management once the draft is real.",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-[22px] border border-zinc-200/80 bg-zinc-50/85 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
          </section>

          <details className="group rounded-[24px] border border-zinc-200/80 bg-white/96 p-6 shadow-[0_24px_55px_-38px_rgba(15,23,42,0.22)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/94">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                  Portfolio Signals
                </p>
                <h2 className="mt-1 text-xl font-semibold">Template activity across saved projects</h2>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                  Useful after the first draft. Keep this collapsed until you need portfolio-level template insight.
                </p>
              </div>
              <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 transition group-open:-translate-y-0.5 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                Expand
              </span>
            </summary>
            <div className="mt-5 border-t border-zinc-200/80 pt-5 dark:border-zinc-800">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                  Template Activity
                </p>
                <h2 className="mt-1 text-xl font-semibold">Reusable template movement across the app</h2>
              </div>
              <Link
                href="/projects"
                className="text-sm font-semibold text-emerald-700 transition hover:text-emerald-600 dark:text-emerald-300"
              >
                Open library
              </Link>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/projects?templateAction=imported"
                className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20"
              >
                Imports Only
              </Link>
              <Link
                href="/projects?templateAction=exported"
                className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
              >
                Exports Only
              </Link>
              <Link
                href="/projects?signal=source-governance"
                className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
              >
                Source Governance
              </Link>
              <Link
                href="/projects?signal=source-prioritized"
                className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 transition hover:bg-orange-100 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300 dark:hover:bg-orange-500/20"
              >
                Prioritized Only
              </Link>
              <Link
                href="/projects?signal=source-muted"
                className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
              >
                Muted Only
              </Link>
            </div>

            {recentTemplateActivity.length > 0 ? (
              <div className="mt-5 grid gap-3 lg:grid-cols-3">
                {recentTemplateActivity.map((entry) => (
                  <Link
                    key={entry.id}
                    href={entry.href}
                    className="rounded-[24px] border border-zinc-200/80 bg-zinc-50/85 px-4 py-4 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950/70 dark:hover:border-zinc-700"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {entry.projectName}
                      </p>
                    </div>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                      {entry.action}
                    </p>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                      {entry.detail}
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-5 text-sm text-zinc-500 dark:text-zinc-400">
                No template import or export activity has been recorded yet.
              </p>
            )}
            </div>
          </details>

          {(prioritizedSourceCards.length > 0 || mutedSourceCards.length > 0) ? (
            <details className="group rounded-[24px] border border-zinc-200/80 bg-white/96 p-6 shadow-[0_24px_55px_-38px_rgba(15,23,42,0.22)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/94">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                    Source Governance
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">Top prioritized and muted template sources</h2>
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                    Advanced reviewer-governance signals for saved projects.
                  </p>
                </div>
                <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 transition group-open:-translate-y-0.5 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                  Expand
                </span>
              </summary>
              <div className="mt-5 border-t border-zinc-200/80 pt-5 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                    Source Governance
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">Top prioritized and muted template sources</h2>
                </div>
                <Link
                  href="/projects?signal=source-governance"
                  className="text-sm font-semibold text-emerald-700 transition hover:text-emerald-600 dark:text-emerald-300"
                >
                  Open portfolio view
                </Link>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {strongestPrioritizedSource ? (
                  <Link
                    href={strongestPrioritizedSource.projectHref}
                    className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
                  >
                    Open Strongest Prioritized Project
                  </Link>
                ) : null}
                {strongestMutedSource ? (
                  <Link
                    href={strongestMutedSource.projectHref}
                    className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                  >
                    Open Strongest Muted Project
                  </Link>
                ) : null}
              </div>
              {sourceGovernanceTrendPoints.length > 0 ? (
                <div className="mt-5">
                  <TrendChart
                    title="Dashboard Source Governance Trend"
                    description="A compact read on whether template sources are being prioritized or muted more often across recent activity."
                    points={sourceGovernanceTrendPoints}
                    primaryLabel="Prioritized"
                    secondaryLabel="Muted"
                    primaryColor="#f59e0b"
                    secondaryColor="#f43f5e"
                    valueSuffix=""
                  />
                </div>
              ) : null}
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-[20px] border border-amber-200/70 bg-amber-50/60 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                    Prioritized Sources
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {prioritizedSourceCards.map((entry) => (
                      <Link
                        key={`dashboard-prioritized-source-${entry.source}`}
                        href={entry.projectHref}
                        className="rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-zinc-950/70 dark:text-amber-300 dark:hover:bg-amber-500/20"
                      >
                        {entry.source}: {entry.count}
                      </Link>
                    ))}
                  </div>
                </div>
                <div className="rounded-[20px] border border-rose-200/70 bg-rose-50/60 p-4 dark:border-rose-500/20 dark:bg-rose-500/10">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-700 dark:text-rose-300">
                    Muted Sources
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {mutedSourceCards.map((entry) => (
                      <Link
                        key={`dashboard-muted-source-${entry.source}`}
                        href={entry.projectHref}
                        className="rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-zinc-950/70 dark:text-rose-300 dark:hover:bg-rose-500/20"
                      >
                        {entry.source}: {entry.count}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
              </div>
            </details>
          ) : null}
        </div>
      </ResponsiveShell>
    </main>
  );
}
