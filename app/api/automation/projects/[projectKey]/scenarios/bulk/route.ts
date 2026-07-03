import {
  bulkUpdateScenarios,
  resolveAutomationProjectId,
} from "../../../../../../../utils/automation/store";
import type { AutomationScenarioStatus } from "../../../../../../../utils/automation/types";

type RouteContext = {
  params: Promise<{ projectKey: string }>;
};

const scenarioStatuses: AutomationScenarioStatus[] = [
  "draft",
  "active",
  "paused",
  "archived",
];

function isScenarioStatus(value: unknown): value is AutomationScenarioStatus {
  return typeof value === "string" && scenarioStatuses.includes(value as never);
}

function parseTags(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((tag): tag is string => typeof tag === "string")
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      ]
    : undefined;
}

function parseTagMode(value: unknown): "append" | "remove" | "replace" {
  return value === "remove" || value === "replace" ? value : "append";
}

function automationApiError(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { projectKey } = await context.params;
    const projectId = await resolveAutomationProjectId(projectKey);
    if (!projectId) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const scenarioIds: string[] = Array.isArray(body.scenarioIds)
      ? [
          ...new Set<string>(
            body.scenarioIds
              .filter((id: unknown): id is string => typeof id === "string")
              .map((id: string) => id.trim())
              .filter(Boolean),
          ),
        ]
      : [];
    const status = isScenarioStatus(body.status) ? body.status : undefined;
    const tags = parseTags(body.tags);

    if (!scenarioIds.length) {
      return Response.json(
        { error: "Bulk update requires at least one scenario." },
        { status: 400 },
      );
    }
    if (!status && !tags) {
      return Response.json(
        { error: "Bulk update requires a status or tags." },
        { status: 400 },
      );
    }

    const result = await bulkUpdateScenarios(projectId, scenarioIds, {
      status,
      tagMode: parseTagMode(body.tagMode),
      tags,
    });

    return Response.json(result);
  } catch (error) {
    console.error("AUTOMATION SCENARIOS BULK PATCH ERROR:", error);
    return Response.json(
      { error: automationApiError(error, "Could not bulk update scenarios.") },
      { status: 500 },
    );
  }
}
