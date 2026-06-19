import {
  refreshAutomationSession,
  stopAutomationSession,
} from "../../../../../utils/automation/orchestration";
import { toAutomationSessionMetadata } from "../../../../../utils/automation/session-metadata";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  try {
    const { sessionId } = await context.params;
    const session = await refreshAutomationSession(sessionId);
    if (!session) {
      return Response.json({ error: "Session not found." }, { status: 404 });
    }

    return Response.json({ session, sessionMetadata: toAutomationSessionMetadata(session) });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not refresh automation session.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const { sessionId } = await context.params;
    const session = await stopAutomationSession(sessionId);
    if (!session) {
      return Response.json({ error: "Session not found." }, { status: 404 });
    }

    return Response.json({ session, sessionMetadata: toAutomationSessionMetadata(session) });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not stop automation session.",
      },
      { status: 500 },
    );
  }
}
