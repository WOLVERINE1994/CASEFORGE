import { requestAutomationSession } from "../../../../utils/automation/orchestration";
import { resolveAutomationProjectId } from "../../../../utils/automation/store";
import { toAutomationSessionMetadata } from "../../../../utils/automation/session-metadata";

export const runtime = "nodejs";

function automationSessionErrorResponse(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Could not start browser session.";
  const missingPlaywrightBrowser =
    /Executable doesn't exist|playwright install|browserType\.launch/i.test(message);

  console.error("AUTOMATION SESSION CREATE ERROR:", error);

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
    const projectKey = typeof body.projectKey === "string" ? body.projectKey : "";
    if (!projectKey) {
      return Response.json({ error: "Project key is required." }, { status: 400 });
    }

    const projectId = await resolveAutomationProjectId(projectKey);
    if (!projectId) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }

    const session = await requestAutomationSession({
      environmentId:
        typeof body.environmentId === "string" ? body.environmentId : null,
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
      targetUrl: typeof body.targetUrl === "string" ? body.targetUrl : undefined,
    });

    return Response.json(
      { session, sessionMetadata: toAutomationSessionMetadata(session) },
      { status: 201 },
    );
  } catch (error) {
    return automationSessionErrorResponse(error);
  }
}
