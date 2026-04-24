import { redirect } from "next/navigation";

type ProjectActivityChangesPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectActivityChangesPage({
  params,
}: ProjectActivityChangesPageProps) {
  const { projectKey } = await params;

  redirect(`/projects/${encodeURIComponent(projectKey)}/activity?view=changes`);
}
