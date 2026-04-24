import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { spawn } from "child_process";
import { normalizeAutomationRuntimeProvider } from "../../../../utils/automation";
import type { AutomationRecorderSession } from "../../../../utils/workspace";

const getRecorderSessionDir = (sessionId: string) =>
  path.join(process.cwd(), ".artifacts", "automation", "record", sessionId);

const getRecorderSessionFile = (sessionId: string) =>
  path.join(getRecorderSessionDir(sessionId), "session.json");

const isSafeSessionId = (value: string) => /^[a-z0-9-]+$/i.test(value);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId") ?? "";

    if (!sessionId || !isSafeSessionId(sessionId)) {
      return Response.json({ error: "A valid recorder session id is required." }, { status: 400 });
    }

    const session = JSON.parse(
      await readFile(getRecorderSessionFile(sessionId), "utf8")
    ) as AutomationRecorderSession;

    return Response.json({ session });
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : "Failed to load recorder session.";
    return Response.json({ error: message }, { status: 404 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = body?.action === "stop" ? "stop" : "start";

    if (action === "stop") {
      const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
      if (!sessionId || !isSafeSessionId(sessionId)) {
        return Response.json(
          { error: "A valid recorder session id is required." },
          { status: 400 }
        );
      }

      const sessionPath = getRecorderSessionFile(sessionId);
      const session = JSON.parse(
        await readFile(sessionPath, "utf8")
      ) as AutomationRecorderSession;

      if (session.status === "stopped" || session.status === "failed") {
        return Response.json({
          stopped: session.status === "stopped",
          session,
          message: "Recorder session is already finalized.",
        });
      }

      const nextSession: AutomationRecorderSession = {
        ...session,
        status: "stopping",
        updatedAt: Date.now(),
        logs: [...(session.logs ?? []), "Stop requested from automation workspace."],
      };

      await writeFile(sessionPath, JSON.stringify(nextSession, null, 2), "utf8");

      return Response.json({
        stopping: true,
        session: nextSession,
        message: "Stopping recorder and finalizing captured interactions.",
      });
    }

    const rowId = typeof body?.rowId === "string" ? body.rowId : "test-case";
    const provider = normalizeAutomationRuntimeProvider(body?.provider);
    const scriptName =
      typeof body?.scriptName === "string" ? body.scriptName : `${rowId} recording`;
    const initialUrl =
      typeof body?.initialUrl === "string" && body.initialUrl.trim()
        ? body.initialUrl.trim()
        : undefined;

    if (provider !== "playwright") {
      return Response.json(
        { error: "Live recording is currently supported only for Playwright." },
        { status: 400 }
      );
    }

    const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const outputDir = getRecorderSessionDir(sessionId);
    await mkdir(outputDir, { recursive: true });

    const session: AutomationRecorderSession = {
      id: sessionId,
      rowId,
      scriptName,
      status: "starting",
      startedAt: Date.now(),
      updatedAt: Date.now(),
      logs: [
        initialUrl
          ? `Recorder session created at ${initialUrl}.`
          : "Recorder session created.",
      ],
      events: [],
      generatedSteps: [],
      outputDir,
      startUrl: initialUrl,
    };

    await writeFile(
      getRecorderSessionFile(sessionId),
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
          initialUrl,
        },
        null,
        2
      ),
      "utf8"
    );

    const runnerPath = path.join(process.cwd(), "scripts", "automation-record-runner.mjs");
    const child = spawn(process.execPath, [runnerPath, payloadPath], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    child.unref();

    return Response.json({
      started: true,
      session,
      message: initialUrl
        ? "Recorder started. Use the opened browser to interact with the page, then stop recording to generate steps."
        : "Recorder started. Use the opened browser to navigate and interact, then stop recording to generate steps.",
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : "Failed to start recorder session.";
    return Response.json({ error: message }, { status: 500 });
  }
}
