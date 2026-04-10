import ProjectIntegrationSettingsClient from "../../../../components/ProjectIntegrationSettingsClient";
import { readProjectByRef } from "../../../../utils/project-store";

type ProjectSettingsPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectSettingsPage({
  params,
}: ProjectSettingsPageProps) {
  const { projectKey } = await params;
  const project = await readProjectByRef(projectKey);

  return (
    <ProjectIntegrationSettingsClient
      projectKey={project?.projectKey?.trim() || projectKey}
      projectName={project?.name || "Unsaved workspace"}
    />
  );
}
