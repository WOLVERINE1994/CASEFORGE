import { readProjectById } from "../../../../utils/project-store";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const project = await readProjectById(id);

    if (!project) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }

    return Response.json({ project });
  } catch (error) {
    console.error("PROJECT DETAIL GET ERROR:", error);
    return Response.json(
      { error: "Failed to load project details." },
      { status: 500 }
    );
  }
}
