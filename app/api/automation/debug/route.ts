import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { spawn } from "child_process";
import { validateAutomationDefinition } from "../../../../utils/automation-execution";
import { normalizeAutomationRuntimeProvider } from "../../../../utils/automation";
import { resolveAutomationSteps } from "../../../../utils/automation-reuse";
import type {
  AutomationDebugSession,
  AutomationEnvironmentBinding,
  AutomationReusableBlock,
  AutomationScript,
  AutomationSelectorPreset,
  AutomationStep,
} from "../../../../utils/workspace";

const getDebugSessionDir = (sessionId: string) =>
  path.join(process.cwd(), ".artifacts", "automation", "debug", sessionId);

const getDebugSessionFile = (sessionId: string) =>
  path.join(getDebugSessionDir(sessionId), "session.json");

const isSafeSessionId = (value: string) => /^[a-z0-9-]+$/i.test(value);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId") ?? "";

    if (!sessionId || !isSafeSessionId(sessionId)) {
      return Response.json({ error: "A valid debug session id is required." }, { status: 400 });
    }

    const session = JSON.parse(
      await readFile(getDebugSessionFile(sessionId), "utf8")
    ) as AutomationDebugSession;

    return Response.json({ session });
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : "Failed to load debug session.";
    return Response.json({ error: message }, { status: 404 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rowId = typeof body?.rowId === "string" ? body.rowId : "test-case";
    const provider = normalizeAutomationRuntimeProvider(body?.provider);
    const steps = Array.isArray(body?.steps) ? (body.steps as AutomationStep[]) : [];
    const scriptName =
      typeof body?.scriptName === "string" ? body.scriptName : `${rowId} debug`;
    const reusableBlocks = Array.isArray(body?.reusableBlocks)
      ? (body.reusableBlocks as AutomationReusableBlock[])
      : [];
    const selectorPresets = Array.isArray(body?.selectorPresets)
      ? (body.selectorPresets as AutomationSelectorPreset[])
      : [];
    const environments = Array.isArray(body?.environments)
      ? (body.environments as AutomationEnvironmentBinding[])
      : [];
    const script: AutomationScript = {
      id:
        typeof body?.script?.id === "string" && body.script.id.trim()
          ? body.script.id
          : "debug-script",
      projectId: "debug-project",
      provider,
      executionMode: "headed",
      environmentBindingId:
        typeof body?.script?.environmentBindingId === "string"
          ? body.script.environmentBindingId
          : typeof body?.environmentBindingId === "string"
            ? body.environmentBindingId
            : undefined,
      name: scriptName,
      description:
        typeof body?.script?.description === "string"
          ? body.script.description
          : undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (provider !== "playwright") {
      return Response.json(
        { error: "Visible browser debug is currently supported only for Playwright." },
        { status: 400 }
      );
    }

    const validation = validateAutomationDefinition({
      provider,
      script,
      steps,
      reusableBlocks,
      selectorPresets,
      environments,
    });

    if (!validation.valid) {
      return Response.json(
        { error: validation.errors[0], validation },
        { status: 400 }
      );
    }

    const { resolvedSteps, referenceMap } = resolveAutomationSteps({
      script,
      steps,
      reusableBlocks,
      selectorPresets,
      environments,
    });

    const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const outputDir = getDebugSessionDir(sessionId);
    await mkdir(outputDir, { recursive: true });

    const session: AutomationDebugSession = {
      id: sessionId,
      rowId,
      scriptName,
      status: "starting",
      startedAt: Date.now(),
      updatedAt: Date.now(),
      logs: ["Debug session created."],
      stepResults: [],
      outputDir,
    };

    await writeFile(
      getDebugSessionFile(sessionId),
      JSON.stringify(session, null, 2),
      "utf8"
    );

    const payloadPath = path.join(outputDir, "payload.json");
    await writeFile(
      payloadPath,
      JSON.stringify(
        {
          sessionId,
          rowId,
          scriptName,
          outputDir,
          steps: resolvedSteps.map((step) => {
            const reference = referenceMap.get(step.id);
            return {
              ...step,
              sourceStepId: reference?.sourceStepId ?? step.sourceStepId ?? step.id,
              sourceOrigin: reference?.origin ?? step.sourceOrigin,
              sourceReferenceId: reference?.referenceId ?? step.sourceReferenceId,
              sourceReferenceLabel: reference?.label ?? step.sourceReferenceLabel,
            };
          }),
        },
        null,
        2
      ),
      "utf8"
    );

    const runnerPath = path.join(process.cwd(), "scripts", "automation-debug-runner.mjs");
    const child = spawn(process.execPath, [runnerPath, payloadPath], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    child.unref();

    return Response.json({
      started: true,
      session,
      message:
        "Debug mode started. The browser will run step by step while the panel streams progress.",
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : "Failed to start visible browser debug.";
    return Response.json({ error: message }, { status: 500 });
  }
}
