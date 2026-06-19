import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const demoSource = readFileSync(new URL("../../app/demo/glowcart/page.tsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(
  new URL("../../components/AutomationScenarioWorkspace.tsx", import.meta.url),
  "utf8",
);
const localAgentSource = readFileSync(
  new URL("../../scripts/caseforge-local-agent.mjs", import.meta.url),
  "utf8",
);
const glowCartDistIndex = readFileSync(
  new URL("../../glowcart-demo-dist/index.html", import.meta.url),
  "utf8",
);

test("GlowCart demo route provides account creation controls for automation onboarding", () => {
  assert.match(demoSource, /GlowCart/);
  assert.match(demoSource, /Create Account/);
  assert.match(demoSource, /First Name/);
  assert.match(demoSource, /Last Name/);
  assert.match(demoSource, /Email Address/);
  assert.match(demoSource, /Mobile Number/);
  assert.match(demoSource, /Password/);
  assert.match(demoSource, /Confirm Password/);
  assert.match(demoSource, /Date of Birth/);
  assert.match(demoSource, /Gender/);
  assert.match(demoSource, /Skin Profile/);
  assert.match(demoSource, /Beauty Interest/);
  assert.match(demoSource, /Terms and Privacy Policy checkbox/);
  assert.match(demoSource, /Already have account\? Sign in/);
  assert.match(demoSource, /Account created for/);
});

test("automation workspace exposes one-click GlowCart authoring preview", () => {
  assert.match(workspaceSource, /const prepareGlowCartDemoAuthoring = async/);
  assert.match(workspaceSource, /\/demo\/glowcart\/start/);
  assert.doesNotMatch(workspaceSource, /localhost:5173/);
  assert.match(workspaceSource, /Try GlowCart Demo/);
  assert.match(workspaceSource, /setAuthoringPreviewUrl\(demoUrl\)/);
  assert.match(workspaceSource, /browserMode: "headless"/);
  assert.match(workspaceSource, /livePreviewOnly: true/);
  assert.match(workspaceSource, /Hidden Live Preview started at/);
  assert.match(workspaceSource, /Authoring preview/);
  assert.match(workspaceSource, /GlowCart Demo/);
  assert.doesNotMatch(workspaceSource, /prepareGlowCartDemoAuthoring[\s\S]{0,900}setRunModalMode\("record"\)/);
  assert.doesNotMatch(workspaceSource, /prepareGlowCartDemoAuthoring[\s\S]{0,900}createSession\(/);
});

test("CaseForge Companion serves GlowCart from a local available port", () => {
  assert.match(glowCartDistIndex, /dummy-gtm-tag/);
  assert.match(glowCartDistIndex, /dummy-ga4-tag/);
  assert.match(glowCartDistIndex, /\/assets\/index-/);
  assert.match(localAgentSource, /glowCartDistRoot/);
  assert.match(localAgentSource, /sendGlowCartDistFile/);
  assert.match(localAgentSource, /demoServer\.listen\(0, HOST/);
  assert.match(localAgentSource, /\/demo\/glowcart\/start/);
  assert.match(localAgentSource, /url: demo\.url/);
  assert.match(localAgentSource, /const launchBrowser = async/);
  assert.match(localAgentSource, /body\?\.headless === true \|\| body\?\.browserMode === "headless"/);
  assert.match(localAgentSource, /livePreviewOnly/);
  assert.match(localAgentSource, /session\.status = livePreviewOnly \? "previewing" : "recording"/);
});
