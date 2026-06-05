import {
  appendRunHealingEvents,
  getRun,
  resolveAutomationProjectId,
} from "../../../../../../../../utils/automation/store";

type RouteContext = {
  params: Promise<{ projectKey: string; runId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { projectKey, runId } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }
  const run = await getRun(projectId, runId);
  if (!run) {
    return Response.json({ error: "Run not found." }, { status: 404 });
  }
  const healingEvents = Array.isArray(run.summary.healingEvents)
    ? run.summary.healingEvents
    : [];
  return Response.json({ healingEvents });
}

export async function POST(request: Request, context: RouteContext) {
  const { projectKey, runId } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  const events = Array.isArray(body.events) ? body.events : [];
  const run = await appendRunHealingEvents(projectId, runId, events);
  if (!run) {
    return Response.json({ error: "Run not found." }, { status: 404 });
  }
  return Response.json({
    healingEvents: Array.isArray(run.summary.healingEvents) ? run.summary.healingEvents : [],
    run,
  });
}
