import { redirect } from "next/navigation";

type ProjectCasesReviewPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectCasesReviewPage({
  params,
}: ProjectCasesReviewPageProps) {
  const { projectKey } = await params;

  redirect(`/projects/${encodeURIComponent(projectKey)}/cases?review=in-review`);
}
