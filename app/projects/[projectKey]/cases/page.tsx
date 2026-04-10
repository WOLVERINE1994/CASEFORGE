import ProjectWorkspace from "../../../../components/ProjectWorkspace";

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
    <ProjectWorkspace
      initialProjectRef={projectKey}
      initialSection="cases"
      embedded
      focusedRowId={resolvedSearchParams?.rowId ?? null}
    />
  );
}
