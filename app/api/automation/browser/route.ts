import {
  refreshAutomationSession,
  requestAutomationSession,
  stopAutomationSession,
} from "../../../../utils/automation/orchestration";
import { toAutomationSessionMetadata } from "../../../../utils/automation/session-metadata";
import { resolveAutomationProjectId } from "../../../../utils/automation/store";

export const runtime = "nodejs";

function automationSessionErrorResponse(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Could not start browser session.";
  const missingPlaywrightBrowser =
    /Executable doesn't exist|playwright install|browserType\.launch/i.test(message);

  console.error("AUTOMATION BROWSER ROUTE ERROR:", error);

  return Response.json(
    {
      error: missingPlaywrightBrowser
        ? "Playwright Chromium is not installed for the automation worker. Run `npx playwright install chromium`, then try opening the URL again."
        : message,
    },
    { status: missingPlaywrightBrowser ? 503 : 500 },
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "open") {
      const projectKey = typeof body.projectKey === "string" ? body.projectKey : "";
      if (!projectKey) {
        return Response.json(
          {
            error:
              "Project key is required. Use /api/automation/sessions for new browser sessions.",
          },
          { status: 400 },
        );
      }

      const projectId = await resolveAutomationProjectId(projectKey);
      if (!projectId) {
        return Response.json({ error: "Project not found." }, { status: 404 });
      }

      const session = await requestAutomationSession({
        headless:
          typeof body.headless === "boolean"
            ? body.headless
            : body.browserMode === "headless"
              ? true
              : body.browserMode === "headed"
                ? false
                : undefined,
        projectId,
        providerId: typeof body.provider === "string" ? body.provider : undefined,
        scenarioId: typeof body.scenarioId === "string" ? body.scenarioId : null,
        targetUrl: typeof body.url === "string" ? body.url : undefined,
      });
      return Response.json(
        {
          session,
          sessionMetadata: toAutomationSessionMetadata(session),
        },
        { status: 201 },
      );
    }

    if (action === "snapshot" || action === "record") {
      const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
      if (!sessionId) {
        return Response.json({ error: "Session id is required." }, { status: 400 });
      }
      const session = await refreshAutomationSession(sessionId);
      if (!session) {
        return Response.json({ error: "Session not found." }, { status: 404 });
      }
      return Response.json({
        logs: [],
        session,
        sessionMetadata: toAutomationSessionMetadata(session),
      });
    }

    if (action === "close") {
      const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
      if (!sessionId) {
        return Response.json({ error: "Session id is required." }, { status: 400 });
      }
      const session = await stopAutomationSession(sessionId);
      if (!session) {
        return Response.json({ error: "Session not found." }, { status: 404 });
      }
      return Response.json({ ok: true, session, sessionMetadata: toAutomationSessionMetadata(session) });
    }

    return Response.json(
      {
        error:
          "The in-app Playwright browser runtime has been removed from the default path. Use /api/automation/sessions.",
      },
      { status: 410 },
    );
  } catch (error) {
    return automationSessionErrorResponse(error);
  }
}
