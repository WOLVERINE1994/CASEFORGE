import { runAutomationSessionSteps } from "../../../../../../utils/automation/orchestration";
import { getSessionRecord } from "../../../../../../utils/automation/store";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  const session = await getSessionRecord(sessionId);
  if (!session) {
    return Response.json({ error: "Session not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const steps = Array.isArray(body.steps) ? body.steps : [];
  if (!steps.length) {
    return Response.json({ error: "Run requires at least one command." }, { status: 400 });
  }

  let result;
  try {
    result = await runAutomationSessionSteps(sessionId, {
      actionId: typeof body.actionId === "string" ? body.actionId : null,
      closeOnComplete: body.closeOnComplete === true,
      executionMode:
        body.executionMode === "ephemeral_ci" ? "ephemeral_ci" : "interactive_persistent",
      keepSessionOpen: body.keepSessionOpen === true,
      runId: typeof body.runId === "string" ? body.runId : null,
      steps,
      suppressRecording: body.suppressRecording === true,
    });
  } catch (error) {
    const code = (error as Error & { code?: string }).code || (error instanceof Error ? error.message : "");
    if (code === "SESSION_BUSY") {
      return Response.json(
        {
          code: "SESSION_BUSY",
          error: "This browser session is already running an action.",
        },
        { status: 409 },
      );
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not start run." },
      { status: 500 },
    );
  }
  if (!result) {
    return Response.json({ error: "Session is not runnable." }, { status: 409 });
  }

  return Response.json({ result }, { status: 202 });
}
