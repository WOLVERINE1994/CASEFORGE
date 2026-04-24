import { validateAutomationDefinition } from "../../../../utils/automation-execution";
import { normalizeAutomationRuntimeProvider } from "../../../../utils/automation";
import type {
  AutomationEnvironmentBinding,
  AutomationReusableBlock,
  AutomationScript,
  AutomationSelectorPreset,
  AutomationStep,
} from "../../../../utils/workspace";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const provider = normalizeAutomationRuntimeProvider(body?.provider);
    const steps = Array.isArray(body?.steps) ? (body.steps as AutomationStep[]) : [];
    const script =
      body?.script && typeof body.script === "object"
        ? (body.script as AutomationScript)
        : null;
    const reusableBlocks = Array.isArray(body?.reusableBlocks)
      ? (body.reusableBlocks as AutomationReusableBlock[])
      : [];
    const selectorPresets = Array.isArray(body?.selectorPresets)
      ? (body.selectorPresets as AutomationSelectorPreset[])
      : [];
    const environments = Array.isArray(body?.environments)
      ? (body.environments as AutomationEnvironmentBinding[])
      : [];
    const validation = validateAutomationDefinition({
      provider,
      script,
      steps,
      reusableBlocks,
      selectorPresets,
      environments,
    });

    return Response.json(validation);
  } catch (error) {
    console.error("AUTOMATION VALIDATE ERROR:", error);
    return Response.json(
      {
        valid: false,
        errors: ["Failed to validate automation steps."],
        issues: [],
      },
      { status: 500 }
    );
  }
}
