import {
  refreshAutomationSession,
  stopAutomationSession,
} from "../../../../../utils/automation/orchestration";
import { toAutomationSessionMetadata } from "../../../../../utils/automation/session-metadata";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  const session = await refreshAutomationSession(sessionId);
  if (!session) {
    return Response.json({ error: "Session not found." }, { status: 404 });
  }

  return Response.json({ session, sessionMetadata: toAutomationSessionMetadata(session) });
}

export async function DELETE(_: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  const session = await stopAutomationSession(sessionId);
  if (!session) {
    return Response.json({ error: "Session not found." }, { status: 404 });
  }

  return Response.json({ session, sessionMetadata: toAutomationSessionMetadata(session) });
}
