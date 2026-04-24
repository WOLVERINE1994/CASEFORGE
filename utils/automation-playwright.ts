import path from "path";
import type { AutomationProviderAdapter } from "./automation-provider";
import type {
  AutomationExecutionResult,
} from "./automation-provider";
import type {
  AutomationExecutionEvent,
  AutomationStep,
  AutomationStepResult,
  AutomationValidationIssue,
  AutomationValidationIssueField,
  AutomationValidationResult,
} from "./workspace";

const SUPPORTED_ACTIONS = new Set([
  "goto",
  "click",
  "fill",
  "select",
  "press",
  "wait-for",
  "assert-text",
  "assert-visible",
  "assert-url",
  "assert-value",
  "run-block",
]);

const ACTION_TARGET_RULES: Record<
  AutomationStep["action"],
  {
    allowedTargetTypes: Set<NonNullable<AutomationStep["targetType"]>>;
    requiresTarget?: boolean;
    requiresInput?: boolean;
    requiresExpected?: boolean;
    requiresSharedBlock?: boolean;
  }
> = {
  goto: {
    allowedTargetTypes: new Set(["url", "route"]),
    requiresTarget: true,
  },
  click: {
    allowedTargetTypes: new Set(["selector", "selector-preset", "text"]),
    requiresTarget: true,
  },
  fill: {
    allowedTargetTypes: new Set(["selector", "selector-preset"]),
    requiresTarget: true,
    requiresInput: true,
  },
  select: {
    allowedTargetTypes: new Set(["selector", "selector-preset"]),
    requiresTarget: true,
    requiresInput: true,
  },
  press: {
    allowedTargetTypes: new Set(["selector", "selector-preset", "text", "key"]),
    requiresInput: true,
  },
  "wait-for": {
    allowedTargetTypes: new Set(["selector", "selector-preset", "url", "route", "text"]),
    requiresTarget: true,
  },
  "assert-text": {
    allowedTargetTypes: new Set(["selector", "selector-preset", "text"]),
    requiresTarget: true,
    requiresExpected: true,
  },
  "assert-visible": {
    allowedTargetTypes: new Set(["selector", "selector-preset", "text"]),
    requiresTarget: true,
  },
  "assert-url": {
    allowedTargetTypes: new Set(["url", "route"]),
    requiresExpected: true,
  },
  "assert-value": {
    allowedTargetTypes: new Set(["selector", "selector-preset"]),
    requiresTarget: true,
    requiresExpected: true,
  },
  "run-block": {
    allowedTargetTypes: new Set(["shared-block"]),
    requiresSharedBlock: true,
  },
};

const trimValue = (value: string | undefined | null) => value?.trim() ?? "";

const getActionCallLabel = (step: AutomationStep) => {
  const actionCall = step.metaJson?.actionCall;
  if (
    actionCall &&
    typeof actionCall === "object" &&
    !Array.isArray(actionCall) &&
    typeof (actionCall as Record<string, unknown>).actionName === "string"
  ) {
    return trimValue((actionCall as Record<string, unknown>).actionName as string);
  }

  return trimValue(step.sharedBlockId) || trimValue(step.targetValue);
};

const buildIssue = (
  step: AutomationStep,
  stepIndex: number,
  field: AutomationValidationIssueField,
  code: string,
  message: string
): AutomationValidationIssue => ({
  code,
  message,
  stepId: step.id,
  stepIndex,
  field,
  severity: "error",
});

const buildStepLabel = (stepIndex: number) => `Step ${stepIndex + 1}`;

const describeStep = (step: AutomationStep, stepIndex: number) => {
  const stepLabel = buildStepLabel(stepIndex);
  const targetText = trimValue(step.targetValue);

  switch (step.action) {
    case "goto":
      return `${stepLabel}: Navigate to ${targetText || "target URL"}`;
    case "click":
      return `${stepLabel}: Click ${targetText || "target element"}`;
    case "fill":
      return `${stepLabel}: Fill ${targetText || "target field"}`;
    case "select":
      return `${stepLabel}: Select value in ${targetText || "target field"}`;
    case "press":
      return `${stepLabel}: Press ${trimValue(step.inputValue) || "key"}`;
    case "wait-for":
      return `${stepLabel}: Wait for ${targetText || "target"}`;
    case "assert-text":
      return `${stepLabel}: Assert text on ${targetText || "target element"}`;
    case "assert-visible":
      return `${stepLabel}: Assert visibility for ${targetText || "target element"}`;
    case "assert-url":
      return `${stepLabel}: Assert current URL`;
    case "assert-value":
      return `${stepLabel}: Assert value for ${targetText || "target field"}`;
    case "run-block":
      return `${stepLabel}: Run action ${getActionCallLabel(step) || "call"}`.trim();
    default:
      return `${stepLabel}: ${step.action}`;
  }
};

