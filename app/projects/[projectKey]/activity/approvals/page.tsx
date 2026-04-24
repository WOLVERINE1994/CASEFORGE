import { redirect } from "next/navigation";

type ProjectActivityApprovalsPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectActivityApprovalsPage({
  params,
}: ProjectActivityApprovalsPageProps) {
  const { projectKey } = await params;

  redirect(`/projects/${encodeURIComponent(projectKey)}/activity?view=approvals`);
}
