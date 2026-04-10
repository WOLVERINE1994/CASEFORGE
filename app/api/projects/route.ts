import type { Project } from "../../../utils/workspace";
import { readProjects, writeProjects } from "../../../utils/project-store";

export async function GET() {
  try {
    const projects = await readProjects();
    return Response.json({ projects });
  } catch (error) {
    console.error("PROJECTS GET ERROR:", error);
    return Response.json(
      { error: "Failed to load projects." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const startedAt = Date.now();

  try {
    const body = await req.json();
    const projects = Array.isArray(body?.projects)
      ? (body.projects as Project[])
      : null;

    if (!projects) {
      return Response.json(
        { error: "Projects payload is missing." },
        { status: 400 }
      );
    }

    if (process.env.NODE_ENV !== "production") {
      const activeProject = projects[projects.length - 1] ?? null;
      console.info("PROJECTS POST START", {
        projectCount: projects.length,
        activeProjectId: activeProject?.id ?? null,
        activeProjectName: activeProject?.name ?? null,
        durationMs: Date.now() - startedAt,
      });
    }

    const savedProjects = await writeProjects(projects);

    if (process.env.NODE_ENV !== "production") {
      const activeProject = savedProjects[savedProjects.length - 1] ?? null;
      console.info("PROJECTS POST SUCCESS", {
        projectCount: savedProjects.length,
        activeProjectId: activeProject?.id ?? null,
        activeProjectName: activeProject?.name ?? null,
        durationMs: Date.now() - startedAt,
      });
    }

    return Response.json({ projects: savedProjects });
  } catch (error) {
    console.error("PROJECTS POST ERROR:", {
      durationMs: Date.now() - startedAt,
      error,
    });
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : "Failed to save projects.";
    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
}
