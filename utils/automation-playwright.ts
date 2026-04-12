import path from "path";
import type { AutomationProviderAdapter } from "./automation-provider";
import type {
  AutomationExecutionResult,
  AutomationValidationResult,
} from "./automation-provider";
import type { AutomationStep } from "./workspace";

const SUPPORTED_ACTIONS = new Set([
  "goto",
  "click",
  "fill",
  "press",
  "wait-for",
  "assert-text",
  "assert-visible",
  "assert-url",
  "assert-value",
]);

export class PlaywrightAdapter implements AutomationProviderAdapter {
  provider = "playwright" as const;

  validate(steps: AutomationStep[]): AutomationValidationResult {
    const errors: string[] = [];

    if (steps.length === 0) {
      errors.push("Add at least one automation step before validation.");
    }

    steps.forEach((step, index) => {
      const stepLabel = `Step ${index + 1}`;
      if (!SUPPORTED_ACTIONS.has(step.action)) {
        errors.push(`${stepLabel} uses unsupported action "${step.action}".`);
      }

      if ((step.action === "goto" || step.targetType === "url") && !step.targetValue) {
        errors.push(`${stepLabel} is missing a target URL.`);
      }

      if (
        ["click", "fill", "assert-text", "assert-visible", "assert-value"].includes(
          step.action
        ) &&
        !step.targetValue
      ) {
        errors.push(`${stepLabel} is missing a selector or target value.`);
      }

      if (step.action === "fill" && typeof step.inputValue !== "string") {
        errors.push(`${stepLabel} needs an input value for fill.`);
      }

      if (
        ["assert-text", "assert-url", "assert-value"].includes(step.action) &&
        typeof step.expectedValue !== "string"
      ) {
        errors.push(`${stepLabel} needs an expected value.`);
      }
    });

    return { valid: errors.length === 0, errors };
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
        artifacts: [],
      };
    }

    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      headless: context.executionMode !== "headed",
    });
    const pageLogs: string[] = [];
    const page = await browser.newPage();
    const executableSteps = this.transformStepsToExecutable(steps) as AutomationStep[];

    page.on("console", (message) => {
      pageLogs.push(`[browser:${message.type()}] ${message.text()}`);
    });

    try {
      for (const step of executableSteps) {
        pageLogs.push(`Running ${step.action}${step.targetValue ? ` on ${step.targetValue}` : ""}`);

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
          case "press":
            await page.press(step.targetValue ?? "body", step.inputValue ?? "Enter", {
              timeout: step.timeoutMs ?? 5000,
            });
            break;
          case "wait-for":
            if (step.targetType === "url") {
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
      }

      return {
        status: "passed",
        logs: pageLogs,
        artifacts: [],
      };
    } catch (error) {
      const screenshotPath = path.join(context.outputDir, "failure.png");
      await page.screenshot({ path: screenshotPath, fullPage: true });

      return {
        status: "failed",
        logs: pageLogs,
        failureMessage:
          error instanceof Error ? error.message : "Playwright execution failed.",
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
