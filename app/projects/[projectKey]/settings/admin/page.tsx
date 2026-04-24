import { redirect } from "next/navigation";

type ProjectSettingsAdminPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectSettingsAdminPage({
  params,
}: ProjectSettingsAdminPageProps) {
  await params;
  redirect("/settings/admin");
}
