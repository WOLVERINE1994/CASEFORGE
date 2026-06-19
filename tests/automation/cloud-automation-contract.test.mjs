import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const automationStoreSource = readFileSync(
  new URL("../../utils/automation/store.ts", import.meta.url),
  "utf8",
);
const locatorPolicySource = readFileSync(
  new URL("../../utils/automation/locator-policy.ts", import.meta.url),
  "utf8",
);

const preferredLocatorOrder = [
  "role",
  "label",
  "text",
  "alt",
  "title",
  "testid",
  "placeholder",
  "css",
  "xpath",
];

function rankLocators(candidates) {
  return [...candidates]
    .sort(
      (left, right) =>
        preferredLocatorOrder.indexOf(left.strategy) -
          preferredLocatorOrder.indexOf(right.strategy) ||
        Number(right.isUnique) - Number(left.isUnique) ||
        right.score - left.score,
    )
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

function createMemoryAutomationStore() {
  const scenarios = new Map();
  const actions = new Map();
  const sessions = new Map();
  const runs = new Map();
  const artifactsByRun = new Map();

  return {
    createScenario(projectId, name) {
      const scenario = {
        description: "",
        id: `scenario-${scenarios.size + 1}`,
        name,
        projectId,
        status: "draft",
        steps: [],
        tags: [],
        updatedAt: new Date().toISOString(),
        version: 1,
      };
      scenarios.set(scenario.id, scenario);
      return scenario;
    },
    deleteScenario(scenarioId) {
      return scenarios.delete(scenarioId);
    },
    importLegacyScenarios(projectId, legacyScenarios) {
      return legacyScenarios.map((legacy) => {
        const scenario = this.createScenario(projectId, legacy.name);
        scenario.steps = legacy.steps ?? [];
        scenario.version += 1;
        return scenario;
      });
    },
    replaceScenarioSteps(scenarioId, steps) {
      const scenario = scenarios.get(scenarioId);
      scenario.steps = steps.map((step) => ({
        ...step,
        locatorCandidates: rankLocators(step.locatorCandidates ?? []),
      }));
      scenario.version += 1;
      scenario.updatedAt = new Date().toISOString();
      return scenario;
    },
    createActionFromSteps(projectId, scenarioId, name, stepIds) {
      const scenario = scenarios.get(scenarioId);
      const selected = scenario.steps.filter((step) => stepIds.includes(step.id));
      const action = {
        id: `action-${actions.size + 1}`,
        name,
        projectId,
        steps: selected,
        version: 1,
      };
      actions.set(action.id, action);
      return action;
    },
    createSession(projectId, provider = "managed_browser") {
      const session = {
        eventStreamUrl: "https://browser.example/events/session-1",
        id: `session-${sessions.size + 1}`,
        liveViewUrl: "https://browser.example/live/session-1",
        projectId,
        provider,
        status: "ready",
      };
      sessions.set(session.id, session);
      return session;
    },
    createRun(projectId, scenarioId, artifactInputs) {
      const run = {
        id: `run-${runs.size + 1}`,
        projectId,
        scenarioId,
        summary: { healingEvents: [] },
        status: "queued",
      };
      runs.set(run.id, run);
      artifactsByRun.set(run.id, artifactInputs);
      return run;
    },
    appendHealingEvent(runId, event) {
      const run = runs.get(runId);
      run.summary.healingEvents.push({ ...event, id: event.id || `heal-${run.summary.healingEvents.length + 1}` });
      return run;
    },
    acceptHealedLocator(scenarioId, runId, healingEventId) {
      const scenario = scenarios.get(scenarioId);
      const run = runs.get(runId);
      const event = run.summary.healingEvents.find((item) => item.id === healingEventId);
      const step = scenario.steps.find((item) => item.id === event.stepId);
      const oldPrimary = { strategy: step.target.locatorType, value: step.target.value };
      step.target = {
        ...step.target,
        locatorType: event.healedLocator.type,
        type: "smart",
        value: event.healedLocator.value,
      };
      step.locatorCandidates = rankLocators([
        ...(step.locatorCandidates ?? []),
        { ...oldPrimary, score: event.confidenceScore ?? 0, source: "previous_primary" },
      ]);
      event.status = "accepted";
      event.userAccepted = true;
      return step;
    },
    listRunArtifacts(runId) {
      return artifactsByRun.get(runId) ?? [];
    },
  };
}

test("session creation defaults to a managed cloud browser provider", () => {
  const store = createMemoryAutomationStore();
  const session = store.createSession("project-1");

  assert.equal(session.provider, "managed_browser");
  assert.equal(session.status, "ready");
  assert.equal(session.id, "session-1");
  assert.match(session.liveViewUrl, /^https:\/\/browser\.example\/live/);
  assert.match(session.eventStreamUrl, /^https:\/\/browser\.example\/events/);
});

test("provider completed session status is normalized before database enum writes", () => {
  assert.match(automationStoreSource, /function databaseSessionStatus\(status\?: string \| null\)/);
  assert.match(automationStoreSource, /status === "completed"/);
  assert.match(automationStoreSource, /return "ready"/);
  assert.doesNotMatch(automationStoreSource, /return status \?\? "requested"/);
});

test("scenario step replacement uses bulk inserts to avoid Prisma transaction timeouts", () => {
  assert.match(automationStoreSource, /const locatorCandidates = normalizedSteps\.flatMap/);
  assert.match(
    automationStoreSource,
    /for \(const stepChunk of chunks\([\s\S]*normalizedSteps\.map\(\(step, index\) => \(\{ index, step \}\)\),[\s\S]*INSERT_CHUNK_SIZE/,
  );
  assert.match(automationStoreSource, /INSERT INTO "AutomationStep"[\s\S]*VALUES \$\{Prisma\.join/);
  assert.match(automationStoreSource, /for \(const locatorChunk of chunks\(locatorCandidates, INSERT_CHUNK_SIZE\)\)/);
  assert.match(automationStoreSource, /INSERT INTO "AutomationLocatorCandidate"[\s\S]*VALUES \$\{Prisma\.join/);
  assert.doesNotMatch(
    automationStoreSource,
    /for \(const \[index, step\] of normalizedSteps\.entries\(\)\)[\s\S]{0,900}for \(const candidate of normalizeLocatorCandidates/,
  );
});

test("raw locator candidate inserts set prisma-managed updatedAt timestamp", () => {
  const locatorInsertBlocks = automationStoreSource.match(
    /INSERT INTO "AutomationLocatorCandidate" \([\s\S]*?\)\s*(?:VALUES|SELECT)/g,
  );
  assert.ok(locatorInsertBlocks?.length, "expected AutomationLocatorCandidate raw inserts");
  for (const block of locatorInsertBlocks) {
    assert.match(block, /"updatedAt"/);
  }
});

test("automation project resolver accepts ids keys and legacy planning keys", () => {
  assert.match(automationStoreSource, /export async function resolveAutomationProjectId\(projectKey: string\)/);
  assert.match(automationStoreSource, /const projectRef = projectKey\.trim\(\)/);
  assert.match(automationStoreSource, /LOWER\("id"\) = LOWER\(\$\{projectRef\}\)/);
  assert.match(automationStoreSource, /LOWER\(COALESCE\("key", ''\)\) = LOWER\(\$\{projectRef\}\)/);
  assert.match(automationStoreSource, /"rows"->'planning'->>'projectKey'/);
  assert.match(automationStoreSource, /prisma\.project\.findMany\(\{/);
  assert.match(automationStoreSource, /function projectMatchesRef\(project: ProjectLookupRow, normalizedRef: string\)/);
  assert.match(automationStoreSource, /function getPlanningProjectKey\(rows: unknown\)/);
});

test("scenario persistence stores readable steps and ranks resilient locators first", () => {
  const store = createMemoryAutomationStore();
  const scenario = store.createScenario("project-1", "Checkout");
  const saved = store.replaceScenarioSteps(scenario.id, [
    {
      action: "click",
      description: "Click Checkout",
      id: "step-1",
      locatorCandidates: [
        { strategy: "xpath", value: "/html/body/button[1]", score: 20 },
        { strategy: "role", value: "button:Checkout", score: 80, isUnique: true },
        { strategy: "css", value: ".btn.primary", score: 60 },
      ],
      target: { type: "smart", value: "button:Checkout" },
    },
  ]);

  assert.equal(saved.steps[0].description, "Click Checkout");
  assert.equal(saved.steps[0].locatorCandidates[0].strategy, "role");
  assert.equal(saved.steps[0].locatorCandidates.at(-1).strategy, "xpath");
  assert.equal(saved.version, 2);
});

test("locator score normalization stores integer confidence scores", () => {
  assert.match(locatorPolicySource, /export function normalizeLocatorScore/);
  assert.match(locatorPolicySource, /score > 0 && score <= 1 \? score \* 100 : score/);
  assert.match(locatorPolicySource, /Math\.round\(scaledScore\)/);
  assert.match(locatorPolicySource, /Math\.max\(0, Math\.min\(100/);
  assert.match(locatorPolicySource, /score: normalizeLocatorScore\(candidate\.score\)/);
  assert.match(automationStoreSource, /normalizeLocatorCandidates, normalizeLocatorScore/);
  assert.match(automationStoreSource, /normalizeLocatorScore\(event\.confidenceScore\)/);
});

test("legacy localStorage scenarios import once into the database store", () => {
  const store = createMemoryAutomationStore();
  const imported = store.importLegacyScenarios("project-1", [
    {
      id: "legacy-1",
      name: "Legacy Checkout",
      steps: [{ action: "goto", description: "Open app", id: "step-1", target: {} }],
    },
  ]);

  assert.equal(imported.length, 1);
  assert.equal(imported[0].name, "Legacy Checkout");
  assert.equal(imported[0].steps[0].description, "Open app");
});

test("scenario delete removes the canonical database record", () => {
  const store = createMemoryAutomationStore();
  const scenario = store.createScenario("project-1", "Temporary");

  assert.equal(store.deleteScenario(scenario.id), true);
  assert.equal(store.deleteScenario(scenario.id), false);
});

test("action creation copies only the selected command set", () => {
  const store = createMemoryAutomationStore();
  const scenario = store.createScenario("project-1", "Login");
  store.replaceScenarioSteps(scenario.id, [
    { action: "fill", description: "Enter email", id: "step-1", target: {} },
    { action: "fill", description: "Enter password", id: "step-2", target: {} },
    { action: "click", description: "Submit", id: "step-3", target: {} },
  ]);

  const action = store.createActionFromSteps("project-1", scenario.id, "Login Action", [
    "step-1",
    "step-2",
  ]);

  assert.equal(action.name, "Login Action");
  assert.deepEqual(
    action.steps.map((step) => step.id),
    ["step-1", "step-2"],
  );
});

test("run artefact retrieval returns trace, video, log, and network metadata", () => {
  const store = createMemoryAutomationStore();
  const scenario = store.createScenario("project-1", "Smoke");
  const run = store.createRun("project-1", scenario.id, [
    { type: "trace", uri: "s3://runs/1/trace.zip" },
    { type: "video", uri: "s3://runs/1/video.webm" },
    { type: "log", uri: "s3://runs/1/console.log" },
    { type: "network", uri: "s3://runs/1/network.har" },
  ]);

  assert.deepEqual(
    store.listRunArtifacts(run.id).map((artifact) => artifact.type),
    ["trace", "video", "log", "network"],
  );
});

test("accepting a healed locator promotes it and keeps the old primary as fallback", () => {
  const store = createMemoryAutomationStore();
  const scenario = store.createScenario("project-1", "Checkout");
  store.replaceScenarioSteps(scenario.id, [
    {
      action: "click",
      description: "Click Save",
      id: "step-1",
      locatorCandidates: [],
      target: { locatorType: "css", type: "smart", value: "#old-save" },
    },
  ]);
  const run = store.createRun("project-1", scenario.id, []);
  store.appendHealingEvent(run.id, {
    confidenceScore: 94,
    healedLocator: { type: "testid", value: "save-primary" },
    id: "heal-1",
    originalLocator: { type: "css", value: "#old-save" },
    stepId: "step-1",
  });

  const step = store.acceptHealedLocator(scenario.id, run.id, "heal-1");

  assert.equal(step.target.locatorType, "testid");
  assert.equal(step.target.value, "save-primary");
  assert.equal(step.locatorCandidates.some((candidate) => candidate.value === "#old-save"), true);
  assert.equal(run.summary.healingEvents[0].status, "accepted");
});
