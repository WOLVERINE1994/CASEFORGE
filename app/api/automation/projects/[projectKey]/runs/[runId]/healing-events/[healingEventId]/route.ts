import {
  acceptRunHealingLocator,
  resolveAutomationProjectId,
  reviewRunHealingEvent,
} from "../../../../../../../../../utils/automation/store";

type RouteContext = {
  params: Promise<{ projectKey: string; runId: string; healingEventId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { projectKey, runId, healingEventId } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "";
  const run =
    action === "accept"
      ? await acceptRunHealingLocator(projectId, runId, healingEventId)
      : await reviewRunHealingEvent(
          projectId,
          runId,
          healingEventId,
          action === "discard" ? "discarded" : "not_reviewed",
        );
  if (!run) {
    return Response.json({ error: "Healing event not found." }, { status: 404 });
  }
  return Response.json({
    healingEvents: Array.isArray(run.summary.healingEvents) ? run.summary.healingEvents : [],
    run,
  });
}
