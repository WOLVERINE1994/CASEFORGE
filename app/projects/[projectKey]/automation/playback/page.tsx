import { redirect } from "next/navigation";

export default async function ProjectAutomationPlaybackPage({
  params,
}: {
  params: Promise<{ projectKey: string }>;
}) {
  const { projectKey } = await params;
  redirect(`/projects/${encodeURIComponent(projectKey)}/automation/runs`);
}
