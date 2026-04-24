import { redirect } from "next/navigation";

type ProjectCasesTemplatesPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectCasesTemplatesPage({
  params,
}: ProjectCasesTemplatesPageProps) {
  const { projectKey } = await params;

  redirect(
    `/projects/${encodeURIComponent(projectKey)}/cases?focus=template-library`
  );
}
