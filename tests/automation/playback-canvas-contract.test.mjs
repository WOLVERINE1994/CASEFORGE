import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schemaSource = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
const storeSource = readFileSync(new URL("../../utils/automation/store.ts", import.meta.url), "utf8");
const typesSource = readFileSync(new URL("../../utils/automation/types.ts", import.meta.url), "utf8");
const viewsRouteSource = readFileSync(
  new URL("../../app/api/automation/projects/[projectKey]/views/route.ts", import.meta.url),
  "utf8",
);
const elementsRouteSource = readFileSync(
  new URL("../../app/api/automation/projects/[projectKey]/elements/route.ts", import.meta.url),
  "utf8",
);
const elementRouteSource = readFileSync(
  new URL("../../app/api/automation/projects/[projectKey]/elements/[elementId]/route.ts", import.meta.url),
  "utf8",
);
const usagesRouteSource = readFileSync(
  new URL("../../app/api/automation/projects/[projectKey]/elements/[elementId]/usages/route.ts", import.meta.url),
  "utf8",
);
const playbackRouteSource = readFileSync(
  new URL("../../app/api/automation/projects/[projectKey]/playback/route.ts", import.meta.url),
  "utf8",
);
const playbackConfigRouteSource = readFileSync(
  new URL("../../app/api/automation/projects/[projectKey]/playback/config/route.ts", import.meta.url),
  "utf8",
);
const commandsRouteSource = readFileSync(
  new URL("../../app/api/automation/commands/route.ts", import.meta.url),
  "utf8",
);

test("prisma schema models automation views elements usages playback jobs and config", () => {
  assert.match(schemaSource, /model AutomationView/);
  assert.match(schemaSource, /model AutomationElement/);
  assert.match(schemaSource, /businessName\s+String/);
  assert.match(schemaSource, /technicalName\s+String/);
  assert.match(schemaSource, /aliases\s+Json/);
  assert.match(schemaSource, /lastVerifiedAt\s+DateTime\?/);
  assert.match(schemaSource, /stabilityScore\s+Float/);
  assert.match(schemaSource, /preferredLocatorStrategy\s+String\?/);
  assert.match(schemaSource, /fallbackLocators\s+Json/);
  assert.match(schemaSource, /model AutomationElementUsage/);
  assert.match(schemaSource, /model AutomationPlaybackJob/);
  assert.match(schemaSource, /model AutomationPlaybackItem/);
  assert.match(schemaSource, /model AutomationPlaybackConfig/);
  assert.match(schemaSource, /automationViews\s+AutomationView\[\]/);
  assert.match(schemaSource, /automationElements\s+AutomationElement\[\]/);
  assert.match(schemaSource, /automationElementUsages\s+AutomationElementUsage\[\]/);
  assert.match(schemaSource, /automationPlaybackJobs\s+AutomationPlaybackJob\[\]/);
  assert.match(schemaSource, /automationPlaybackConfigs\s+AutomationPlaybackConfig\[\]/);
  assert.match(schemaSource, /@@unique\(\[projectId, scenarioId\]\)/);
});

test("automation store exposes view canvas element repository and playback queue operations", () => {
  assert.match(typesSource, /export type AutomationView =/);
  assert.match(typesSource, /export type AutomationElement =/);
  assert.match(typesSource, /businessName: string/);
  assert.match(typesSource, /technicalName: string/);
  assert.match(typesSource, /aliases: string\[\]/);
  assert.match(typesSource, /lastVerifiedAt\?: string \| null/);
  assert.match(typesSource, /stabilityScore: number/);
  assert.match(typesSource, /preferredLocatorStrategy\?: string \| null/);
  assert.match(typesSource, /fallbackLocators: AutomationLocatorCandidate\[\]/);
  assert.match(typesSource, /export type AutomationElementUsage =/);
  assert.match(typesSource, /export type AutomationPlaybackJob =/);
  assert.match(typesSource, /export type AutomationPlaybackItem =/);
  assert.match(typesSource, /export type AutomationPlaybackConfig =/);
  assert.match(storeSource, /export async function listViews/);
  assert.match(storeSource, /export async function createView/);
  assert.match(storeSource, /export async function listElements/);
  assert.match(storeSource, /export async function upsertElement/);
  assert.match(storeSource, /export async function remapElement/);
  assert.match(storeSource, /export async function listElementUsages/);
  assert.match(storeSource, /export async function upsertElementUsage/);
  assert.match(storeSource, /export async function createPlaybackJob/);
  assert.match(storeSource, /export async function listPlaybackJobs/);
  assert.match(storeSource, /export async function stopPendingPlayback/);
  assert.match(storeSource, /export async function updatePlaybackConfig/);
  assert.match(storeSource, /"AutomationPlaybackItem"/);
});

test("automation APIs expose command catalog views elements usages playback and config", () => {
  assert.match(commandsRouteSource, /AUTOMATION_COMMAND_CATALOG/);
  assert.match(commandsRouteSource, /domains/);
  assert.match(viewsRouteSource, /export async function GET/);
  assert.match(viewsRouteSource, /latestView/);
  assert.match(viewsRouteSource, /export async function POST/);
  assert.match(viewsRouteSource, /createView/);
  assert.match(elementsRouteSource, /export async function GET/);
  assert.match(elementsRouteSource, /listElements/);
  assert.match(elementsRouteSource, /export async function POST/);
  assert.match(elementsRouteSource, /upsertElement/);
  assert.match(elementRouteSource, /export async function PATCH/);
  assert.match(elementRouteSource, /remapElement/);
  assert.match(usagesRouteSource, /export async function GET/);
  assert.match(usagesRouteSource, /listElementUsages/);
  assert.match(usagesRouteSource, /export async function POST/);
  assert.match(usagesRouteSource, /upsertElementUsage/);
  assert.match(playbackRouteSource, /export async function GET/);
  assert.match(playbackRouteSource, /listPlaybackJobs/);
  assert.match(playbackRouteSource, /export async function POST/);
  assert.match(playbackRouteSource, /createPlaybackJob/);
  assert.match(playbackRouteSource, /export async function DELETE/);
  assert.match(playbackRouteSource, /stopPendingPlayback/);
  assert.match(playbackConfigRouteSource, /getPlaybackConfig/);
  assert.match(playbackConfigRouteSource, /updatePlaybackConfig/);
});
