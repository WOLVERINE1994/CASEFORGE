import ProjectWorkspace from "../../../../components/ProjectWorkspace";

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
    <ProjectWorkspace
      initialProjectRef={projectKey}
      initialSection="workspace"
      embedded
    />
  );
}
