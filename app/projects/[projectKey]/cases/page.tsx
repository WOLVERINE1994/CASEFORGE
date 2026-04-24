import ProjectWorkspace from "../../../../components/ProjectWorkspace";
import ProjectModuleSubnav from "../../../../components/ProjectModuleSubnav";

type ProjectCasesPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
  searchParams?: Promise<{
    rowId?: string;
  }>;
};

export default async function ProjectCasesPage({
  params,
  searchParams,
}: ProjectCasesPageProps) {
  const { projectKey } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  return (
    <div className="flex flex-col gap-6">
      <ProjectModuleSubnav
        label="Test Management"
        items={[
          { href: `/projects/${encodeURIComponent(projectKey)}/cases`, label: "All Cases" },
          { href: `/projects/${encodeURIComponent(projectKey)}/cases/review`, label: "Review Queue" },
          { href: `/projects/${encodeURIComponent(projectKey)}/cases/drafts`, label: "Drafts" },
          { href: `/projects/${encodeURIComponent(projectKey)}/cases/templates`, label: "Templates" },
          { href: `/projects/${encodeURIComponent(projectKey)}/cases/views`, label: "Saved Views" },
        ]}
      />
      <section className="rounded-[22px] border border-sky-200/80 bg-sky-50/80 px-4 py-4 text-sm text-sky-900 shadow-sm dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-200">
          Product Split
        </p>
        <p className="mt-2 leading-6">
          This area is now focused on manual test management. Automation authoring, recording,
          playback, schedules, and replay now live in the dedicated <span className="font-semibold">Automation</span> workspace.
        </p>
      </section>
      <ProjectWorkspace
        initialProjectRef={projectKey}
        initialSection="cases"
        embedded
        focusedRowId={resolvedSearchParams?.rowId ?? null}
      />
    </div>
  );
}
