import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { spawn } from "child_process";
import { validateAutomationScript } from "../../../../utils/automation-execution";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rowId = typeof body?.rowId === "string" ? body.rowId : "test-case";
    const provider = body?.provider;
    const steps = Array.isArray(body?.steps) ? body.steps : [];
    const scriptName =
      typeof body?.scriptName === "string" ? body.scriptName : `${rowId} debug`;

    if (provider !== "playwright") {
      return Response.json(
        { error: "Visible browser debug is currently supported only for Playwright." },
        { status: 400 }
      );
    }

    const validation = validateAutomationScript("playwright", steps);
    if (!validation.valid) {
      return Response.json(
        { error: validation.errors[0], validation },
        { status: 400 }
      );
    }

    const debugId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const outputDir = path.join(process.cwd(), ".artifacts", "automation", "debug", debugId);
    await mkdir(outputDir, { recursive: true });

    const payloadPath = path.join(outputDir, "payload.json");
    await writeFile(
      payloadPath,
      JSON.stringify(
        {
          rowId,
          scriptName,
          steps,
          outputDir,
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
      outputDir,
      message: "Visible browser debug started. Close the browser window when you are done.",
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : "Failed to start visible browser debug.";
    return Response.json({ error: message }, { status: 500 });
  }
}
