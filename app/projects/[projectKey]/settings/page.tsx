import ProjectIntegrationSettingsClient from "../../../../components/ProjectIntegrationSettingsClient";
import ProjectModuleSubnav from "../../../../components/ProjectModuleSubnav";
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
    <div className="flex flex-col gap-6">
      <ProjectModuleSubnav
        label="Settings Module"
        items={[
          { href: `/projects/${encodeURIComponent(projectKey)}/settings`, label: "Project" },
          {
            href: `/projects/${encodeURIComponent(projectKey)}/settings/integrations`,
            label: "Integrations",
          },
          { href: `/projects/${encodeURIComponent(projectKey)}/settings/team`, label: "Team" },
          {
            href: `/projects/${encodeURIComponent(projectKey)}/settings/notifications`,
            label: "Notifications",
          },
          { href: `/projects/${encodeURIComponent(projectKey)}/settings/admin`, label: "Admin" },
        ]}
      />
      <ProjectIntegrationSettingsClient
        projectKey={project?.projectKey?.trim() || projectKey}
        projectName={project?.name || "Unsaved workspace"}
      />
    </div>
  );
}
