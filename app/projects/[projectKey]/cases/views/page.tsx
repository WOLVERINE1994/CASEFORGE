import { redirect } from "next/navigation";

type ProjectCasesViewsPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectCasesViewsPage({
  params,
}: ProjectCasesViewsPageProps) {
  const { projectKey } = await params;

  redirect(`/projects/${encodeURIComponent(projectKey)}/cases?focus=saved-views`);
}
