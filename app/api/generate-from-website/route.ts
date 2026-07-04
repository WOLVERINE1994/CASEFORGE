import { generateWebsiteManualTestCases } from "../../../utils/automation/website-drafts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const cleanText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

function websiteManualGenerationErrorResponse(error: unknown) {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message
      : "Could not generate website manual test cases.";

  console.error("AI WEBSITE MANUAL CASE GENERATION ERROR:", error);

  return Response.json({ error: message }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const url = cleanText(body.url);
    const component = cleanText(body.component);

    if (!url) {
      return Response.json({ error: "Website URL is required." }, { status: 400 });
    }
    if (!component) {
      return Response.json(
        { error: "Component name is required, for example homepage, login form, header, footer, or pricing." },
        { status: 400 },
      );
    }

    const generated = await generateWebsiteManualTestCases({
      component,
      coverage: body.coverage,
      mode: body.mode,
      orchestration: body.orchestration,
      persona: body.persona,
      url,
    });

    return Response.json({
      coverage: generated.coverage,
      model: generated.model,
      provider: generated.provider,
      result: generated.result,
      snapshot: {
        component: generated.snapshot.component,
        finalUrl: generated.snapshot.finalUrl,
        stats: generated.snapshot.stats,
        title: generated.snapshot.title,
        visibleElementCount: generated.snapshot.elements.length,
      },
      usedFallback: generated.usedFallback,
      warning: generated.usedFallback
        ? "Generated fallback manual cases from the inspected website because AI expansion was unavailable."
        : undefined,
    });
  } catch (error) {
    return websiteManualGenerationErrorResponse(error);
  }
}
