import { redirect } from "next/navigation";

type ProjectSettingsNotificationsPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectSettingsNotificationsPage({
  params,
}: ProjectSettingsNotificationsPageProps) {
  const { projectKey } = await params;

  redirect(`/projects/${encodeURIComponent(projectKey)}/notifications`);
}
