import ProjectIssuesClient from "../../../../components/ProjectIssuesClient";

type ProjectIssuesPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectIssuesPage({
  params,
}: ProjectIssuesPageProps) {
  const { projectKey } = await params;

  return <ProjectIssuesClient projectKey={projectKey} embedded />;
}
