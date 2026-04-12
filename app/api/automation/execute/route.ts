import {
  executeAutomationScript,
  validateAutomationScript,
} from "../../../../utils/automation-execution";
import {
  getAutomationBindingForCase,
  getAutomationScriptById,
  getAutomationStepsForScript,
} from "../../../../utils/automation";
import { readProjects, writeProjects } from "../../../../utils/project-store";
import type { AutomationExecutionMode, Project } from "../../../../utils/workspace";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const projectRef =
      typeof body?.projectId === "string"
        ? body.projectId
        : typeof body?.projectRef === "string"
          ? body.projectRef
          : "";
    const runId = typeof body?.runId === "string" ? body.runId : "";
    const caseId = typeof body?.caseId === "string" ? body.caseId : "";
    const scriptId =
      typeof body?.scriptId === "string" ? body.scriptId : undefined;
    const executionMode =
      body?.executionMode === "headed" || body?.executionMode === "headless"
        ? (body.executionMode as AutomationExecutionMode)
        : undefined;

    if (!projectRef || !runId || !caseId) {
      return Response.json(
        { error: "projectId/projectRef, runId, and caseId are required." },
        { status: 400 }
      );
    }

    const projects = await readProjects();
    const project = projects.find(
      (entry: Project) =>
        entry.id === projectRef ||
        entry.projectKey?.trim().toLowerCase() === projectRef.trim().toLowerCase()
    );

    if (!project) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }

    const run = project.runs?.find((entry) => entry.id === runId);
    if (!run) {
      return Response.json({ error: "Run not found." }, { status: 404 });
    }

    const row = project.rows.find((entry) => entry.id === caseId);
    if (!row) {
      return Response.json({ error: "Test case not found." }, { status: 404 });
    }

    const binding =
      getAutomationBindingForCase(project.automationBindings, caseId) ?? null;
    const resolvedScriptId = scriptId ?? binding?.scriptId ?? row.automationScriptId;
    const storedScript = getAutomationScriptById(
      project.automationScripts,
      resolvedScriptId
    );

    if (!storedScript) {
      return Response.json(
        { error: "No automation script is attached to this test case." },
        { status: 400 }
      );
    }

    const script = executionMode
      ? {
          ...storedScript,
          executionMode,
        }
      : storedScript;

    const steps = getAutomationStepsForScript(project.automationSteps, script.id);
    const validation = validateAutomationScript(script.provider, steps);
    if (!validation.valid) {
      return Response.json(
        { error: validation.errors[0], validation },
        { status: 400 }
      );
    }

    const { execution, artifacts, logs } = await executeAutomationScript({
      projectId: project.id,
      projectKey: project.projectKey,
      runId,
      caseId,
      script,
      steps,
    });

    const updatedProjects = projects.map((entry: Project) => {
      if (entry.id !== project.id) {
        return entry;
      }

      const nextExecutions = [...(entry.automationExecutions ?? []), execution];
      const nextArtifacts = [...(entry.automationArtifacts ?? []), ...artifacts];

      return {
        ...entry,
        automationExecutions: nextExecutions,
        automationArtifacts: nextArtifacts,
        rows: entry.rows.map((item) =>
          item.id === caseId
            ? {
                ...item,
                executionResult: execution.status,
                automationStatus:
                  item.automationStatus === "automated"
                    ? item.automationStatus
                    : "automated",
                automationScriptId: script.id,
              }
            : item
        ),
        runs: (entry.runs ?? []).map((existingRun) =>
          existingRun.id === runId
            ? {
                ...existingRun,
                rowResults: {
                  ...existingRun.rowResults,
                  [caseId]: execution.status,
                },
                rowNotes: {
                  ...existingRun.rowNotes,
                  [caseId]:
                    execution.failureMessage ||
                    execution.logSummary ||
                    existingRun.rowNotes[caseId] ||
                    "",
                },
                updatedAt: Date.now(),
              }
            : existingRun
        ),
        updatedAt: Date.now(),
      };
    });

    await writeProjects(updatedProjects);

    return Response.json({
      execution,
      artifacts,
      logs,
    });
  } catch (error) {
    console.error("AUTOMATION EXECUTE ERROR:", error);
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : "Failed to execute automation.";
    return Response.json({ error: message }, { status: 500 });
  }
}
