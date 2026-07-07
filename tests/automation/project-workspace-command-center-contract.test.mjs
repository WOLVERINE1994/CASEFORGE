import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("components/ProjectWorkspace.tsx", "utf8");

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
});

test("project workspace no longer uses the oversized marketing hero copy", () => {
  assert.doesNotMatch(source, /Turn each requirement into coverage, automation, and release confidence\./);
  assert.doesNotMatch(source, /1\. Capture requirement/);
  assert.doesNotMatch(source, /2\. Refine output/);
  assert.doesNotMatch(source, /3\. Save and export/);
});
