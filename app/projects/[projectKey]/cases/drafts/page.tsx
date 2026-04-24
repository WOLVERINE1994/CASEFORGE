import { redirect } from "next/navigation";

type ProjectCasesDraftsPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectCasesDraftsPage({
  params,
}: ProjectCasesDraftsPageProps) {
  const { projectKey } = await params;

  redirect(`/projects/${encodeURIComponent(projectKey)}/cases?review=draft`);
}
