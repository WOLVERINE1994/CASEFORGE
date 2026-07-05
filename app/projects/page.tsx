import Link from "next/link";
import { redirect } from "next/navigation";
import AppSidebar from "../../components/AppSidebar";
import DeleteProjectButton from "../../components/DeleteProjectButton";
import ResponsiveShell from "../../components/ResponsiveShell";
import { readProjects } from "../../utils/project-store";

export const dynamic = "force-dynamic";

const projectRouteKey = (project: { id: string; projectKey?: string }) =>
  encodeURIComponent(project.projectKey?.trim() || project.id);

type ProjectsPageProps = {
  searchParams?: Promise<{
    open?: string;
  }>;
};

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  let projects: Awaited<ReturnType<typeof readProjects>> = [];
  let projectLoadError = false;
  const params = await searchParams;

  try {
    projects = await readProjects();
  } catch (error) {
    projectLoadError = true;
    console.error("Failed to load projects:", error);
  }

  if (!projectLoadError && params?.open === "workspace") {
    const activeProject = projects[projects.length - 1];
    if (activeProject) {
      redirect(`/projects/${projectRouteKey(activeProject)}/workspace`);
    }
    redirect("/projects/new?focus=requirement");
  }

  return (
    <ResponsiveShell
      mobileTitle="CaseForge"
      mobileSubtitle="AI generation and automation"
      storageKey="caseforge:drawer:projects"
      desktopSidebar={<AppSidebar projectCount={projects.length} />}
      mobileSidebar={<AppSidebar projectCount={projects.length} />}
    >
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-[28px] border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                Focused Workspace
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                AI test case generation and automation
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                Create project workspaces, generate QA coverage with AI, then build and run browser automation.
              </p>
            </div>
            <Link
              href="/projects/new"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              New Workspace
            </Link>
          </div>
        </section>

        {projectLoadError ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
            Project data is unavailable right now. Try again after the database connection is restored.
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2">
          {projects.map((project) => {
            const routeKey = projectRouteKey(project);
            const generatedCount = project.rows?.length ?? 0;
            const scenarioCount = project.automationScenarios?.length ?? 0;

            return (
              <article
                key={project.id}
                className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex min-w-0 flex-col gap-3">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                        {project.projectKey?.trim() || "Project"}
                      </p>
                      <h2 className="mt-1 break-words text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                        {project.name || "Untitled workspace"}
                      </h2>
                    </div>
                    <DeleteProjectButton
                      projectId={project.id}
                      projectName={project.name || "Untitled workspace"}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                    <span className="rounded-full border border-zinc-200 px-2.5 py-1 dark:border-zinc-800">
                      {generatedCount} generated cases
                    </span>
                    <span className="rounded-full border border-zinc-200 px-2.5 py-1 dark:border-zinc-800">
                      {scenarioCount} automation scenarios
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link
                      href={`/projects/${routeKey}/workspace`}
                      className="inline-flex min-h-10 items-center justify-center rounded-xl !bg-emerald-700 px-3 text-sm font-semibold !text-white transition hover:!bg-emerald-800"
                    >
                      AI Generate
                    </Link>
                    <Link
                      href={`/projects/${routeKey}/automation`}
                      className="inline-flex min-h-10 items-center justify-center rounded-xl border !border-slate-950 !bg-white px-3 text-sm font-semibold !text-slate-950 transition hover:!bg-slate-950 hover:!text-white dark:!border-slate-100 dark:!bg-slate-950 dark:!text-white dark:hover:!bg-slate-100 dark:hover:!text-slate-950"
                    >
                      Automation
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        {!projects.length && !projectLoadError ? (
          <section className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-950">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              No workspaces yet
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Start with a requirement, generate test cases, then move into automation.
            </p>
            <Link
              href="/projects/new"
              className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white dark:bg-zinc-50 dark:text-zinc-950"
            >
              Create Workspace
            </Link>
          </section>
        ) : null}
      </main>
    </ResponsiveShell>
  );
}
