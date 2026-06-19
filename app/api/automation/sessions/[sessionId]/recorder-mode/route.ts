import { setAutomationSessionRecorderMode } from "../../../../../../utils/automation/orchestration";
import { toAutomationSessionMetadata } from "../../../../../../utils/automation/session-metadata";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { sessionId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const mode = body.mode === "verify" ? "verify" : body.mode === "off" ? "off" : "record";
    const session = await setAutomationSessionRecorderMode(sessionId, mode);
    if (!session) {
      return Response.json({ error: "Session not found." }, { status: 404 });
    }
    return Response.json({
      session,
      sessionMetadata: toAutomationSessionMetadata(session),
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not update recorder mode.",
      },
      { status: 500 },
    );
  }
}
