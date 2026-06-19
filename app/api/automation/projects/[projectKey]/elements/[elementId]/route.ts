import {
  listElements,
  remapElement,
  resolveAutomationProjectId,
  upsertElement,
} from "../../../../../../../utils/automation/store";

type RouteContext = {
  params: Promise<{ projectKey: string; elementId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { projectKey, elementId } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const element = (await listElements(projectId)).find((item) => item.id === elementId);
  if (!element) {
    return Response.json({ error: "Element not found." }, { status: 404 });
  }
  return Response.json({ element });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { projectKey, elementId } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const mode = typeof body.mode === "string" ? body.mode : "edit";
  const element =
    mode === "remap"
      ? await remapElement(projectId, elementId, {
          boundingBox:
            body.boundingBox && typeof body.boundingBox === "object" ? body.boundingBox : {},
          canonicalLocator:
            body.canonicalLocator && typeof body.canonicalLocator === "object"
              ? body.canonicalLocator
              : {},
          elementSnapshot:
            body.elementSnapshot && typeof body.elementSnapshot === "object"
              ? body.elementSnapshot
              : {},
          fallbackLocators: Array.isArray(body.fallbackLocators) ? body.fallbackLocators : [],
          locatorCandidates: Array.isArray(body.locatorCandidates) ? body.locatorCandidates : [],
          metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
          viewId: typeof body.viewId === "string" ? body.viewId : null,
        })
      : await upsertElement({
          aliases: Array.isArray(body.aliases) ? body.aliases : undefined,
          businessName: typeof body.businessName === "string" ? body.businessName : undefined,
          description: typeof body.description === "string" ? body.description : undefined,
          fallbackLocators: Array.isArray(body.fallbackLocators) ? body.fallbackLocators : undefined,
          lastVerifiedAt: typeof body.lastVerifiedAt === "string" ? body.lastVerifiedAt : undefined,
          preferredLocatorStrategy:
            body.preferredLocatorStrategy === null || typeof body.preferredLocatorStrategy === "string"
              ? body.preferredLocatorStrategy
              : undefined,
          stabilityScore: typeof body.stabilityScore === "number" ? body.stabilityScore : undefined,
          technicalName: typeof body.technicalName === "string" ? body.technicalName : undefined,
          boundingBox:
            body.boundingBox && typeof body.boundingBox === "object" ? body.boundingBox : {},
          canonicalLocator:
            body.canonicalLocator && typeof body.canonicalLocator === "object"
              ? body.canonicalLocator
              : {},
          elementSnapshot:
            body.elementSnapshot && typeof body.elementSnapshot === "object"
              ? body.elementSnapshot
              : {},
          elementType: typeof body.elementType === "string" ? body.elementType : "element",
          id: elementId,
          locatorCandidates: Array.isArray(body.locatorCandidates) ? body.locatorCandidates : [],
          metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
          name: typeof body.name === "string" ? body.name : "Unnamed Element",
          projectId,
          status: typeof body.status === "string" ? body.status : "active",
          viewId: typeof body.viewId === "string" ? body.viewId : null,
        });

  if (!element) {
    return Response.json({ error: "Element not found." }, { status: 404 });
  }
  return Response.json({ element });
}
