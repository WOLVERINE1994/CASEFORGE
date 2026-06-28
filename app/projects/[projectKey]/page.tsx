import { redirect } from "next/navigation";

type ProjectOverviewRedirectProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectOverviewRedirect({
  params,
}: ProjectOverviewRedirectProps) {
  const { projectKey } = await params;
  redirect(`/projects/${encodeURIComponent(projectKey)}/workspace`);
}
