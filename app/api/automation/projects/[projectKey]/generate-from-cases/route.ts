import {
  createScenario,
  replaceScenarioSteps,
  resolveAutomationProjectId,
} from "../../../../../../utils/automation/store";
import {
  generateAutomationDraftsFromManualCases,
  type ManualAutomationCase,
} from "../../../../../../utils/automation/ai-drafts";

type RouteContext = {
  params: Promise<{ projectKey: string }>;
};

const cleanText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const normalizeManualCase = (value: unknown): ManualAutomationCase | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = cleanText(record.id);
  const title = cleanText(record.title);
  const steps = cleanText(record.steps);
  const expectedResult = cleanText(record.expectedResult);

  if (!id || !title || !steps || !expectedResult) return null;

  return {
    expectedResult,
    id,
    preconditions: cleanText(record.preconditions),
    steps,
    testData: cleanText(record.testData),
    title,
    type: cleanText(record.type),
  };
};

function generationErrorResponse(error: unknown) {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message
      : "Could not generate automation draft.";

  console.error("AI AUTOMATION GENERATION ERROR:", error);

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
    const manualCases = Array.isArray(body.cases)
      ? body.cases.flatMap((item: unknown): ManualAutomationCase[] => {
          const normalized = normalizeManualCase(item);
          return normalized ? [normalized] : [];
        })
      : [];

    if (!manualCases.length) {
      return Response.json(
        { error: "Select at least one complete manual case before generating automation." },
        { status: 400 },
      );
    }

    const generated = await generateAutomationDraftsFromManualCases({
      manualCases,
      requirement: cleanText(body.requirement),
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
          confidence: draft.confidence,
          sourceCaseId: draft.sourceCaseId,
          sourceType: "manual-case",
          usedFallback: generated.usedFallback,
          variables: draft.variables,
        },
        name: draft.name,
        projectId,
        status: "draft",
        tags: ["AI draft", "Needs review", draft.sourceCaseId].filter(Boolean),
      });

      const scenarioWithSteps = await replaceScenarioSteps(projectId, scenario.id, draft.steps);
      scenarios.push(scenarioWithSteps ?? scenario);
    }

    return Response.json(
      {
        model: generated.model,
        provider: generated.provider,
        scenarios,
        usedFallback: generated.usedFallback,
      },
      { status: 201 },
    );
  } catch (error) {
    return generationErrorResponse(error);
  }
}
