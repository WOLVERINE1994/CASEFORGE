import { redirect } from "next/navigation";

type ProjectSettingsTeamPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectSettingsTeamPage({
  params,
}: ProjectSettingsTeamPageProps) {
  await params;
  redirect("/settings/users");
}
