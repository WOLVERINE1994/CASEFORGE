import ProjectWorkspace from "../../../../components/ProjectWorkspace";
import ProjectModuleSubnav from "../../../../components/ProjectModuleSubnav";

type ProjectWorkspacePageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectWorkspacePage({
  params,
}: ProjectWorkspacePageProps) {
  const { projectKey } = await params;

  return (
    <div className="flex flex-col gap-6">
      <ProjectModuleSubnav
        label="AI Case Generation"
        items={[
          { href: `/projects/${encodeURIComponent(projectKey)}/workspace`, label: "Generator" },
          { href: `/projects/${encodeURIComponent(projectKey)}/cases`, label: "Test Management" },
          { href: `/projects/${encodeURIComponent(projectKey)}/automation`, label: "Automation" },
        ]}
      />
      <section className="rounded-[22px] border border-emerald-200/80 bg-emerald-50/80 px-4 py-4 text-sm text-emerald-900 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-200">
          Product Split
        </p>
        <p className="mt-2 leading-6">
          This area is now focused on AI-assisted case generation and refinement. Manual case
          governance lives in <span className="font-semibold">Test Management</span>, and
          recording or running automation lives in <span className="font-semibold">Automation</span>.
        </p>
      </section>
      <ProjectWorkspace
        initialProjectRef={projectKey}
        initialSection="workspace"
        embedded
      />
    </div>
  );
}
