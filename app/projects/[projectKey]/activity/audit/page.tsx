import { redirect } from "next/navigation";

type ProjectActivityAuditPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectActivityAuditPage({
  params,
}: ProjectActivityAuditPageProps) {
  const { projectKey } = await params;

  redirect(`/projects/${encodeURIComponent(projectKey)}/activity?view=audit`);
}
