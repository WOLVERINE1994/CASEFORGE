import Link from "next/link";
import ActiveReviewerBanner from "../../components/ActiveReviewerBanner";
import AppSidebar from "../../components/AppSidebar";
import ResponsiveShell from "../../components/ResponsiveShell";
import { readProjects } from "../../utils/project-store";
import { buildAutomationCandidateInsights } from "../../utils/test-case-management";
import type { Project } from "../../utils/workspace";

export const dynamic = "force-dynamic";

const projectHref = (projectKey: string | undefined, projectId: string) =>
  `/projects/${encodeURIComponent(projectKey?.trim() || projectId)}`;

const formatCount = (value: number) => new Intl.NumberFormat("en-US").format(value);

type AutomationProjectSummary = {
  id: string;
  name: string;
  href: string;
  caseCount: number;
  automatedCount: number;
  candidateCount: number;
  strongCandidateCount: number;
  scenarioCount: number;
  runCount: number;
  failedRunCount: number;
  updatedAt: number;
};

const summarizeProject = (project: Project): AutomationProjectSummary => {
  const insights = buildAutomationCandidateInsights(project.rows);
  const href = projectHref(project.projectKey, project.id);
  const automatedCount = project.rows.filter(
    (row) => (row.automationStatus ?? "manual") === "automated"
  ).length;
  const candidateCount = project.rows.filter(
    (row) => (row.automationStatus ?? "manual") === "candidate"
  ).length;
  const failedRunCount = (project.automationExecutions ?? []).filter(
    (execution) => execution.status === "failed"
  ).length;
  const updatedAt =
    project.auditTrail.reduce(
      (latest, entry) => Math.max(latest, entry.createdAt),
      0
    ) || Date.now();

  return {
    id: project.id,
    name: project.name.trim() || "Untitled project",
    href,
    caseCount: project.testCaseCount ?? project.rows.length,
    automatedCount,
    candidateCount,
    strongCandidateCount: insights.filter((entry) => entry.isStrongCandidate).length,
    scenarioCount: project.automationScenarios?.length ?? 0,
    runCount: project.automationExecutions?.length ?? 0,
    failedRunCount,
    updatedAt,
  };
};

