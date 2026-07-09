import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("components/ProjectWorkspace.tsx", "utf8");
const workflowSceneSource = readFileSync("components/CaseForgeWorkflowScene.tsx", "utf8");
const homeSource = readFileSync("app/page.tsx", "utf8");

test("project workspace starts with an action-oriented command center", () => {
  assert.match(source, /QA command center/);
  assert.match(source, /Generate cases, continue review, and open demo sandboxes from the first screen\./);
  assert.match(source, /const readinessSnapshot = \[/);
  assert.match(source, /Active cases/);
  assert.match(source, /Automation ready/);
  assert.match(source, /\{websiteCaseGenerationPanel\}/);
  assert.match(source, /Generate from requirement/);
  assert.match(source, /Review cases/);
  assert.match(source, /ForceLab Sandbox/);
  assert.match(source, /GlowCart Demo/);
  assert.match(source, /import CaseForgeWorkflowScene from "\.\/CaseForgeWorkflowScene"/);
  assert.match(source, /<CaseForgeWorkflowScene/);
  assert.match(source, /activeCases=\{activeRows\.length\}/);
  assert.match(source, /automationReady=\{automationReadyRows\.length\}/);
  assert.match(source, /<div className="grid gap-4 p-5">/);
  assert.match(source, /<aside className="grid gap-3 md:grid-cols-2">/);
  assert.doesNotMatch(source, /xl:grid-cols-\[minmax\(0,1fr\)_340px\]/);
  assert.doesNotMatch(source, /xl:grid-cols-\[minmax\(240px,1\.2fr\)_minmax\(180px,0\.8fr\)_180px_220px\]/);
});

test("project workspace no longer uses the oversized marketing hero copy", () => {
  assert.doesNotMatch(source, /Turn each requirement into coverage, automation, and release confidence\./);
  assert.doesNotMatch(source, /1\. Capture requirement/);
  assert.doesNotMatch(source, /2\. Refine output/);
  assert.doesNotMatch(source, /3\. Save and export/);
  assert.doesNotMatch(source, /Downstream failures/);
});

test("project workspace includes a real three dimensional workflow scene", () => {
  assert.match(workflowSceneSource, /await import\("three"\)/);
  assert.match(workflowSceneSource, /new THREE\.WebGLRenderer/);
  assert.match(workflowSceneSource, /preserveDrawingBuffer: true/);
  assert.match(workflowSceneSource, /new THREE\.PerspectiveCamera/);
  assert.match(workflowSceneSource, /requestAnimationFrame/);
  assert.match(workflowSceneSource, /ResizeObserver/);
  assert.match(workflowSceneSource, /data-testid="caseforge-3d-workflow-canvas"/);
  assert.match(workflowSceneSource, /Source/);
  assert.match(workflowSceneSource, /Manual cases/);
  assert.match(workflowSceneSource, /Automation/);
  assert.match(workflowSceneSource, /Reports/);
});

test("public home page surfaces the CaseForge 3D workflow scene", () => {
  assert.match(homeSource, /import CaseForgeWorkflowScene from "\.\.\/components\/CaseForgeWorkflowScene"/);
  assert.match(homeSource, /<CaseForgeWorkflowScene/);
  assert.match(homeSource, /AI manual cases from requirements/);
  assert.match(homeSource, /Review before automation/);
  assert.doesNotMatch(homeSource, /Workspace Access/);
});
