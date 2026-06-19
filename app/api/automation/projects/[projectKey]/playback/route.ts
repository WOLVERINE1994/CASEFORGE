import {
  createPlaybackJob,
  listPlaybackJobs,
  resolveAutomationProjectId,
  stopPendingPlayback,
  updatePlaybackJobStatus,
} from "../../../../../../utils/automation/store";
import type { AutomationStep } from "../../../../../../utils/automation/types";

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
  const jobs = await listPlaybackJobs(projectId, searchParams.get("scenarioId"));
  return Response.json({ jobs });
}

export async function POST(request: Request, context: RouteContext) {
  const { projectKey } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const steps = Array.isArray(body.steps)
    ? (body.steps.filter(
        (step: unknown): step is AutomationStep =>
          Boolean(step && typeof step === "object" && !Array.isArray(step)),
      ) as AutomationStep[])
    : [];
  if (!steps.length) {
    return Response.json({ error: "Playback requires at least one command." }, { status: 400 });
  }

  let job;
  try {
    job = await createPlaybackJob({
      actionId: typeof body.actionId === "string" ? body.actionId : null,
      configSnapshot:
        body.configSnapshot && typeof body.configSnapshot === "object"
          ? body.configSnapshot
          : {},
      logs: ["Playback queued."],
      projectId,
      scenarioId: typeof body.scenarioId === "string" ? body.scenarioId : null,
      scope: typeof body.scope === "string" ? body.scope : "fullScenario",
      sessionId: typeof body.sessionId === "string" ? body.sessionId : null,
      steps,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not queue playback.";
    if (/Playback tables are not available/i.test(message)) {
      return Response.json({ error: message }, { status: 503 });
    }
    throw error;
  }

  return Response.json({ job }, { status: 201 });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { projectKey } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  if (!jobId) {
    return Response.json({ error: "Playback job id is required." }, { status: 400 });
  }
  const job = await updatePlaybackJobStatus(
    projectId,
    jobId,
    typeof body.status === "string" ? body.status : "queued",
    Array.isArray(body.logs) ? body.logs : [],
  );
  if (!job) {
    return Response.json({ error: "Playback job not found." }, { status: 404 });
  }
  return Response.json({ job });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { projectKey } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const stoppedCount = await stopPendingPlayback(projectId, searchParams.get("scenarioId"));
  return Response.json({ stoppedCount });
}