export default async function AutomationHubPage() {
  let projects: Project[] = [];
  let projectLoadError = false;

  try {
    projects = await readProjects();
  } catch (error) {
    projectLoadError = true;
    console.error("Failed to load automation hub projects:", error);
  }

  const summaries = projects
    .map(summarizeProject)
    .sort(
      (left, right) =>
        right.strongCandidateCount - left.strongCandidateCount ||
        right.updatedAt - left.updatedAt ||
        left.name.localeCompare(right.name)
    );
  const totals = summaries.reduce(
    (current, summary) => ({
      cases: current.cases + summary.caseCount,
      automated: current.automated + summary.automatedCount,
      candidates: current.candidates + summary.candidateCount,
      strongCandidates: current.strongCandidates + summary.strongCandidateCount,
      scenarios: current.scenarios + summary.scenarioCount,
      runs: current.runs + summary.runCount,
      failedRuns: current.failedRuns + summary.failedRunCount,
    }),
    {
      cases: 0,
      automated: 0,
      candidates: 0,
      strongCandidates: 0,
      scenarios: 0,
      runs: 0,
      failedRuns: 0,
    }
  );
  const automationCoverage =
    totals.cases === 0 ? 0 : Math.round((totals.automated / totals.cases) * 100);
  const topProjects = summaries.slice(0, 6);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.1),_transparent_30%),linear-gradient(180deg,_#f8fafc_0%,_#eef4f8_100%)] px-6 py-8 text-zinc-950 dark:bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.08),_transparent_24%),linear-gradient(180deg,_#09090b_0%,_#111827_100%)] dark:text-zinc-50">
      <ResponsiveShell
        mobileTitle="Automation"
        mobileSubtitle="Portfolio automation hub"
        desktopSidebar={<AppSidebar projectCount={projects.length} />}
        mobileSidebar={<AppSidebar projectCount={projects.length} />}
        storageKey="caseforge:drawer:automation"
      >
        <div className="flex min-w-0 flex-col gap-7">
          <ActiveReviewerBanner compact projects={projects} />

          {projectLoadError ? (
            <section className="rounded-[24px] border border-amber-200 bg-amber-50/90 px-5 py-4 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-800 dark:text-amber-200">
                Automation Fallback
              </p>
              <h2 className="mt-1 text-lg font-semibold text-amber-950 dark:text-amber-50">
                Project automation data is unavailable right now.
              </h2>
              <p className="mt-2 text-sm leading-6 text-amber-900/80 dark:text-amber-100/80">
                The hub will show portfolio automation readiness once the project store connection returns.
              </p>
            </section>
          ) : null}

          <section className="overflow-hidden rounded-[24px] border border-zinc-200/80 bg-white/96 shadow-[0_26px_58px_-40px_rgba(15,23,42,0.24)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/94">
            <div className="grid gap-7 px-8 py-9 lg:grid-cols-[minmax(0,1.2fr)_360px]">
              <div>
                <p className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                  Automation Hub
                </p>
                <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
                  Plan and monitor automation before opening a project.
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
                  Review automation candidates, active scenarios, and run health across the portfolio, then jump into the project workspace that needs attention.
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Link
                    href="/projects"
                    className="rounded-xl bg-[linear-gradient(135deg,_#0369a1_0%,_#1d4ed8_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_-18px_rgba(37,99,235,0.52)] transition hover:brightness-110"
                  >
                    Choose Project
                  </Link>
                  <Link
                    href="/projects/new?focus=requirement"
                    className="rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                  >
                    New Workspace
                  </Link>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {[
                  ["Automation Coverage", `${automationCoverage}%`, `${formatCount(totals.automated)} automated of ${formatCount(totals.cases)} cases`],
                  ["Strong Candidates", formatCount(totals.strongCandidates), `${formatCount(totals.candidates)} marked candidates`],
                  ["Scenarios", formatCount(totals.scenarios), `${formatCount(totals.runs)} recorded automation runs`],
                  ["Failed Runs", formatCount(totals.failedRuns), "Needs project-level triage"],
                ].map(([label, value, detail]) => (
                  <div
                    key={label}
                    className="rounded-[18px] border border-zinc-200/80 bg-zinc-50/80 px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                      {label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold">{value}</p>
                    <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                      {detail}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-[24px] border border-zinc-200/80 bg-white/96 p-6 shadow-[0_24px_54px_-42px_rgba(15,23,42,0.28)] dark:border-zinc-800 dark:bg-zinc-900/94">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">
                  Project Automation
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                  Automation entry points
                </h2>
              </div>
              <Link
                href="/projects"
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              >
                View Library
              </Link>
            </div>

            {topProjects.length > 0 ? (
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {topProjects.map((project) => (
                  <Link
                    key={project.id}
                    href={`${project.href}/automation`}
                    className="group rounded-[18px] border border-zinc-200 bg-zinc-50/80 p-4 transition hover:border-sky-200 hover:bg-sky-50/80 dark:border-zinc-800 dark:bg-zinc-950/65 dark:hover:border-sky-500/30 dark:hover:bg-sky-500/10"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold text-zinc-950 group-hover:text-sky-800 dark:text-zinc-50 dark:group-hover:text-sky-100">
                          {project.name}
                        </h3>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          {formatCount(project.caseCount)} cases | {formatCount(project.scenarioCount)} scenarios | {formatCount(project.runCount)} runs
                        </p>
                      </div>
                      <span className="rounded-full border border-sky-200 bg-white px-2.5 py-1 text-xs font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-zinc-950 dark:text-sky-200">
                        Open
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                      <span className="rounded-xl border border-zinc-200 bg-white px-3 py-2 font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                        {formatCount(project.strongCandidateCount)} strong
                      </span>
                      <span className="rounded-xl border border-zinc-200 bg-white px-3 py-2 font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                        {formatCount(project.automatedCount)} automated
                      </span>
                      <span className="rounded-xl border border-zinc-200 bg-white px-3 py-2 font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                        {formatCount(project.failedRunCount)} failed
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-[20px] border border-dashed border-zinc-300 bg-zinc-50/80 px-5 py-8 text-sm leading-6 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-300">
                No saved projects yet. Automation is available from the app navigation now; create or save a workspace when you are ready to author scenarios and runs.
              </div>
            )}
          </section>
        </div>
      </ResponsiveShell>
    </main>
  );
}
