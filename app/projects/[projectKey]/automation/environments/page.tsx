import { redirect } from "next/navigation";

export default async function ProjectAutomationEnvironmentsPage({
  params,
}: {
  params: Promise<{ projectKey: string }>;
}) {
  const { projectKey } = await params;
  redirect(`/projects/${encodeURIComponent(projectKey)}/automation/suites`);
}
