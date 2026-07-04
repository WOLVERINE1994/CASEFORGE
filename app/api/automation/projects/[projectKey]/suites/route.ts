import {
  createSuite,
  listSuites,
  resolveAutomationProjectId,
} from "../../../../../../utils/automation/store";

type RouteContext = {
  params: Promise<{ projectKey: string }>;
};

const isValidStatus = (value: unknown) =>
  value === "draft" ||
  value === "active" ||
  value === "paused" ||
  value === "completed" ||
  value === "archived";

const stringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];

function suiteApiError(error: unknown, fallback: string) {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "ECONNREFUSED"
  ) {
    return "Database connection failed. Check DATABASE_URL/DIRECT_URL and make sure the database is reachable before managing suites.";
  }
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export async function GET(_: Request, context: RouteContext) {
  try {
    const { projectKey } = await context.params;
    const projectId = await resolveAutomationProjectId(projectKey);
    if (!projectId) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }

    return Response.json({ suites: await listSuites(projectId) });
  } catch (error) {
    console.error("AUTOMATION SUITES GET ERROR:", error);
    return Response.json(
      { error: suiteApiError(error, "Could not load suites.") },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectKey } = await context.params;
    const projectId = await resolveAutomationProjectId(projectKey);
    if (!projectId) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return Response.json({ error: "Suite name is required." }, { status: 400 });
    }

    const suite = await createSuite({
      description: typeof body.description === "string" ? body.description : "",
      metadata:
        body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? body.metadata
          : undefined,
      name,
      projectId,
      scenarioIds: stringArray(body.scenarioIds),
      status: isValidStatus(body.status) ? body.status : "draft",
      tags: stringArray(body.tags),
    });

    return Response.json({ suite }, { status: 201 });
  } catch (error) {
    console.error("AUTOMATION SUITES POST ERROR:", error);
    return Response.json(
      { error: suiteApiError(error, "Could not create suite.") },
      { status: 500 },
    );
  }
}
