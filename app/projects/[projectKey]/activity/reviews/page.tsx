import { redirect } from "next/navigation";

type ProjectActivityReviewsPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectActivityReviewsPage({
  params,
}: ProjectActivityReviewsPageProps) {
  const { projectKey } = await params;

  redirect(`/projects/${encodeURIComponent(projectKey)}/activity?view=reviews`);
}
