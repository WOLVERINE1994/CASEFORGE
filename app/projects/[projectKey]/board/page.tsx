import ProjectBoardClient from "../../../../components/ProjectBoardClient";

type ProjectBoardPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectBoardPage({
  params,
}: ProjectBoardPageProps) {
  const { projectKey } = await params;

  return <ProjectBoardClient projectKey={projectKey} embedded />;
}
