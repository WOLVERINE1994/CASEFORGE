import { validateAutomationScript } from "../../../../utils/automation-execution";
import { normalizeAutomationRuntimeProvider } from "../../../../utils/automation";
import type { AutomationStep } from "../../../../utils/workspace";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const provider = normalizeAutomationRuntimeProvider(body?.provider);
    const steps = Array.isArray(body?.steps) ? (body.steps as AutomationStep[]) : [];
    const validation = validateAutomationScript(provider, steps);

    return Response.json(validation);
  } catch (error) {
    console.error("AUTOMATION VALIDATE ERROR:", error);
    return Response.json(
      { valid: false, errors: ["Failed to validate automation steps."] },
      { status: 500 }
    );
  }
}
