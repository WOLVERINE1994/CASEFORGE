import { redirect } from "next/navigation";

export default async function ProjectAutomationScriptsPage({
  params,
}: {
  params: Promise<{ projectKey: string }>;
}) {
  const { projectKey } = await params;
  redirect(`/projects/${encodeURIComponent(projectKey)}/automation/scenarios`);
}