export class PlaywrightAdapter implements AutomationProviderAdapter {
  provider = "playwright" as const;

  validate(steps: AutomationStep[]): AutomationValidationResult {
    const issues: AutomationValidationIssue[] = [];

    if (steps.length === 0) {
      issues.push({
        code: "automation.empty",
        message: "Add at least one automation step before validation.",
        field: "step",
        severity: "error",
      });
    }

    steps.forEach((step, index) => {
      const stepLabel = buildStepLabel(index);
      const rules = ACTION_TARGET_RULES[step.action];
      const targetType = step.targetType;
      const targetValue = trimValue(step.targetValue);
      const inputValue = trimValue(step.inputValue);
      const expectedValue = trimValue(step.expectedValue);
      const selectorPresetId = trimValue(step.selectorPresetId);
      const sharedBlockId = trimValue(step.sharedBlockId);
      const routeValue = trimValue(step.routeKey) || targetValue;

      if (!SUPPORTED_ACTIONS.has(step.action)) {
        issues.push(
          buildIssue(
            step,
            index,
            "action",
            "automation.action.unsupported",
            `${stepLabel} uses unsupported action "${step.action}".`
          )
        );
        return;
      }

      if (
        targetType &&
        !rules.allowedTargetTypes.has(
          targetType as NonNullable<AutomationStep["targetType"]>
        )
      ) {
        issues.push(
          buildIssue(
            step,
            index,
            "targetType",
            "automation.target.invalid-combination",
            `${stepLabel} cannot use target mode "${targetType}" with action "${step.action}".`
          )
        );
      }

      if (!targetType && step.action !== "assert-url") {
        issues.push(
          buildIssue(
            step,
            index,
            "targetType",
            "automation.target.missing-type",
            `${stepLabel} is missing a target mode.`
          )
        );
      }

      if (rules.requiresTarget) {
        const hasTarget =
          targetType === "selector-preset"
            ? Boolean(selectorPresetId || targetValue)
            : targetType === "route"
              ? Boolean(routeValue)
              : Boolean(targetValue);

        if (!hasTarget) {
          issues.push(
            buildIssue(
              step,
              index,
              targetType === "selector-preset" ? "selectorPresetId" : "targetValue",
              "automation.target.missing",
              `${stepLabel} is missing a selector or target value.`
            )
          );
        }
      }

      if (step.action === "press" && targetType && targetType !== "key") {
        const hasTarget =
          targetType === "selector-preset"
            ? Boolean(selectorPresetId || targetValue)
            : Boolean(targetValue);

        if (!hasTarget) {
          issues.push(
            buildIssue(
              step,
              index,
              targetType === "selector-preset" ? "selectorPresetId" : "targetValue",
              "automation.selector.missing",
              `${stepLabel} is missing a selector for the key press target.`
            )
          );
        }
      }

      if (rules.requiresInput && !inputValue) {
        issues.push(
          buildIssue(
            step,
            index,
            "inputValue",
            "automation.value.missing",
            `${stepLabel} is missing a value to use for "${step.action}".`
          )
        );
      }

      if (rules.requiresExpected && !expectedValue) {
        issues.push(
          buildIssue(
            step,
            index,
            "expectedValue",
            "automation.expected.missing",
            `${stepLabel} is missing an expected value.`
          )
        );
      }

      if (rules.requiresSharedBlock && !sharedBlockId && !targetValue) {
        issues.push(
          buildIssue(
            step,
            index,
            "sharedBlockId",
            "automation.shared-block.missing",
            `${stepLabel} is missing an action reference.`
          )
        );
      }

      if ((step.timeoutMs ?? 5000) < 0) {
        issues.push(
          buildIssue(
            step,
            index,
            "timeoutMs",
            "automation.timeout.invalid",
            `${stepLabel} needs a timeout greater than or equal to 0.`
          )
        );
      }
    });

    return {
      valid: issues.length === 0,
      errors: issues
        .filter((issue) => issue.severity !== "warning")
        .map((issue) => issue.message),
      issues,
    };
  }

