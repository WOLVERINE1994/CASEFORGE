import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const workspaceSource = readFileSync(
  new URL("../../components/AutomationScenarioWorkspace.tsx", import.meta.url),
  "utf8",
);
const localAgentSource = readFileSync(
  new URL("../../scripts/caseforge-local-agent.mjs", import.meta.url),
  "utf8",
);
const routeSource = readFileSync(
  new URL("../../app/demo/forcelab/[[...path]]/route.ts", import.meta.url),
  "utf8",
);
const distIndex = readFileSync(
  new URL("../../forcelab-demo-dist/index.html", import.meta.url),
  "utf8",
);
const forceLabAssetName = readdirSync(
  new URL("../../forcelab-demo-dist/assets", import.meta.url),
).find((fileName) => fileName.endsWith(".js"));
assert.ok(forceLabAssetName, "ForceLab JS bundle should exist.");
const distScript = readFileSync(
  new URL(`../../forcelab-demo-dist/assets/${forceLabAssetName}`, import.meta.url),
  "utf8",
);

test("ForceLab demo dist preserves the Lovable Salesforce CRM simulator", () => {
  assert.match(distIndex, /ForceLab CRM/);
  assert.match(distIndex, /\/demo\/forcelab\/assets\/index-/);
  assert.match(distScript, /ForceLab CRM/);
  assert.match(distScript, /admin@forcelab\.test/);
  assert.match(distScript, /Log In to Demo/);
  assert.match(distScript, /Object Manager/);
  assert.match(distScript, /Validation Rules/);
  assert.match(distScript, /Permission Sets/);
  assert.match(distScript, /Query Console/);
  assert.match(distScript, /Data Import Wizard/);
  assert.match(distScript, /basename:"\/demo\/forcelab\/"\.replace/);
});

test("CaseForge serves ForceLab from its own demo route", () => {
  assert.match(routeSource, /forcelab-demo-dist/);
  assert.match(routeSource, /safeDistPath/);
  assert.match(routeSource, /index\.html/);
  assert.match(routeSource, /Cache-Control/);
});

test("CaseForge Companion can start ForceLab like GlowCart", () => {
  assert.match(localAgentSource, /forceLabDistRoot/);
  assert.match(localAgentSource, /sendForceLabDistFile/);
  assert.match(localAgentSource, /const startForceLabDemo = \(\) =>/);
  assert.match(localAgentSource, /\/demo\/forcelab\/start/);
  assert.match(localAgentSource, /\/demo\/forcelab\/status/);
  assert.match(localAgentSource, /url: demo\.url/);
});

test("automation workspace exposes one-click ForceLab authoring preview", () => {
  assert.match(workspaceSource, /const resolveForceLabDemoUrl = async/);
  assert.match(workspaceSource, /const prepareForceLabDemoAuthoring = async/);
  assert.match(workspaceSource, /\/demo\/forcelab\/start/);
  assert.match(workspaceSource, /data-live-preview-action="forcelab-demo"/);
  assert.match(workspaceSource, /Try ForceLab Sandbox/);
  assert.match(workspaceSource, /setAuthoringPreviewLabel\("ForceLab Sandbox"\)/);
  assert.match(workspaceSource, /name: "ForceLab Sandbox"/);
  assert.match(workspaceSource, /setAuthoringPreviewUrl\(demoUrl\)/);
  assert.match(workspaceSource, /livePreviewOnly: true/);
});
