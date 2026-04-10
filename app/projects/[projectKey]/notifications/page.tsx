import ProjectNotificationsClient from "../../../../components/ProjectNotificationsClient";

type ProjectNotificationsPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectNotificationsPage({
  params,
}: ProjectNotificationsPageProps) {
  const { projectKey } = await params;

  return <ProjectNotificationsClient projectKey={projectKey} />;
}
