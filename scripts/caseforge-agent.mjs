import http from "node:http";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

const config = {
  agentId: process.env.CASEFORGE_AGENT_ID || `agent-${os.hostname()}-${randomUUID().slice(0, 8)}`,
  agentName: process.env.CASEFORGE_AGENT_NAME || `${os.hostname()} caseForge Agent`,
  browserChannel: process.env.CASEFORGE_BROWSER_CHANNEL || undefined,
  headless: process.env.CASEFORGE_BROWSER_HEADLESS === "true",
  host: process.env.CASEFORGE_AGENT_HOST || "127.0.0.1",
  maxConcurrentJobs: Number(process.env.CASEFORGE_AGENT_CONCURRENCY || 1),
  port: Number(process.env.CASEFORGE_AGENT_PORT || 47391),
  serverUrl: (process.env.CASEFORGE_SERVER_URL || "http://localhost:3000").replace(/\/$/, ""),
};

const jobs = new Map();
const queue = [];
const recorder = {
  events: [],
  logs: [],
  recording: false,
  startedAt: null,
  stoppedAt: null,
};
let activeJobs = 0;
let registered = false;

function now() {
  return new Date().toISOString();
}

function json(response, status, payload) {
  response.writeHead(status, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function normalizeUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("URL is required.");
  }
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function createJob(payload) {
  if (!Array.isArray(payload.steps)) {
    throw new Error("Job payload must include a steps array.");
  }

  return {
    id: payload.id || `job-${randomUUID()}`,
    browser: payload.browser || {},
    createdAt: now(),
    endedAt: null,
    error: null,
    events: [],
    logs: [],
    scenarioId: payload.scenarioId || null,
    startedAt: null,
    status: "queued",
    steps: payload.steps,
  };
}

function publicJob(job) {
  return {
    id: job.id,
    scenarioId: job.scenarioId,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    endedAt: job.endedAt,
    error: job.error,
    logs: job.logs.slice(-200),
    events: job.events.slice(-200),
  };
}

function publicRecorder() {
  return {
    events: recorder.events.slice(-500),
    logs: recorder.logs.slice(-200),
    recording: recorder.recording,
    startedAt: recorder.startedAt,
    stoppedAt: recorder.stoppedAt,
  };
}

async function postToBackend(path, payload) {
  try {
    const response = await fetch(`${config.serverUrl}${path}`, {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function registerAgent() {
  registered = await postToBackend("/api/automation/agents/register", {
    agentId: config.agentId,
    agentName: config.agentName,
    concurrency: config.maxConcurrentJobs,
    host: os.hostname(),
    startedAt: now(),
  });
}

async function heartbeat() {
  await postToBackend("/api/automation/agents/heartbeat", {
    activeJobs,
    agentId: config.agentId,
    agentName: config.agentName,
    queuedJobs: queue.length,
    registered,
    timestamp: now(),
  });
}

async function emit(job, type, data = {}) {
  const event = {
    agentId: config.agentId,
    data,
    jobId: job.id,
    scenarioId: job.scenarioId,
    timestamp: now(),
    type,
  };
  job.events.push(event);
  if (type === "log") {
    job.logs.push(String(data.message || ""));
  }
  await postToBackend("/api/automation/agents/events", event);
}

function frameScopeFor(page, step) {
  const frameUrl = step.options?.frameUrl || "";
  const frameName = step.options?.frameName || "";
  if (!frameUrl && !frameName) return page;

  const frames = page.frames();
  if (frameName) {
    const namedFrame = frames.find((frame) => frame.name() === frameName);
    if (namedFrame) return namedFrame;
  }
  if (frameUrl) {
    const exactFrame = frames.find((frame) => frame.url() === frameUrl);
    if (exactFrame) return exactFrame;
    const partialFrame = frames.find((frame) => {
      const url = frame.url();
      return url && (url.includes(frameUrl) || frameUrl.includes(url));
    });
    if (partialFrame) return partialFrame;
  }
  return page;
}

function locatorFor(page, step) {
  const scope = frameScopeFor(page, step);
  const target = step.target || {};
  const value = target.value || step.locatorValue || "";
  const locatorType = target.locatorType || step.locatorType || "css";

  if (!value && !["goto", "reload", "goBack", "goForward", "waitForTimeout", "executeScript"].includes(step.action)) {
    throw new Error(`Step ${step.id || step.action} is missing a locator.`);
  }

  if (locatorType === "text") return scope.getByText(value).first();
  if (locatorType === "aria-label" || locatorType === "label") return scope.getByLabel(value).first();
  if (locatorType === "placeholder") return scope.getByPlaceholder(value).first();
  if (locatorType === "role") {
    const separator = value.indexOf(":");
    const role = separator >= 0 ? value.slice(0, separator) : value;
    const name = separator >= 0 ? value.slice(separator + 1) : "";
    return scope.getByRole(role, name ? { name } : undefined).first();
  }
  if (locatorType === "id") return scope.locator(`#${value}`).first();
  if (locatorType === "xpath") return scope.locator(`xpath=${value}`).first();
  return scope.locator(value).first();
}

async function executeStep(page, step) {
  const action = step.action;
  const options = step.options || {};
  const timeout = Number(options.timeout || 10000);
  const inputValue = step.inputValue ?? "";
  const expectedValue = step.expectedValue ?? "";

  if (action === "goto") {
    await page.goto(normalizeUrl(inputValue || step.target?.value), {
      timeout,
      waitUntil: "domcontentloaded",
    });
    return;
  }
  if (action === "reload") {
    await page.reload({ timeout, waitUntil: "domcontentloaded" });
    return;
  }
  if (action === "goBack") {
    await page.goBack({ timeout, waitUntil: "domcontentloaded" });
    return;
  }
  if (action === "goForward") {
    await page.goForward({ timeout, waitUntil: "domcontentloaded" });
    return;
  }
  if (action === "waitForTimeout") {
    await page.waitForTimeout(Number(options.duration || inputValue || 1000));
    return;
  }
  if (action === "waitForNavigation") {
    await page.waitForLoadState("domcontentloaded", { timeout });
    return;
  }
  if (action === "executeScript") {
    await page.evaluate(String(inputValue || ""));
    return;
  }
  if (action === "scroll") {
    await page.mouse.wheel(0, Number(inputValue || options.deltaY || 600));
    return;
  }
  if (action === "coordinateClick") {
    await page.mouse.click(Number(options.x || 0), Number(options.y || 0));
    return;
  }

  const locator = locatorFor(page, step);

  if (action === "click") await locator.click({ force: Boolean(options.force), timeout });
  else if (action === "doubleClick") await locator.dblclick({ force: Boolean(options.force), timeout });
  else if (action === "rightClick") await locator.click({ button: "right", force: Boolean(options.force), timeout });
  else if (action === "hover") await locator.hover({ timeout });
  else if (action === "scrollIntoView") await locator.scrollIntoViewIfNeeded({ timeout });
  else if (action === "focus") await locator.focus({ timeout });
  else if (action === "blur") await locator.evaluate((element) => element.blur());
  else if (action === "fill") await locator.fill(String(inputValue), { timeout });
  else if (action === "clear") await locator.clear({ timeout });
  else if (action === "type") await locator.pressSequentially(String(inputValue), { timeout });
  else if (action === "press") await locator.press(String(inputValue || "Enter"), { timeout });
  else if (action === "upload") await locator.setInputFiles(String(inputValue));
  else if (action === "select") await locator.selectOption(String(inputValue), { timeout });
  else if (action === "check") await locator.check({ force: Boolean(options.force), timeout });
  else if (action === "uncheck") await locator.uncheck({ force: Boolean(options.force), timeout });
  else if (action === "waitForElement") await locator.waitFor({ state: "visible", timeout });
  else if (action === "assert" || action.startsWith("assert")) {
    const assertion = step.assertionType || action;
    if (assertion.includes("hidden")) await locator.waitFor({ state: "hidden", timeout });
    else if (assertion.includes("exists")) await locator.waitFor({ state: "attached", timeout });
    else if (assertion.includes("enabled")) {
      if (!(await locator.isEnabled({ timeout }))) throw new Error("Expected element to be enabled.");
    }
    else if (assertion.includes("disabled")) {
      if (await locator.isEnabled({ timeout })) throw new Error("Expected element to be disabled.");
    }
    else if (assertion.includes("unchecked")) {
      if (await locator.isChecked({ timeout })) throw new Error("Expected element to be unchecked.");
    }
    else if (assertion.includes("checked")) {
      if (!(await locator.isChecked({ timeout }))) throw new Error("Expected element to be checked.");
    }
    else if (assertion.includes("attribute equals")) {
      const attributeName = step.options?.attributeName || "src";
      const actual =
        attributeName === "value"
          ? await locator.inputValue({ timeout })
          : await locator.getAttribute(attributeName, { timeout });
      if (actual !== expectedValue) throw new Error(`Expected ${attributeName} "${expectedValue}", got "${actual}".`);
    }
    else if (assertion.includes("attribute contains")) {
      const attributeName = step.options?.attributeName || "class";
      const actual = (await locator.getAttribute(attributeName, { timeout })) || "";
      if (!actual.includes(expectedValue)) throw new Error(`Expected ${attributeName} to contain "${expectedValue}", got "${actual}".`);
    }
    else if (assertion.includes("CSS property equals")) {
      const property = step.options?.cssProperty || "color";
      const actual = await locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
      if (expectedValue && actual.trim() !== expectedValue) throw new Error(`Expected CSS ${property} "${expectedValue}", got "${actual.trim()}".`);
    }
    else if (assertion.includes("text equals")) {
      const text = (await locator.innerText({ timeout })).trim();
      if (text !== expectedValue) throw new Error(`Expected text "${expectedValue}", got "${text}".`);
    } else if (assertion.includes("text contains")) {
      const text = await locator.innerText({ timeout });
      if (!text.includes(expectedValue)) throw new Error(`Expected text to contain "${expectedValue}", got "${text}".`);
    } else if (assertion.includes("URL equals")) {
      if (page.url() !== expectedValue) throw new Error(`Expected URL "${expectedValue}", got "${page.url()}".`);
    } else if (assertion.includes("title equals")) {
      const title = await page.title();
      if (title !== expectedValue) throw new Error(`Expected title "${expectedValue}", got "${title}".`);
    } else {
      await locator.waitFor({ state: "visible", timeout });
    }
  } else {
    throw new Error(`Unsupported action: ${action}`);
  }
}

async function runJob(job) {
  activeJobs += 1;
  job.status = "running";
  job.startedAt = now();
  await emit(job, "job:start", { steps: job.steps.length });

  let browser;
  try {
    browser = await chromium.launch({
      channel: job.browser.channel || config.browserChannel,
      headless: job.browser.headless ?? config.headless,
    });
    const page = await browser.newPage({
      viewport: job.browser.viewport || { height: 768, width: 1366 },
    });

    page.on("console", (message) => {
      void emit(job, "log", { message: `[browser:${message.type()}] ${message.text()}` });
    });

    for (const [index, step] of job.steps.entries()) {
      await emit(job, "step:start", { index, step });
      try {
        await executeStep(page, step);
        await emit(job, "step:success", { index, stepId: step.id || null });
      } catch (error) {
        await emit(job, "step:failure", {
          error: error instanceof Error ? error.message : "Step failed.",
          index,
          stepId: step.id || null,
        });
        throw error;
      }
    }

    job.status = "passed";
    await emit(job, "job:success");
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : "Execution failed.";
    await emit(job, "job:failure", { error: job.error });
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    job.endedAt = now();
    activeJobs -= 1;
    dispatch();
  }
}

function dispatch() {
  while (activeJobs < config.maxConcurrentJobs && queue.length > 0) {
    const jobId = queue.shift();
    const job = jobs.get(jobId);
    if (job?.status === "queued") {
      void runJob(job);
    }
  }
}

async function handleRequest(request, response) {
  const url = new URL(request.url || "/", `http://${config.host}:${config.port}`);

  if (request.method === "OPTIONS") {
    json(response, 204, {});
    return;
  }
  if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/status")) {
    json(response, 200, {
      activeJobs,
      agentId: config.agentId,
      agentName: config.agentName,
      concurrency: config.maxConcurrentJobs,
      ok: true,
      queuedJobs: queue.length,
      recorder: {
        eventCount: recorder.events.length,
        recording: recorder.recording,
      },
      registered,
      serverUrl: config.serverUrl,
    });
    return;
  }
  if (request.method === "GET" && url.pathname === "/record/status") {
    json(response, 200, publicRecorder());
    return;
  }
  if (request.method === "POST" && url.pathname === "/record/start") {
    const payload = await readJson(request);
    recorder.recording = true;
    recorder.startedAt = now();
    recorder.stoppedAt = null;
    if (payload.clear !== false) {
      recorder.events = [];
      recorder.logs = [];
    }
    recorder.logs.push(`Recording started at ${recorder.startedAt}`);
    json(response, 200, publicRecorder());
    return;
  }
  if (request.method === "POST" && url.pathname === "/record/stop") {
    recorder.recording = false;
    recorder.stoppedAt = now();
    recorder.logs.push(`Recording stopped at ${recorder.stoppedAt}`);
    json(response, 200, publicRecorder());
    return;
  }
  if (request.method === "POST" && url.pathname === "/record/clear") {
    recorder.events = [];
    recorder.logs = [];
    json(response, 200, publicRecorder());
    return;
  }
  if (request.method === "GET" && url.pathname === "/record/events") {
    json(response, 200, publicRecorder());
    return;
  }
  if (request.method === "POST" && url.pathname === "/record/event") {
    const payload = await readJson(request);
    if (!recorder.recording) {
      json(response, 202, { accepted: false, reason: "recording-inactive" });
      return;
    }
    const event = {
      id: payload.id || `record-${randomUUID()}`,
      assertionType: payload.assertionType || "",
      commandAction: payload.commandAction || "",
      commandError: payload.commandError || "",
      commandLabel: payload.commandLabel || "",
      commandStatus: payload.commandStatus || "",
      expectedValue: payload.expectedValue || "",
      frameUrl: payload.frameUrl || "",
      inFrame: Boolean(payload.inFrame),
      timestamp: payload.timestamp || Date.now(),
      type: payload.type || "unknown",
      url: payload.url || "",
      value: payload.value || "",
      key: payload.key || "",
      element: payload.element || null,
      locatorCandidates: Array.isArray(payload.locatorCandidates) ? payload.locatorCandidates : [],
      recommendedLocator: payload.recommendedLocator || null,
      options: payload.options && typeof payload.options === "object" ? payload.options : {},
    };
    recorder.events.push(event);
    recorder.logs.push(`Captured ${event.type} on ${event.url}`);
    json(response, 202, { accepted: true, eventCount: recorder.events.length });
    return;
  }
  if (request.method === "GET" && url.pathname === "/jobs") {
    json(response, 200, { jobs: Array.from(jobs.values()).map(publicJob) });
    return;
  }
  if (request.method === "POST" && url.pathname === "/jobs") {
    const job = createJob(await readJson(request));
    jobs.set(job.id, job);
    queue.push(job.id);
    await emit(job, "job:queued", { queueDepth: queue.length });
    dispatch();
    json(response, 202, publicJob(job));
    return;
  }
  const jobMatch = url.pathname.match(/^\/jobs\/([^/]+)$/);
  if (request.method === "GET" && jobMatch) {
    const job = jobs.get(decodeURIComponent(jobMatch[1]));
    if (!job) {
      json(response, 404, { error: "Job not found." });
      return;
    }
    json(response, 200, publicJob(job));
    return;
  }

  json(response, 404, { error: "Not found." });
}

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    json(response, 500, {
      error: error instanceof Error ? error.message : "Agent request failed.",
    });
  });
});

server.listen(config.port, config.host, async () => {
  console.log(`caseForge automation agent listening at http://${config.host}:${config.port}`);
  console.log(`Agent: ${config.agentName} (${config.agentId})`);
  console.log(`Backend: ${config.serverUrl}`);
  await registerAgent();
  await heartbeat();
  setInterval(heartbeat, 15000);
});
