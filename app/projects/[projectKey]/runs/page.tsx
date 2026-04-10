import ProjectRunsClient from "../../../../components/ProjectRunsClient";
import { readProjectByRef } from "../../../../utils/project-store";

type ProjectRunsPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectRunsPage({
  params,
}: ProjectRunsPageProps) {
  const { projectKey } = await params;
  const project = await readProjectByRef(projectKey);

  return <ProjectRunsClient projectKey={projectKey} initialProject={project} />;
}
