import fs from "fs/promises";
import path from "path";
import { chromium } from "playwright";

const payloadPath = process.argv[2];

if (!payloadPath) {
  console.error("Missing automation debug payload path.");
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const payload = JSON.parse(await fs.readFile(payloadPath, "utf8"));
const { sessionId, scriptName, rowId, steps = [], outputDir } = payload;
const sessionPath = path.join(outputDir, "session.json");
const debugLogPath = path.join(outputDir, "debug.log");

await fs.mkdir(outputDir, { recursive: true });

const updateSession = async (updater) => {
  const current = JSON.parse(await fs.readFile(sessionPath, "utf8"));
  const next =
    typeof updater === "function"
      ? {
          ...current,
          ...updater(current),
        }
      : {
          ...current,
          ...updater,
        };
  next.updatedAt = Date.now();
  await fs.writeFile(sessionPath, JSON.stringify(next, null, 2), "utf8");
  await fs.writeFile(debugLogPath, (next.logs ?? []).join("\n"), "utf8");
  return next;
};

const appendLog = async (message) => {
  await updateSession((current) => ({
    logs: [...(current.logs ?? []), message],
  }));
};

const browser = await chromium.launch({
  headless: false,
  slowMo: 250,
});

const page = await browser.newPage();

page.on("console", (message) => {
  void appendLog(`[browser:${message.type()}] ${message.text()}`);
});

try {
  await updateSession({
    status: "running",
    logs: [
      `Starting visible browser debug for ${rowId} (${scriptName || "automation script"}).`,
    ],
  });

  for (const [index, step] of steps.entries()) {
    const startedAt = Date.now();
    const stepLabel = `Step ${index + 1}: ${step.action}${
      step.targetValue ? ` on ${step.targetValue}` : ""
    }`;

    await updateSession((current) => ({
      status: "running",
      currentStepId: step.id,
      currentSourceStepId: step.sourceStepId ?? step.id,
      currentStepIndex: index,
      logs: [...(current.logs ?? []), `Running ${stepLabel}`],
      stepResults: [
        ...(current.stepResults ?? []),
        {
          stepId: step.id,
          sourceStepId: step.sourceStepId ?? step.id,
          stepIndex: index,
          action: step.action,
          status: "running",
          targetValue: step.targetValue,
          message: "Step is currently running.",
          logLines: [`Running ${stepLabel}`],
          startedAt,
          origin: step.sourceOrigin,
          referenceId: step.sourceReferenceId,
          referenceLabel: step.sourceReferenceLabel,
        },
      ],
    }));

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
          throw new Error(`Unsupported Playwright debug step action: ${step.action}`);
      }

      await updateSession((current) => ({
        stepResults: (current.stepResults ?? []).map((result) =>
          result.stepId === step.id
            ? {
                ...result,
                status: "passed",
                message: "Step completed successfully.",
                finishedAt: Date.now(),
                durationMs: Date.now() - startedAt,
                logLines: [...(result.logLines ?? []), "Step completed successfully."],
              }
            : result
        ),
        logs: [...(current.logs ?? []), `${stepLabel} passed.`],
      }));
    } catch (error) {
      const failureMessage =
        error instanceof Error ? error.message : "Debug run failed.";
      const screenshotPath = path.join(outputDir, "debug-failure.png");
      await page.screenshot({ path: screenshotPath, fullPage: true });
      await updateSession((current) => ({
        status: "failed",
        currentStepId: step.id,
        currentSourceStepId: step.sourceStepId ?? step.id,
        currentStepIndex: index,
        finishedAt: Date.now(),
        failureMessage,
        stepResults: (current.stepResults ?? []).map((result) =>
          result.stepId === step.id
            ? {
                ...result,
                status: "failed",
                message: failureMessage,
                failureReason: failureMessage,
                finishedAt: Date.now(),
                durationMs: Date.now() - startedAt,
                logLines: [...(result.logLines ?? []), failureMessage],
              }
            : result
        ),
        logs: [...(current.logs ?? []), `Debug run failed: ${failureMessage}`],
      }));
      throw error;
    }
  }

  await updateSession((current) => ({
    status: "passed",
    currentStepId: undefined,
    currentSourceStepId: undefined,
    currentStepIndex: undefined,
    finishedAt: Date.now(),
    logs: [
      ...(current.logs ?? []),
      "Debug run completed. Browser will stay open until you close it.",
    ],
  }));
} catch (error) {
  if (!(error instanceof Error)) {
    await appendLog("Debug run failed.");
  }
}

while (browser.isConnected()) {
  const openPages = browser.contexts().flatMap((context) => context.pages());
  if (openPages.length === 0) {
    break;
  }
  await sleep(1000);
}

if (browser.isConnected()) {
  await browser.close();
}

await updateSession((current) => ({
  currentStepId: undefined,
  currentSourceStepId: undefined,
  currentStepIndex: undefined,
  finishedAt: current.finishedAt ?? Date.now(),
  logs: [
    ...(current.logs ?? []),
    `Debug session ${sessionId} closed.`,
  ],
}));
