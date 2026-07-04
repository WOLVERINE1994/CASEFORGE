import {
  createScenario,
  replaceScenarioSteps,
  resolveAutomationProjectId,
} from "../../../../../../utils/automation/store";
import { generateWebsiteAutomationDrafts } from "../../../../../../utils/automation/website-drafts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectKey: string }>;
};

const cleanText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

function websiteGenerationErrorResponse(error: unknown) {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message
      : "Could not generate website automation scenarios.";

  console.error("AI WEBSITE AUTOMATION GENERATION ERROR:", error);

  return Response.json({ error: message }, { status: 500 });
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectKey } = await context.params;
    const projectId = await resolveAutomationProjectId(projectKey);
    if (!projectId) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const url = cleanText(body.url);
    const component = cleanText(body.component);

    if (!url) {
      return Response.json({ error: "Website URL is required." }, { status: 400 });
    }
    if (!component) {
      return Response.json(
        { error: "Component name is required, for example header, footer, homepage, login form, or pricing." },
        { status: 400 },
      );
    }

    const generated = await generateWebsiteAutomationDrafts({
      component,
      coverage: body.coverage,
      url,
    });

    const scenarios = [];
    for (const draft of generated.drafts) {
      const scenario = await createScenario({
        description: draft.description,
        metadata: {
          aiGenerated: true,
          aiModel: generated.model,
          aiProvider: generated.provider,
          aiWarnings: draft.warnings,
          component: generated.snapshot.component,
          confidence: draft.confidence,
          coverage: generated.coverage,
          finalUrl: generated.snapshot.finalUrl,
          inspectedAt: new Date().toISOString(),
          sourceType: "website-component",
          usedFallback: generated.usedFallback,
          websiteInspection: {
            headings: generated.snapshot.headings,
            requestedUrl: generated.snapshot.requestedUrl,
            rootDescription: generated.snapshot.rootDescription,
            stats: generated.snapshot.stats,
            title: generated.snapshot.title,
            visibleElementCount: generated.snapshot.elements.length,
          },
        },
        name: draft.name,
        projectId,
        status: "draft",
        tags: [
          "AI website",
          "Needs review",
          generated.snapshot.component,
          ...draft.tags,
        ].filter(Boolean),
      });

      const scenarioWithSteps = await replaceScenarioSteps(projectId, scenario.id, draft.steps);
      scenarios.push(scenarioWithSteps ?? scenario);
    }

    return Response.json(
      {
        coverage: generated.coverage,
        model: generated.model,
        provider: generated.provider,
        scenarios,
        snapshot: {
          component: generated.snapshot.component,
          finalUrl: generated.snapshot.finalUrl,
          stats: generated.snapshot.stats,
          title: generated.snapshot.title,
          visibleElementCount: generated.snapshot.elements.length,
        },
        usedFallback: generated.usedFallback,
      },
      { status: 201 },
    );
  } catch (error) {
    return websiteGenerationErrorResponse(error);
  }
}
