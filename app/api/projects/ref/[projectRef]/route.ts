import { readAutomationProjectByRef } from "../../../../../utils/project-store";

type RouteContext = {
  params: Promise<{
    projectRef: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  try {
    const { projectRef } = await context.params;
    const project = await readAutomationProjectByRef(projectRef);

    if (!project) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }

    return Response.json({ project });
  } catch (error) {
    console.error("PROJECT REF GET ERROR:", error);
    return Response.json(
      { error: "Failed to load project details." },
      { status: 500 }
    );
  }
}
