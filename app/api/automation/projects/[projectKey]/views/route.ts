import {
  createView,
  listViews,
  resolveAutomationProjectId,
} from "../../../../../../utils/automation/store";

type RouteContext = {
  params: Promise<{ projectKey: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { projectKey } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const scenarioId = searchParams.get("scenarioId");
  const views = await listViews(projectId, scenarioId);
  return Response.json({ latestView: views[0] ?? null, views });
}

export async function POST(request: Request, context: RouteContext) {
  const { projectKey } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const view = await createView({
    accessibilityTree:
      body.accessibilityTree && typeof body.accessibilityTree === "object"
        ? body.accessibilityTree
        : {},
    actionId: typeof body.actionId === "string" ? body.actionId : null,
    domSnapshot:
      body.domSnapshot && typeof body.domSnapshot === "object" ? body.domSnapshot : {},
    elementSnapshots: Array.isArray(body.elementSnapshots) ? body.elementSnapshots : [],
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    name: typeof body.name === "string" ? body.name : "",
    projectId,
    scenarioId: typeof body.scenarioId === "string" ? body.scenarioId : null,
    screenshotArtifactId:
      typeof body.screenshotArtifactId === "string" ? body.screenshotArtifactId : null,
    screenshotUri: typeof body.screenshotUri === "string" ? body.screenshotUri : "",
    title: typeof body.title === "string" ? body.title : "",
    url: typeof body.url === "string" ? body.url : "",
    viewport: body.viewport && typeof body.viewport === "object" ? body.viewport : {},
  });
  return Response.json({ view }, { status: 201 });
}
