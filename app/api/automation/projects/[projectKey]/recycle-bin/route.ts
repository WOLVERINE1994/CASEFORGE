import {
  listRecycleBinItems,
  purgeRecycleBinItem,
  resolveAutomationProjectId,
  restoreRecycleBinItem,
} from "../../../../../../utils/automation/store";
import type { AutomationRecycleBinItemType } from "../../../../../../utils/automation/types";

type RouteContext = {
  params: Promise<{ projectKey: string }>;
};

function recycleBinType(value: unknown): AutomationRecycleBinItemType | null {
  return value === "scenario" || value === "action" || value === "suite" || value === "report"
    ? value
    : null;
}

export async function GET(_: Request, context: RouteContext) {
  const { projectKey } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  return Response.json({
    items: await listRecycleBinItems(projectId),
    reservedTypes: ["suite", "report"],
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { projectKey } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const type = recycleBinType(body.type);
  const id = typeof body.id === "string" ? body.id : "";
  if (!type || !id) {
    return Response.json({ error: "Recycle bin item type and id are required." }, { status: 400 });
  }

  const restored = await restoreRecycleBinItem(projectId, type, id);
  if (!restored) {
    return Response.json({ error: "Item not found or cannot be restored yet." }, { status: 404 });
  }

  return Response.json({ item: restored, ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { projectKey } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const type = recycleBinType(body.type);
  const id = typeof body.id === "string" ? body.id : "";
  if (!type || !id) {
    return Response.json({ error: "Recycle bin item type and id are required." }, { status: 400 });
  }

  const purged = await purgeRecycleBinItem(projectId, type, id);
  if (!purged) {
    return Response.json({ error: "Item not found or cannot be purged yet." }, { status: 404 });
  }

  return Response.json({ ok: true });
}
