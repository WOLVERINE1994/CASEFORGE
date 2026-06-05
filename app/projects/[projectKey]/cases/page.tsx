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
      <ProjectWorkspace
        initialProjectRef={projectKey}
        initialSection="cases"
        embedded
        focusedRowId={resolvedSearchParams?.rowId ?? null}
      />
    </div>
  );
}
