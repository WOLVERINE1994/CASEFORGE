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
const { scriptName, rowId, steps = [], outputDir } = payload;

await fs.mkdir(outputDir, { recursive: true });

const logs = [];
const log = async (message) => {
  logs.push(message);
  await fs.writeFile(path.join(outputDir, "debug.log"), logs.join("\n"), "utf8");
};

const browser = await chromium.launch({
  headless: false,
  slowMo: 150,
});

const page = await browser.newPage();

page.on("console", (message) => {
  logs.push(`[browser:${message.type()}] ${message.text()}`);
});

try {
  await log(`Starting visible browser debug for ${rowId} (${scriptName || "automation script"}).`);

  for (const step of steps) {
    await log(
      `Running ${step.action}${step.targetValue ? ` on ${step.targetValue}` : ""}`
    );

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
        throw new Error(`Unsupported Playwright debug step action: ${step.action}`);
    }
  }

  await log("Debug run completed. Browser will stay open until you close it.");
} catch (error) {
  const screenshotPath = path.join(outputDir, "debug-failure.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await log(
    error instanceof Error
      ? `Debug run failed: ${error.message}`
      : "Debug run failed."
  );
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
