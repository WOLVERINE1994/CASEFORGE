import fs from "fs/promises";
import path from "path";
import { chromium } from "playwright";

const payloadPath = process.argv[2];

if (!payloadPath) {
  console.error("Missing automation record payload path.");
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const payload = JSON.parse(await fs.readFile(payloadPath, "utf8"));
const { sessionId, scriptName, rowId, outputDir, initialUrl } = payload;
const sessionPath = path.join(outputDir, "session.json");
const recordLogPath = path.join(outputDir, "record.log");

await fs.mkdir(outputDir, { recursive: true });

const readSession = async () =>
  JSON.parse(await fs.readFile(sessionPath, "utf8"));

const updateSession = async (updater) => {
  const current = await readSession();
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
  await fs.writeFile(recordLogPath, (next.logs ?? []).join("\n"), "utf8");
  return next;
};

const appendLog = async (message) => {
  await updateSession((current) => ({
    logs: [...(current.logs ?? []), message],
  }));
};

const shouldStop = async () => {
  try {
    const session = await readSession();
    return session.status === "stopping" || session.status === "stopped";
  } catch {
    return true;
  }
};

const sanitizeEvent = (event) => {
  const timestamp = typeof event?.timestamp === "number" ? event.timestamp : Date.now();
  const baseEvent = {
    id:
      typeof event?.id === "string" && event.id.trim()
        ? event.id
        : `${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp,
  };

  switch (event?.type) {
    case "goto":
      return event.url
        ? {
            ...baseEvent,
            type: "goto",
            url: String(event.url),
            label: typeof event?.label === "string" ? event.label : undefined,
          }
        : null;
    case "click":
      return event.selector
        ? {
            ...baseEvent,
            type: "click",
            selector: String(event.selector),
            label: typeof event?.label === "string" ? event.label : undefined,
          }
        : null;
    case "fill":
      return event.selector
        ? {
            ...baseEvent,
            type: "fill",
            selector: String(event.selector),
            value: typeof event?.value === "string" ? event.value : "",
            label: typeof event?.label === "string" ? event.label : undefined,
          }
        : null;
    case "select":
      return event.selector
        ? {
            ...baseEvent,
            type: "select",
            selector: String(event.selector),
            value: typeof event?.value === "string" ? event.value : "",
            label: typeof event?.label === "string" ? event.label : undefined,
          }
        : null;
    case "press":
      return event.key
        ? {
            ...baseEvent,
            type: "press",
            selector:
              typeof event?.selector === "string" && event.selector.trim()
                ? event.selector
                : "body",
            key: String(event.key),
            label: typeof event?.label === "string" ? event.label : undefined,
          }
        : null;
    default:
      return null;
  }
};

const mergeRecordedEvent = (events, event) => {
  if (events.length === 0) {
    return [event];
  }

  const nextEvents = [...events];
  const lastEvent = nextEvents[nextEvents.length - 1];

  if (
    event.type === "goto" &&
    lastEvent.type === "goto" &&
    lastEvent.url === event.url
  ) {
    return nextEvents;
  }

  if (
    event.type === "fill" &&
    lastEvent.type === "fill" &&
    lastEvent.selector === event.selector
  ) {
    nextEvents[nextEvents.length - 1] = {
      ...lastEvent,
      ...event,
      id: lastEvent.id,
    };
    return nextEvents;
  }

  if (
    event.type === "select" &&
    lastEvent.type === "select" &&
    lastEvent.selector === event.selector
  ) {
    nextEvents[nextEvents.length - 1] = {
      ...lastEvent,
      ...event,
      id: lastEvent.id,
    };
    return nextEvents;
  }

  if (
    event.type === "click" &&
    lastEvent.type === "click" &&
    lastEvent.selector === event.selector &&
    event.timestamp - lastEvent.timestamp < 800
  ) {
    return nextEvents;
  }

  if (
    event.type === "press" &&
    lastEvent.type === "press" &&
    lastEvent.selector === event.selector &&
    lastEvent.key === event.key &&
    event.timestamp - lastEvent.timestamp < 800
  ) {
    return nextEvents;
  }

  return [...nextEvents, event];
};

const buildStepDescription = (event) => {
  const label = event.label ? `"${event.label}"` : null;
  switch (event.type) {
    case "goto":
      return `Navigate to ${event.url}`;
    case "click":
      return label ? `Click ${label}` : `Click ${event.selector}`;
    case "fill":
      return label ? `Enter ${label}` : `Enter value in ${event.selector}`;
    case "select":
      return label
        ? `Select "${event.value || "option"}" in ${label}`
        : `Select "${event.value || "option"}" in ${event.selector}`;
    case "press":
      return `Press ${event.key} on ${event.selector}`;
    default:
      return "Recorded step";
  }
};

const buildGeneratedSteps = (events) =>
  events.map((event, index) => {
    const common = {
      id: event.id,
      scriptId: `recording-${sessionId}`,
      order: index,
      timeoutMs: event.type === "goto" ? 10000 : 5000,
      metaJson: {
        description: buildStepDescription(event),
      },
    };

    switch (event.type) {
      case "goto":
        return {
          ...common,
          action: "goto",
          targetType: "url",
          targetValue: event.url,
        };
      case "click":
        return {
          ...common,
          action: "click",
          targetType: "selector",
          targetValue: event.selector,
        };
      case "fill":
        return {
          ...common,
          action: "fill",
          targetType: "selector",
          targetValue: event.selector,
          inputValue: event.value,
        };
      case "select":
        return {
          ...common,
          action: "select",
          targetType: "selector",
          targetValue: event.selector,
          inputValue: event.value,
        };
      case "press":
        return {
          ...common,
          action: "press",
          targetType: "selector",
          targetValue: event.selector || "body",
          inputValue: event.key,
        };
      default:
        return {
          ...common,
          action: "click",
          targetType: "selector",
          targetValue: "body",
        };
    }
  });

const formatEventLog = (event) => {
  switch (event.type) {
    case "goto":
      return `Captured navigation to ${event.url}`;
    case "click":
      return `Captured click on ${event.selector}`;
    case "fill":
      return `Captured fill on ${event.selector}`;
    case "select":
      return `Captured select on ${event.selector}`;
    case "press":
      return `Captured ${event.key} on ${event.selector}`;
    default:
      return "Captured browser interaction.";
  }
};

const pushRecordedEvent = async (rawEvent) => {
  const event = sanitizeEvent(rawEvent);
  if (!event || (await shouldStop())) {
    return;
  }

  await updateSession((current) => {
    const events = mergeRecordedEvent(current.events ?? [], event);
    return {
      status: current.status === "starting" ? "recording" : current.status,
      events,
      generatedSteps: buildGeneratedSteps(events),
      logs: [...(current.logs ?? []), formatEventLog(event)],
    };
  });
};

const browser = await chromium.launch({
  headless: false,
  slowMo: 120,
});

const context = await browser.newContext();

await context.exposeBinding("__automationRecorderRecord", async (_source, event) => {
  await pushRecordedEvent(event);
});

await context.addInitScript(`
  (() => {
    if (window.__automationRecorderInstalled) {
      return;
    }
    window.__automationRecorderInstalled = true;

    const safeInvoke = (payload) => {
      if (typeof window.__automationRecorderRecord === "function") {
        window.__automationRecorderRecord(payload).catch(() => undefined);
      }
    };

    const cssEscape = (value) => {
      if (window.CSS && typeof window.CSS.escape === "function") {
        return window.CSS.escape(value);
      }
      return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\\\$&");
    };

    const buildSelector = (input) => {
      const element = input instanceof Element ? input : null;
      if (!element) {
        return "";
      }

      const testId =
        element.getAttribute("data-testid") ||
        element.getAttribute("data-test") ||
        element.getAttribute("data-qa");
      if (testId) {
        const attrName = element.getAttribute("data-testid")
          ? "data-testid"
          : element.getAttribute("data-test")
            ? "data-test"
            : "data-qa";
        return \`[\${attrName}="\${testId.replace(/"/g, '\\\\"')}"]\`;
      }

      if (element.id) {
        return \`#\${cssEscape(element.id)}\`;
      }

      const name = element.getAttribute("name");
      if (name) {
        return \`[name="\${name.replace(/"/g, '\\\\"')}"]\`;
      }

      const ariaLabel = element.getAttribute("aria-label");
      if (ariaLabel) {
        return \`[aria-label="\${ariaLabel.replace(/"/g, '\\\\"')}"]\`;
      }

      const path = [];
      let current = element;
      while (current && current.nodeType === Node.ELEMENT_NODE && path.length < 4) {
        let segment = current.tagName.toLowerCase();
        const className =
          typeof current.className === "string"
            ? current.className.trim().split(/\\s+/).filter(Boolean)[0]
            : "";
        if (className) {
          segment += \`.\${cssEscape(className)}\`;
        } else {
          const siblings = current.parentElement
            ? Array.from(current.parentElement.children).filter(
                (candidate) => candidate.tagName === current.tagName
              )
            : [];
          if (siblings.length > 1) {
            segment += \`:nth-of-type(\${siblings.indexOf(current) + 1})\`;
          }
        }
        path.unshift(segment);
        current = current.parentElement;
      }

      return path.join(" > ");
    };

    const resolveTarget = (eventTarget) => {
      if (!(eventTarget instanceof Element)) {
        return null;
      }
      return (
        eventTarget.closest(
          "button, a, input, select, textarea, [role='button'], [data-testid], [data-test], [data-qa], [name], [id], label"
        ) || eventTarget
      );
    };

    const readLabel = (element) => {
      if (!(element instanceof Element)) {
        return "";
      }
      return (
        element.getAttribute("aria-label") ||
        element.getAttribute("name") ||
        element.textContent?.trim() ||
        ""
      )
        .replace(/\\s+/g, " ")
        .slice(0, 80);
    };

    document.addEventListener(
      "click",
      (event) => {
        const target = resolveTarget(event.target);
        if (!target) {
          return;
        }

        const selector = buildSelector(target);
        if (!selector) {
          return;
        }

        safeInvoke({
          type: "click",
          selector,
          label: readLabel(target),
          timestamp: Date.now(),
        });
      },
      true
    );

    document.addEventListener(
      "change",
      (event) => {
        const target = event.target;
        if (
          !(target instanceof HTMLInputElement) &&
          !(target instanceof HTMLTextAreaElement) &&
          !(target instanceof HTMLSelectElement)
        ) {
          return;
        }

        if (target instanceof HTMLInputElement && ["checkbox", "radio", "file"].includes(target.type)) {
          return;
        }

        const selector = buildSelector(target);
        if (!selector) {
          return;
        }

        safeInvoke({
          type: target instanceof HTMLSelectElement ? "select" : "fill",
          selector,
          value: target.value,
          label: readLabel(target),
          timestamp: Date.now(),
        });
      },
      true
    );

    document.addEventListener(
      "keydown",
      (event) => {
        if (!["Enter", "Escape", "Tab"].includes(event.key)) {
          return;
        }

        const target =
          resolveTarget(event.target) ||
          (document.body instanceof Element ? document.body : null);
        const selector = buildSelector(target || document.body);
        if (!selector) {
          return;
        }

        safeInvoke({
          type: "press",
          selector,
          key: event.key,
          label: readLabel(target),
          timestamp: Date.now(),
        });
      },
      true
    );
  })();
`);

const page = await context.newPage();

page.on("console", (message) => {
  void appendLog(`[browser:${message.type()}] ${message.text()}`);
});

page.on("framenavigated", (frame) => {
  if (frame !== page.mainFrame()) {
    return;
  }

  const url = frame.url();
  if (!url || url.startsWith("about:blank")) {
    return;
  }

  void pushRecordedEvent({
    type: "goto",
    url,
    label: "Browser navigation",
    timestamp: Date.now(),
  });
});

try {
  await updateSession((current) => ({
    status: "recording",
    logs: [
      ...(current.logs ?? []),
      `Recorder opened for ${rowId} (${scriptName || "automation script"}).`,
      "Use the browser to click, type, and navigate. Stop recording from the workspace when done.",
    ],
  }));

  if (initialUrl) {
    try {
      await page.goto(initialUrl, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : "Failed to open the recorder start URL.";
      await appendLog(message);
    }
  }

  while (browser.isConnected()) {
    if (await shouldStop()) {
      break;
    }

    const openPages = browser.contexts().flatMap((browserContext) => browserContext.pages());
    if (openPages.length === 0) {
      break;
    }

    await sleep(1000);
  }
} catch (error) {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message
      : "Recorder session failed.";
  await updateSession((current) => ({
    status: "failed",
    finishedAt: Date.now(),
    failureMessage: message,
    logs: [...(current.logs ?? []), message],
  }));
}

const finalSession = await readSession().catch(() => null);

if (browser.isConnected()) {
  await browser.close();
}

if (finalSession?.status !== "failed") {
  await updateSession((current) => ({
    status: "stopped",
    finishedAt: current.finishedAt ?? Date.now(),
    logs: [
      ...(current.logs ?? []),
      `Recorder session ${sessionId} closed with ${(current.events ?? []).length} captured interaction${(current.events ?? []).length === 1 ? "" : "s"}.`,
    ],
  }));
}