  transformStepsToExecutable(steps: AutomationStep[]) {
    return steps.map((step) => ({
      ...step,
      timeoutMs: step.timeoutMs ?? 5000,
    }));
  }

  async execute(
    steps: AutomationStep[],
    context: Parameters<AutomationProviderAdapter["execute"]>[1]
  ): Promise<AutomationExecutionResult> {
    const validation = this.validate(steps);
    if (!validation.valid) {
      return {
        status: "blocked",
        logs: validation.errors,
        failureMessage: validation.errors[0],
        stepResults: [],
        artifacts: [],
      };
    }

    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      headless: context.executionMode !== "headed",
    });
    const pageLogs: string[] = [];
    const stepResults: AutomationStepResult[] = [];
    const page = await browser.newPage();
    const executableSteps = this.transformStepsToExecutable(steps) as AutomationStep[];
    const emitEvent = async (event: Omit<AutomationExecutionEvent, "executionId" | "timestamp">) => {
      if (!context.onExecutionEvent) {
        return;
      }

      await context.onExecutionEvent({
        executionId: context.executionId,
        timestamp: Date.now(),
        ...event,
      });
    };

    page.on("console", (message) => {
      const text = `[browser:${message.type()}] ${message.text()}`;
      pageLogs.push(text);
      void emitEvent({
        type: "log_message",
        caseId: context.caseId,
        scenarioId: context.scenarioId,
        scenarioName: context.scenarioName,
        dataSetId: context.dataSetId,
        dataSetName: context.dataSetName,
        message: text,
        level: "info",
      });
    });

    try {
      for (const [index, step] of executableSteps.entries()) {
        const startedAt = Date.now();
        const stepLogStartIndex = pageLogs.length;
        const stepLabel = describeStep(step, index);
        pageLogs.push(`Running ${stepLabel}`);
        const runningResult: AutomationStepResult = {
          stepId: step.id,
          sourceStepId: step.sourceStepId ?? step.id,
          stepIndex: index,
          action: step.action,
          status: "running",
          targetValue: step.targetValue,
          message: "Step is currently running.",
          logLines: pageLogs.slice(stepLogStartIndex),
          startedAt,
          origin: step.sourceOrigin,
          referenceId: step.sourceReferenceId,
          referenceLabel: step.sourceReferenceLabel,
        };

        await emitEvent({
          type: "step_start",
          caseId: context.caseId,
          scenarioId: context.scenarioId,
          scenarioName: context.scenarioName,
          dataSetId: context.dataSetId,
          dataSetName: context.dataSetName,
          stepId: step.id,
          sourceStepId: step.sourceStepId ?? step.id,
          stepIndex: index,
          message: `Running ${stepLabel}`,
          stepResult: runningResult,
        });

        try {
          switch (step.action) {
            case "goto":
              await page.goto(step.targetValue ?? "", {
                waitUntil: "domcontentloaded",
                timeout: step.timeoutMs ?? 5000,
              });
              break;
            case "click":
              await page.click(step.targetValue ?? "", {
                timeout: step.timeoutMs ?? 5000,
              });
              break;
            case "fill":
              await page.fill(step.targetValue ?? "", step.inputValue ?? "", {
                timeout: step.timeoutMs ?? 5000,
              });
              break;
            case "select":
              await page.selectOption(step.targetValue ?? "", step.inputValue ?? "", {
                timeout: step.timeoutMs ?? 5000,
              });
              break;
            case "press":
              await page.press(step.targetValue ?? "body", step.inputValue ?? "Enter", {
                timeout: step.timeoutMs ?? 5000,
              });
              break;
            case "wait-for":
              if (step.targetType === "url" || step.targetType === "route") {
                await page.waitForURL(step.targetValue ?? "", {
                  timeout: step.timeoutMs ?? 5000,
                });
              } else {
                await page.waitForSelector(step.targetValue ?? "", {
                  timeout: step.timeoutMs ?? 5000,
                });
              }
              break;
            case "assert-text": {
              const text = await page.textContent(step.targetValue ?? "", {
                timeout: step.timeoutMs ?? 5000,
              });
              if (!text?.includes(step.expectedValue ?? "")) {
                throw new Error(
                  `Expected text "${step.expectedValue ?? ""}" in ${step.targetValue ?? ""}.`
                );
              }
              break;
            }
            case "assert-visible":
              await page.waitForSelector(step.targetValue ?? "", {
                state: "visible",
                timeout: step.timeoutMs ?? 5000,
              });
              break;
            case "assert-url":
              if (!page.url().includes(step.expectedValue ?? "")) {
                throw new Error(`Expected URL to include "${step.expectedValue ?? ""}".`);
              }
              break;
            case "assert-value": {
              const value = await page.inputValue(step.targetValue ?? "", {
                timeout: step.timeoutMs ?? 5000,
              });
              if (value !== (step.expectedValue ?? "")) {
                throw new Error(
                  `Expected value "${step.expectedValue ?? ""}" but received "${value}".`
                );
              }
              break;
            }
            default:
              throw new Error(`Unsupported Playwright step action: ${step.action}`);
          }

          const completedResult: AutomationStepResult = {
            stepId: step.id,
            sourceStepId: step.sourceStepId ?? step.id,
            stepIndex: index,
            action: step.action,
            status: "passed",
            targetValue: step.targetValue,
            message: "Step completed successfully.",
            logLines: pageLogs.slice(stepLogStartIndex),
            startedAt,
            finishedAt: Date.now(),
            durationMs: Date.now() - startedAt,
            origin: step.sourceOrigin,
            referenceId: step.sourceReferenceId,
            referenceLabel: step.sourceReferenceLabel,
          };
          stepResults.push(completedResult);
          await emitEvent({
            type: "step_success",
            caseId: context.caseId,
            scenarioId: context.scenarioId,
            scenarioName: context.scenarioName,
            dataSetId: context.dataSetId,
            dataSetName: context.dataSetName,
            stepId: step.id,
            sourceStepId: step.sourceStepId ?? step.id,
            stepIndex: index,
            message: completedResult.message,
            level: "success",
            stepResult: completedResult,
          });
        } catch (error) {
          const failureMessage =
            error instanceof Error ? error.message : "Playwright execution failed.";
          const failedResult: AutomationStepResult = {
            stepId: step.id,
            sourceStepId: step.sourceStepId ?? step.id,
            stepIndex: index,
            action: step.action,
            status: "failed",
            targetValue: step.targetValue,
            message: failureMessage,
            failureReason: failureMessage,
            logLines: pageLogs.slice(stepLogStartIndex),
            startedAt,
            finishedAt: Date.now(),
            durationMs: Date.now() - startedAt,
            origin: step.sourceOrigin,
            referenceId: step.sourceReferenceId,
            referenceLabel: step.sourceReferenceLabel,
          };
          stepResults.push(failedResult);
          const screenshotPath = path.join(context.outputDir, "failure.png");
          await page.screenshot({ path: screenshotPath, fullPage: true });
          await emitEvent({
            type: "step_failure",
            caseId: context.caseId,
            scenarioId: context.scenarioId,
            scenarioName: context.scenarioName,
            dataSetId: context.dataSetId,
            dataSetName: context.dataSetName,
            stepId: step.id,
            sourceStepId: step.sourceStepId ?? step.id,
            stepIndex: index,
            message: failureMessage,
            level: "error",
            failureMessage,
            stepResult: failedResult,
            artifact: {
              type: "screenshot",
              path: screenshotPath,
              metadataJson: {
                capturedAt: Date.now(),
                reason: "failure",
              },
            },
          });
          throw error;
        }
      }

      return {
        status: "passed",
        logs: pageLogs,
        stepResults,
        artifacts: [],
      };
    } catch (error) {
      const screenshotPath = path.join(context.outputDir, "failure.png");
      try {
        await page.screenshot({ path: screenshotPath, fullPage: true });
      } catch {
        // Ignore screenshot failures here; a step failure event may have already captured evidence.
      }

      return {
        status: "failed",
        logs: pageLogs,
        failureMessage:
          error instanceof Error ? error.message : "Playwright execution failed.",
        failureStepId: stepResults[stepResults.length - 1]?.stepId,
        stepResults,
        artifacts: [
          {
            id: `${context.executionId}-failure-screenshot`,
            type: "screenshot",
            path: screenshotPath,
            metadataJson: {
              capturedAt: Date.now(),
              reason: "failure",
            },
          },
        ],
      };
    } finally {
      await browser.close();
    }
  }
}
