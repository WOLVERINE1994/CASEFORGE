import { redirect } from "next/navigation";

type ProjectRunsFailuresPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectRunsFailuresPage({
  params,
}: ProjectRunsFailuresPageProps) {
  const { projectKey } = await params;

  redirect(`/projects/${encodeURIComponent(projectKey)}/runs?execution=failed`);
}
