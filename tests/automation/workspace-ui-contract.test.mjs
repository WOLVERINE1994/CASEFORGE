import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspaceSource = readFileSync(
  new URL("../../components/AutomationScenarioWorkspace.tsx", import.meta.url),
  "utf8",
);
const localAgentSource = readFileSync(
  new URL("../../scripts/caseforge-local-agent.mjs", import.meta.url),
  "utf8",
);
const playwrightWorkerSource = readFileSync(
  new URL("../../workers/playwright-worker/server.mjs", import.meta.url),
  "utf8",
);
const globalStylesSource = readFileSync(
  new URL("../../app/globals.css", import.meta.url),
  "utf8",
);
const safeLayoutSource = readFileSync(
  new URL("../../components/SafeLayout.tsx", import.meta.url),
  "utf8",
);
const appSidebarSource = readFileSync(
  new URL("../../components/AppSidebar.tsx", import.meta.url),
  "utf8",
);
const projectSidebarSource = readFileSync(
  new URL("../../components/ProjectSidebar.tsx", import.meta.url),
  "utf8",
);
const routeHeaderSource = readFileSync(
  new URL("../../components/ProjectRouteHeader.tsx", import.meta.url),
  "utf8",
);
const moduleSubnavSource = readFileSync(
  new URL("../../components/ProjectModuleSubnav.tsx", import.meta.url),
  "utf8",
);
const automationShellSource = readFileSync(
  new URL("../../components/AutomationShell.tsx", import.meta.url),
  "utf8",
);
const testCaseTableSource = readFileSync(
  new URL("../../components/TestCaseTable.tsx", import.meta.url),
  "utf8",
);
const scenariosSource = readFileSync(
  new URL("../../components/AutomationScenariosClient.tsx", import.meta.url),
  "utf8",
);
const scenarioActionRouteSource = readFileSync(
  new URL(
    "../../app/api/automation/projects/[projectKey]/scenarios/[scenarioId]/actions/route.ts",
    import.meta.url,
  ),
  "utf8",
);
const sessionRouteSource = readFileSync(
  new URL("../../app/api/automation/sessions/route.ts", import.meta.url),
  "utf8",
);
const liveFrameRouteSource = readFileSync(
  new URL(
    "../../app/api/automation/sessions/[sessionId]/live-frame/route.ts",
    import.meta.url,
  ),
  "utf8",
);

test("command prompt Done saves successfully before closing", () => {
  assert.match(workspaceSource, /const \[commandPromptDraft, setCommandPromptDraft\]/);
  assert.match(workspaceSource, /const selectedStep = drawerOpen && commandPromptDraft \? commandPromptDraft : sourceSelectedStep/);
  assert.match(workspaceSource, /const handleCommandPromptDone = async \(\) => \{/);
  assert.match(workspaceSource, /const saved = await saveCommandPrompt\(\);/);
  assert.match(workspaceSource, /if \(saved\) closeCommandPrompt\(\);/);
  assert.match(workspaceSource, /onClick=\{\(\) => void handleCommandPromptDone\(\)\}/);
});

test("shared UI has reusable overflow-safe layout primitives", () => {
  assert.match(safeLayoutSource, /export function SafeText/);
  assert.match(safeLayoutSource, /export function LabelWithBadge/);
  assert.match(safeLayoutSource, /export function ResponsiveToolbar/);
  assert.match(safeLayoutSource, /export function CardHeader/);
  assert.match(safeLayoutSource, /export function NavItem/);
  assert.match(globalStylesSource, /\.cf-safe-row/);
  assert.match(globalStylesSource, /min-width: 0/);
  assert.match(globalStylesSource, /\.cf-safe-label/);
  assert.match(globalStylesSource, /text-overflow: ellipsis/);
  assert.match(globalStylesSource, /\.cf-safe-wrap/);
  assert.match(globalStylesSource, /overflow-wrap: anywhere/);
  assert.match(globalStylesSource, /\.cf-safe-chip/);
  assert.match(globalStylesSource, /white-space: nowrap/);
  assert.match(globalStylesSource, /\.cf-table-cell-safe/);
});

test("shared navigation and tables use overflow-safe primitives", () => {
  assert.match(appSidebarSource, /NavItem as SafeNavItem/);
  assert.match(projectSidebarSource, /NavItem as SafeNavItem/);
  assert.match(projectSidebarSource, /label: "Test Management"/);
  assert.match(projectSidebarSource, /cf-safe-wrap text-xl/);
  assert.match(routeHeaderSource, /ResponsiveToolbar/);
  assert.match(routeHeaderSource, /cf-safe-label/);
  assert.match(moduleSubnavSource, /ResponsiveToolbar/);
  assert.match(automationShellSource, /ResponsiveToolbar/);
  assert.match(testCaseTableSource, /cf-table-shell/);
  assert.match(workspaceSource, /cf-table-shell mt-3 overflow-x-auto/);
});

test("command prompt validation keeps drawer open with a visible error", () => {
  assert.match(workspaceSource, /function validateCommandPromptStep\(step: AutomationStep\)/);
  assert.match(workspaceSource, /setCommandPromptError\(validation\.message/);
  assert.match(workspaceSource, /role="alert"/);
  assert.doesNotMatch(workspaceSource, /if \(!validation\.ok\)[\s\S]{0,160}closeCommandPrompt\(\)/);
});

test("scenario creation asks for a scenario name before posting", () => {
  assert.match(scenariosSource, /window\.prompt\("Scenario name", ""\)/);
  assert.match(scenariosSource, /if \(enteredName === null\) return;/);
  assert.match(scenariosSource, /if \(!scenarioName\)/);
  assert.match(scenariosSource, /body: JSON\.stringify\(\{ name: scenarioName \}\)/);
  assert.doesNotMatch(scenariosSource, /name: `Scenario \$\{scenarios\.length \+ 1\}`/);
});

test("scenario workspace supports ACCELQ-style test data and parameterized runs", () => {
  assert.match(workspaceSource, /type ScenarioParameter = \{/);
  assert.match(workspaceSource, /type ScenarioTestCase = \{/);
  assert.match(workspaceSource, /function inferParameterNamesFromSteps\(steps: AutomationStep\[\]\)/);
  assert.match(workspaceSource, /function parameterToken\(name: string\)/);
  assert.match(workspaceSource, /function exactParameterNameFromText\(value\?: string\)/);
  assert.match(workspaceSource, /function substituteStepParameters\(step: AutomationStep, data: Record<string, string>\)/);
  assert.match(workspaceSource, /automationParameters/);
  assert.match(workspaceSource, /testCases/);
  assert.match(workspaceSource, /Scenario Test Cases/);
  assert.match(workspaceSource, /Test Case Name \| detected params \| Expected Result \| Tags \| Priority \| Active/);
  assert.match(workspaceSource, /Data-driven value/);
  assert.match(workspaceSource, /Bind this value to a reusable test data column/);
  assert.match(workspaceSource, /const convertStepValueToParameter = async/);
  assert.match(workspaceSource, /Convert typed value to scenario parameter/);
  assert.match(workspaceSource, /Converted value to required scenario parameter/);
  assert.match(workspaceSource, /inputValue: parameterName \? parameterToken\(parameterName\) : ""/);
  assert.match(workspaceSource, /parameterName: parameterName \|\| undefined/);
  assert.match(workspaceSource, /const saveOpenCommandPromptDraft = async \(\) => \{/);
  assert.match(workspaceSource, /const activeRunTestData = \(\) => \{/);
  assert.match(workspaceSource, /normalizedTestDataDrafts\(parameterDrafts, testCaseDrafts\)/);
  assert.match(workspaceSource, /const currentStepForRun = \(step: AutomationStep\)/);
  assert.match(workspaceSource, /for \(const environment of environments\)/);
  assert.match(workspaceSource, /for \(const testCase of runRows\)/);
  assert.match(workspaceSource, /testCaseMatchesRunScope\(testCase, config\)/);
  assert.match(workspaceSource, /Execution Mode/);
  assert.match(workspaceSource, /Run Scope/);
  assert.match(workspaceSource, /All active cases/);
  assert.match(workspaceSource, /Failed cases/);
  assert.match(workspaceSource, /Priority/);
  assert.match(workspaceSource, /substituteStepsParameters\(executableSteps, parameterData\)/);
  assert.match(workspaceSource, /const runLabel = \[/);
  assert.match(workspaceSource, /scenarioName,/);
  assert.match(workspaceSource, /testCase\?\.name,/);
});

test("recording desktop sessions open maximized while custom devices keep explicit viewport", () => {
  assert.match(workspaceSource, /maximize\?: boolean/);
  assert.match(workspaceSource, /viewport: \{ height: 900, maximize: true, width: 1440 \}/);
  assert.match(workspaceSource, /const viewport = viewportForRunConfig\(config\)/);
  assert.match(workspaceSource, /viewport,/);
  assert.match(sessionRouteSource, /typeof body\.viewport\.maximize === "boolean"/);
  assert.match(localAgentSource, /args: !headless && options\.maximize \? \["--start-maximized"\] : undefined/);
  assert.match(localAgentSource, /viewport: maximizeWindow \? null : viewportFromBody\(body\)/);
  assert.match(playwrightWorkerSource, /args: !effectiveHeadless && maximizeWindow \? \["--start-maximized"\] : undefined/);
  assert.match(playwrightWorkerSource, /viewport: !effectiveHeadless && maximizeWindow \? null : requestedViewport/);
});

test("live preview hides raw missing worker frame errors", () => {
  assert.match(liveFrameRouteSource, /workerResponse\.status === 404/);
  assert.match(liveFrameRouteSource, /not found/i);
  assert.match(liveFrameRouteSource, /Preview session is not available yet/);
});

test("playback reuses active Companion browser instead of opening a second browser", () => {
  assert.match(workspaceSource, /shouldUseLegacyDesktopBridge\(expectedUrl \|\| normalizeUrl\(targetUrl\)\)/);
  assert.match(workspaceSource, /let companionSessionId = recordingSessionId/);
  assert.match(workspaceSource, /action: "run"/);
  assert.match(workspaceSource, /Playback running in the current CaseForge Companion browser/);
  assert.match(localAgentSource, /runPlaybackInActiveBrowser/);
  assert.match(localAgentSource, /body\?\.action === "run"/);
  assert.match(localAgentSource, /session\.playbackActive/);
});

test("recording promotes an existing Companion Live Preview instead of opening another browser", () => {
  assert.match(workspaceSource, /const canPromoteCompanionPreview =/);
  assert.match(workspaceSource, /isCompanionPreviewSession\(session\)/);
  assert.match(workspaceSource, /session\?\.sessionId && !canPromoteCompanionPreview/);
  assert.match(workspaceSource, /action: "mode"/);
  assert.match(workspaceSource, /mode: "record"/);
  assert.match(workspaceSource, /Recording started in the current CaseForge Companion Live Preview/);
  assert.match(localAgentSource, /const setRecorderMode = async/);
  assert.match(localAgentSource, /body\?\.action === "mode"/);
  assert.match(localAgentSource, /Live Preview promoted to recording mode/);
});

test("Companion recording does not duplicate the startup navigation command", () => {
  assert.match(workspaceSource, /const useLegacyBridge = shouldUseLegacyDesktopBridge\(url\)/);
  assert.match(workspaceSource, /if \(!useLegacyBridge\) \{\s*const navigateStep = makeNavigateStep\(url\)/);
  assert.match(workspaceSource, /if \(useLegacyBridge\) \{/);
  assert.match(workspaceSource, /function withoutAdjacentDuplicateNavigations\(steps: AutomationStep\[\]\)/);
  assert.match(
    workspaceSource,
    /withoutAdjacentDuplicateNavigations\(mergeStepsById\(\[\.\.\.finalizedSteps, \.\.\.recordedSteps\]\)\)/,
  );
});

test("Companion sessions render live preview directly from the local agent", () => {
  assert.match(workspaceSource, /function companionSessionMetadata/);
  assert.match(workspaceSource, /provider: "caseforge-companion"/);
  assert.match(workspaceSource, /function isCompanionPreviewSession/);
  assert.match(workspaceSource, /function liveFrameSrcForSession/);
  assert.match(workspaceSource, /function companionPreviewStreamUrl/);
  assert.match(workspaceSource, /new WebSocket\(companionPreviewStreamUrl\(session\)\)/);
  assert.match(workspaceSource, /const \[livePreviewStreamConnected, setLivePreviewStreamConnected\]/);
  assert.match(workspaceSource, /const \[livePreviewStreamFrameSrc, setLivePreviewStreamFrameSrc\]/);
  assert.match(workspaceSource, /src=\{livePreviewStreamFrameSrc \|\| liveFrameSrcForSession\(session, livePreviewTick\)\}/);
  assert.match(workspaceSource, /socket\.send\(JSON\.stringify\(\{/);
  assert.match(workspaceSource, /type LivePreviewSizeKey = "normal" \| "large" \| "full"/);
  assert.match(workspaceSource, /LIVE_PREVIEW_SIZES/);
  assert.match(workspaceSource, /panelMinHeight/);
  assert.match(workspaceSource, /const \[livePreviewSize, setLivePreviewSize\]/);
  assert.match(workspaceSource, /livePreviewWorkspaceColumns/);
  assert.match(workspaceSource, /Preview Size:/);
  assert.match(workspaceSource, /cycleLivePreviewSize/);
  assert.match(workspaceSource, /overflow-auto bg-zinc-100 p-2 dark:bg-zinc-950/);
  assert.match(workspaceSource, /setLivePreviewSize\(nextPreviewSize\.key\)/);
  assert.match(workspaceSource, /viewport: previewSize\.viewport/);
  assert.match(workspaceSource, /companionPreviewUrl\(session, "inspect"\)/);
  assert.match(workspaceSource, /companionPreviewUrl\(session, "scroll"\)/);
  assert.match(workspaceSource, /const requestLivePreviewScroll = useCallback/);
  assert.match(workspaceSource, /const handleLivePreviewWheel = useCallback/);
  assert.match(workspaceSource, /livePreviewWheelDeltaRef/);
  assert.match(workspaceSource, /livePreviewWheelTimerRef/);
  assert.match(workspaceSource, /livePreviewSliderTimerRef/);
  assert.match(workspaceSource, /handleLivePreviewSliderChange/);
  assert.match(workspaceSource, /handleLivePreviewKeyDown/);
  assert.match(workspaceSource, /handleNativeWheel/);
  assert.match(workspaceSource, /addEventListener\("wheel", handleNativeWheel, \{ passive: false \}\)/);
  assert.match(workspaceSource, /event\.key === "Home"/);
  assert.match(workspaceSource, /event\.key === "End"/);
  assert.match(workspaceSource, /PageDown/);
  assert.match(workspaceSource, /window\.setTimeout\(\(\) => \{/);
  assert.match(workspaceSource, /setLivePreviewScroll\(\(current\) =>/);
  assert.match(workspaceSource, /activeLivePreviewSize\.viewport\.width \/ 2/);
  assert.match(workspaceSource, /event\.deltaMode === 1/);
  assert.doesNotMatch(workspaceSource, /< 70\) return/);
  assert.match(workspaceSource, /onWheel=\{handleLivePreviewWheel\}/);
  assert.match(workspaceSource, /onKeyDown=\{handleLivePreviewKeyDown\}/);
  assert.match(workspaceSource, /tabIndex=\{0\}/);
  assert.match(workspaceSource, /renderLivePreviewScrollControls/);
  assert.match(workspaceSource, /type="range"/);
  assert.match(workspaceSource, /w-5 flex-col/);
  assert.match(workspaceSource, /opacity-60 transition hover:bg-zinc-950\/70 hover:opacity-100/);
  assert.doesNotMatch(workspaceSource, />\s*Page\s*</);
  assert.match(workspaceSource, /targetY/);
  assert.match(workspaceSource, /setLivePreviewScroll/);
  assert.match(workspaceSource, /Scroll page up/);
  assert.match(workspaceSource, /Scroll page down/);
  assert.match(workspaceSource, /Go to top of browser page/);
  assert.match(workspaceSource, /Go to bottom of browser page/);
  assert.match(localAgentSource, /url\.pathname === "\/automation\/browser\/live-frame"/);
  assert.match(localAgentSource, /await state\.page\.screenshot/);
  assert.match(localAgentSource, /url\.pathname === "\/automation\/browser\/inspect"/);
  assert.match(localAgentSource, /url\.pathname === "\/automation\/browser\/scroll"/);
  assert.match(localAgentSource, /async function scrollLivePreview/);
  assert.match(localAgentSource, /handleLivePreviewSocketUpgrade/);
  assert.match(localAgentSource, /\/automation\/browser\/live-stream/);
  assert.match(localAgentSource, /sendWebSocketBinary\(client, screenshot\)/);
  assert.match(localAgentSource, /type: "scroll"/);
  assert.match(localAgentSource, /state\.page\.mouse\.wheel\(deltaX, deltaY\)/);
  assert.match(localAgentSource, /root\.scrollTo/);
  assert.doesNotMatch(localAgentSource, /scroller\.scrollBy/);
  assert.match(localAgentSource, /maxY: Math\.max/);
});

test("live preview right-click opens searchable command authoring menu", () => {
  assert.match(workspaceSource, /type LiveCommandMenu =/);
  assert.match(workspaceSource, /const \[liveCommandMenu, setLiveCommandMenu\]/);
  assert.match(workspaceSource, /const liveCommandResults = useMemo/);
  assert.match(workspaceSource, /const liveCommandResultsByDomain = useMemo/);
  assert.match(workspaceSource, /const openLiveCommandMenu = useCallback/);
  assert.match(workspaceSource, /event\.preventDefault\(\)/);
  assert.match(workspaceSource, /onContextMenu=\{openLiveCommandMenu\}/);
  assert.match(workspaceSource, /Live Command Library/);
  assert.match(workspaceSource, /Search commands by keyword, alias, or domain/);
  assert.match(workspaceSource, /Object\.entries\(liveCommandResultsByDomain\)/);
  assert.match(workspaceSource, /const insertLivePreviewCommand = async/);
  assert.match(workspaceSource, /function liveCommandText/);
  assert.match(workspaceSource, /Fill \$\{label\}/);
  assert.match(workspaceSource, /insertedFromLivePreview: true/);
  assert.match(workspaceSource, /await persistSteps\(/);
  assert.doesNotMatch(workspaceSource, /insertLivePreviewCommand[\s\S]{0,900}createSession\(/);
  assert.doesNotMatch(workspaceSource, /insertLivePreviewCommand[\s\S]{0,900}companionBrowserRequest\(/);
});

test("Try GlowCart Demo starts hidden Live Preview authoring without opening record modal", () => {
  assert.match(workspaceSource, /const prepareGlowCartDemoAuthoring = async/);
  assert.match(workspaceSource, /data-live-preview-action="glowcart-demo"/);
  assert.match(workspaceSource, /handleGlowCartDemoClick/);
  assert.match(workspaceSource, /document\.addEventListener\("click", handleGlowCartDemoClick\)/);
  assert.match(workspaceSource, /GlowCart demo selected at/);
  assert.match(workspaceSource, /setAuthoringPreviewUrl\(demoUrl\)/);
  assert.match(workspaceSource, /Hidden Live Preview started at/);
  assert.match(workspaceSource, /browserMode: "headless"/);
  assert.match(workspaceSource, /headless: true/);
  assert.match(workspaceSource, /livePreviewOnly: true/);
  assert.match(workspaceSource, /setRecordingSessionId\(data\.sessionId\)/);
  assert.match(workspaceSource, /setSession\(companionSessionMetadata\(data, previewUrl\)\)/);
  assert.match(workspaceSource, /Authoring preview/);
  assert.match(workspaceSource, /title="GlowCart authoring preview"/);
  assert.match(workspaceSource, /GlowCart preview unavailable/);
  assert.match(workspaceSource, /void prepareGlowCartDemoAuthoring\(\)/);
  assert.doesNotMatch(workspaceSource, /prepareGlowCartDemoAuthoring[\s\S]{0,900}setRunModalOpen\(true\)/);
  assert.doesNotMatch(workspaceSource, /prepareGlowCartDemoAuthoring[\s\S]{0,900}setRunModalMode\("record"\)/);
  assert.doesNotMatch(workspaceSource, /prepareGlowCartDemoAuthoring[\s\S]{0,900}startRecordingFromConfig/);
  assert.doesNotMatch(workspaceSource, /prepareGlowCartDemoAuthoring[\s\S]{0,900}createSession\(/);
});

test("test case rows fall back to parameter defaults when cells are blank", () => {
  assert.match(workspaceSource, /function dataForTestCase\(testCase: ScenarioTestCase \| null, parameters: ScenarioParameter\[\]\)/);
  assert.match(workspaceSource, /typeof testCaseValue === "string" && testCaseValue\.trim\(\)\.length/);
  assert.match(workspaceSource, /: parameter\.defaultValue \?\? ""/);
  assert.match(workspaceSource, /const allowedData = Object\.fromEntries/);
});

test("action and single-command runs substitute test data before playback", () => {
  assert.match(workspaceSource, /parameterData: input\.parameterData \?\? \{\}/);
  assert.match(workspaceSource, /const parameterizedActionSteps = substituteStepsParameters\(actionSteps, parameterData\)/);
  assert.match(workspaceSource, /const executableActionSteps = withScenarioInitSteps\(parameterizedActionSteps, parameterizedSetupSteps\)/);
  assert.match(workspaceSource, /runSteps: executableActionSteps/);
  assert.match(workspaceSource, /summarySteps: parameterizedSummarySteps/);
  assert.match(workspaceSource, /Running \$\{runTestData\.testCases\.length\} test case/);
  assert.match(workspaceSource, /const commandRun = await expandActionSteps\(\[runnableStep\]\)/);
  assert.match(workspaceSource, /const parameterizedSteps = substituteStepsParameters\(commandSteps, parameterData\)/);
  assert.match(workspaceSource, /const parameterizedSummarySteps = substituteStepsParameters\(\[runnableStep\], parameterData\)/);
  assert.match(workspaceSource, /steps: parameterizedSteps/);
  assert.match(workspaceSource, /runSteps: executableSteps/);
});

test("resume replay substitutes test data before playback", () => {
  assert.match(workspaceSource, /const resumeRunParameterContext = \(\) => \{/);
  assert.match(workspaceSource, /const testCase = runTestData\.testCases\[0\] \?\? null/);
  assert.match(workspaceSource, /const parameterizedReplaySteps = substituteStepsParameters\(replaySteps, parameterData\)/);
  assert.match(workspaceSource, /steps: parameterizedReplaySteps/);
  assert.match(workspaceSource, /const parameterizedRunSteps = substituteStepsParameters\(expanded\.steps, parameterData\)/);
  assert.match(workspaceSource, /runSteps: parameterizedRunSteps/);
  assert.match(workspaceSource, /summarySteps: parameterizedSummarySteps/);
});

test("single command fallback runs can include scenario init setup", () => {
  assert.match(workspaceSource, /function scenarioInitSteps\(steps: AutomationStep\[\]\)/);
  assert.match(workspaceSource, /function withScenarioInitSteps\(runSteps: AutomationStep\[\], setupSourceSteps: AutomationStep\[\]\)/);
  assert.match(workspaceSource, /function timelineContextStepsForStep\(step: AutomationStep, sourceSteps: AutomationStep\[\]\)/);
  assert.match(workspaceSource, /if \(!runSteps\.length \|\| firstNavigationUrl\(runSteps\)\) return runSteps/);
  assert.match(workspaceSource, /const parameterizedSetupSteps = substituteStepsParameters\(setupSourceSteps, parameterData\)/);
  assert.match(workspaceSource, /startUrl: firstNavigationUrl\(executableActionSteps\) \|\| normalizeUrl\(targetUrl\)/);
  assert.match(workspaceSource, /startUrl: firstNavigationUrl\(executableSteps\) \|\| normalizeUrl\(targetUrl\)/);
  assert.match(workspaceSource, /summarySteps: parameterizedSummarySteps/);
});

test("single command Run reuses active Companion Live Preview without clearing timeline", () => {
  assert.match(workspaceSource, /return \[\.\.\.sourceSteps\.slice\(0, stepIndex\), step\]/);
  assert.match(workspaceSource, /const actionContextSteps = timelineContextStepsForStep\(runnableStep, setupSourceSteps\)/);
  assert.match(workspaceSource, /const actionRun = await expandActionSteps\(actionContextSteps, \{/);
  assert.match(workspaceSource, /Running action with scenario context/);
  assert.match(workspaceSource, /const activeCompanionSession =/);
  assert.match(workspaceSource, /isUsableBrokerSession\(session\) && isCompanionPreviewSession\(session\)/);
  assert.match(workspaceSource, /action: "run"/);
  assert.match(workspaceSource, /sessionId: activeCompanionSession\.sessionId/);
  assert.match(workspaceSource, /steps: parameterizedSteps/);
  assert.match(workspaceSource, /setLivePreviewTick\(Date\.now\(\)\)/);
  assert.match(workspaceSource, /Command passed in Live Preview/);
  assert.doesNotMatch(
    workspaceSource,
    /const runSingleCommand = async[\s\S]*?const commandRun = await expandActionSteps\(\[runnableStep\]\)[\s\S]*?setEvents\(\[\]\)/,
  );
});

test("checked commands and actions define selective run scope", () => {
  assert.match(workspaceSource, /const selectedActionStepIds = new Set/);
  assert.match(workspaceSource, /const hasExplicitRunSelection = selectedStepIds\.size > 0 \|\| selectedActionStepIds\.size > 0/);
  assert.match(workspaceSource, /const scopedRunSteps = hasExplicitRunSelection/);
  assert.match(workspaceSource, /selectedStepIds\.has\(step\.id\) \|\|/);
  assert.match(workspaceSource, /selectedActionStepIds\.has\(step\.id\)/);
  assert.match(workspaceSource, /const actionOnlyRunSelection =/);
  assert.match(workspaceSource, /stepsRequiringAction\.every\(\(step\) => step\.action === "action"\)/);
  assert.match(workspaceSource, /if \(!actionOnlyRunSelection\) \{\s*await persistSteps\(runSteps, \{ throwOnError: true \}\);/);
  assert.match(workspaceSource, /Running selected scope:/);
  assert.match(workspaceSource, /expandActionSteps\(scopedRunSteps, \{/);
  assert.match(workspaceSource, /selectedActionCommandKeys,/);
  assert.match(workspaceSource, /substituteStepsParameters\(scopedRunSteps, parameterData\)/);
  assert.match(workspaceSource, /options\.selectedActionStepIds\?\.has\(step\.id\)/);
  assert.match(workspaceSource, /options\.selectedActionCommandKeys\?\.has/);
  assert.match(workspaceSource, /scopedActionSteps\.length/);
});

test("top-level and nested action commands can run one by one", () => {
  assert.match(workspaceSource, /const runSingleCommand = async \(step: AutomationStep\)/);
  assert.match(workspaceSource, /const runActionCommand = async \(actionStep: AutomationStep, command: AutomationStep\)/);
  assert.match(workspaceSource, /sourceActionId: actionStep\.target\?\.value \|\| actionStep\.id/);
  assert.match(workspaceSource, /void runSingleCommand\(step\)/);
  assert.match(workspaceSource, /void runActionCommand\(step, command\)/);
  assert.match(workspaceSource, /if \(actionStep && menuStep\) void runActionCommand\(actionStep, menuStep\)/);
  assert.match(workspaceSource, /title=\{step\.action === "action" \? "Run action" : "Run this command"\}/);
});

test("command timeline supports keyboard navigation and bulk checkbox selection", () => {
  assert.match(workspaceSource, /KeyboardEvent as ReactKeyboardEvent, MouseEvent, WheelEvent as ReactWheelEvent/);
  assert.match(workspaceSource, /const \[timelineSelectionAnchorId, setTimelineSelectionAnchorId\]/);
  assert.match(workspaceSource, /const timelineStepRefs = useRef<Record<string, HTMLDivElement \| null>>/);
  assert.match(workspaceSource, /const timelineStepIds = useMemo/);
  assert.match(workspaceSource, /const allTimelineStepsSelected = timelineStepIds\.length > 0/);
  assert.match(workspaceSource, /const handleTimelineStepKeyDown = \(/);
  assert.match(workspaceSource, /event\.key === "ArrowDown" \|\| event\.key === "ArrowUp"/);
  assert.match(workspaceSource, /event\.shiftKey/);
  assert.match(workspaceSource, /selectTimelineRange\(anchorStepId, nextStepId\)/);
  assert.match(workspaceSource, /event\.key === " " \|\| event\.key === "Spacebar"/);
  assert.match(workspaceSource, /event\.key === "Enter"/);
  assert.match(workspaceSource, /event\.key === "Delete" \|\| event\.key === "Backspace"/);
  assert.match(workspaceSource, /event\.key\.toLowerCase\(\) === "a"/);
  assert.match(workspaceSource, /setAllTimelineStepsSelected\(true\)/);
  assert.match(workspaceSource, /aria-label="Select all commands"/);
  assert.match(workspaceSource, /role="listbox"/);
  assert.match(workspaceSource, /aria-multiselectable="true"/);
  assert.match(workspaceSource, /tabIndex=\{0\}/);
  assert.match(workspaceSource, /onKeyDown=\{\(event\) => handleTimelineStepKeyDown\(event, step, index\)\}/);
});

test("command timeline supports undo for the last persisted change", () => {
  assert.match(workspaceSource, /type TimelineUndoSnapshot = \{/);
  assert.match(workspaceSource, /const \[undoStack, setUndoStack\] = useState<TimelineUndoSnapshot\[\]>\(\[\]\)/);
  assert.match(workspaceSource, /options: \{ skipUndo\?: boolean; throwOnError\?: boolean \} = \{\}/);
  assert.match(workspaceSource, /if \(!options\.skipUndo\) \{/);
  assert.match(workspaceSource, /setUndoStack\(\(current\) => \{/);
  assert.match(workspaceSource, /const undoLastTimelineChange = useCallback\(async \(\) => \{/);
  assert.match(workspaceSource, /await persistSteps\(snapshot\.steps, \{ skipUndo: true, throwOnError: true \}\)/);
  assert.match(workspaceSource, /window\.addEventListener\("keydown", handleUndoShortcut\)/);
  assert.match(workspaceSource, /event\.key\.toLowerCase\(\) !== "z"/);
  assert.match(workspaceSource, /Undo last timeline change/);
});

test("running after undo keeps local timeline ahead of stale server refreshes", () => {
  assert.match(workspaceSource, /const resumeSteps = mergeStepsById\(\[\.\.\.finalizedSteps, \.\.\.liveSteps, \.\.\.latestSteps\]\)/);
  assert.match(workspaceSource, /const runSteps = mergeStepsById\(\[\.\.\.finalizedSteps, \.\.\.liveSteps, \.\.\.latestSteps\]\)/);
  assert.doesNotMatch(workspaceSource, /const runSteps = mergeStepsById\(\[\.\.\.latestSteps, \.\.\.finalizedSteps, \.\.\.liveSteps\]\)/);
  assert.doesNotMatch(workspaceSource, /const resumeSteps = mergeStepsById\(\[\.\.\.latestSteps, \.\.\.finalizedSteps, \.\.\.liveSteps\]\)/);
});

test("nested action commands support checkboxes and keyboard shortcuts", () => {
  assert.match(workspaceSource, /function actionCommandSelectionKey\(actionStepId: string, commandId: string\)/);
  assert.match(workspaceSource, /const \[selectedActionCommandKeys, setSelectedActionCommandKeys\]/);
  assert.match(workspaceSource, /const \[actionCommandSelectionAnchorKey, setActionCommandSelectionAnchorKey\]/);
  assert.match(workspaceSource, /const actionCommandRefs = useRef<Record<string, HTMLDivElement \| null>>/);
  assert.match(workspaceSource, /const toggleActionCommandSelection = \(/);
  assert.match(workspaceSource, /const selectActionCommandRange = \(/);
  assert.match(workspaceSource, /const setAllActionCommandsSelected = \(/);
  assert.match(workspaceSource, /const handleActionCommandKeyDown = \(/);
  assert.match(workspaceSource, /Selected \$\{commandKeys\.length\} action command/);
  assert.match(workspaceSource, /deleteActionCommandsByIds\(actionStep/);
  assert.match(workspaceSource, /aria-label=\{`Select all commands in \$\{step\.commandText \|\| readableStepLabel\(step\)\}`\}/);
  assert.match(workspaceSource, /aria-label=\{`Select action command \$\{commandIndex \+ 1\}`\}/);
  assert.match(workspaceSource, /onKeyDown=\{\(event\) => handleActionCommandKeyDown\(event, step, command, commandIndex\)\}/);
  assert.match(workspaceSource, /role="listbox"[\s\S]{0,220}aria-label=\{`\$\{step\.commandText \|\| readableStepLabel\(step\)\} commands`\}/);
});

test("timeline commands and action commands can be dragged between timeline and actions", () => {
  assert.match(workspaceSource, /const \[actionDropTarget, setActionDropTarget\]/);
  assert.match(workspaceSource, /const canMoveTimelineStepIntoAction = \(actionStep: AutomationStep, sourceStepId\?: string \| null\)/);
  assert.match(workspaceSource, /const moveTimelineStepIntoAction = async \(/);
  assert.match(workspaceSource, /const moveActionCommandToTimeline = async \(/);
  assert.match(workspaceSource, /\/actions\/\$\{encodeURIComponent\(\s*actionStep\.target\.value,\s*\)\}\/steps/);
  assert.match(workspaceSource, /body: JSON\.stringify\(\{\s*afterStepId,\s*step: sourceStep,/);
  assert.match(workspaceSource, /visibleSteps\.filter\(\(step\) => step\.id !== sourceStepId\)/);
  assert.match(workspaceSource, /nextTimelineSteps\.splice\(insertAt, 0, timelineCommand\)/);
  assert.match(workspaceSource, /steps\/\$\{encodeURIComponent\(commandId\)\}/);
  assert.match(workspaceSource, /Moved command out of/);
  assert.match(workspaceSource, /Added command to the bottom of/);
  assert.match(workspaceSource, /Inserted command into/);
  assert.match(workspaceSource, /void moveTimelineStepIntoAction\(step, dragStepId\)/);
  assert.match(workspaceSource, /void moveTimelineStepIntoAction\(step, draggedStepId, commandIndex\)/);
  assert.match(workspaceSource, /void moveActionCommandToTimeline\(/);
  assert.match(workspaceSource, /actionDropTarget\.position === "before"/);
});

test("action wrapper run button shows queued passed and failed state", () => {
  assert.match(workspaceSource, /const actionStepId = step\.id/);
  assert.match(workspaceSource, /\[actionStepId\]: \{[\s\S]{0,120}message: "Queued"[\s\S]{0,120}status: "running"/);
  assert.match(workspaceSource, /\[actionStepId\]: \{[\s\S]{0,120}message: "Passed"[\s\S]{0,120}status: "passed"/);
  assert.match(workspaceSource, /\[actionStepId\]: \{[\s\S]{0,120}message,[\s\S]{0,120}status: "failed"/);
});

test("one-by-one command runs show running passed and failed status on command cards", () => {
  assert.match(workspaceSource, /type CommandRunState = \{/);
  assert.match(workspaceSource, /const \[commandRunStates, setCommandRunStates\]/);
  assert.match(workspaceSource, /commandRunStatusLabel\(state\?: CommandRunState\)/);
  assert.match(workspaceSource, /commandRunStatusTone\(state\?: CommandRunState\)/);
  assert.match(workspaceSource, /event\.type === "step:start"/);
  assert.match(workspaceSource, /status: "running"/);
  assert.match(workspaceSource, /event\.type === "step:success"/);
  assert.match(workspaceSource, /status: "passed"/);
  assert.match(workspaceSource, /event\.type === "step:failed"/);
  assert.match(workspaceSource, /status: "failed"/);
  assert.match(workspaceSource, /const commandRunState = command\.id \? commandRunStates\[command\.id\] : undefined/);
});

test("locator flyout clamps to the viewport and wraps long selectors", () => {
  assert.match(workspaceSource, /viewportWidth - flyoutWidth - margin/);
  assert.match(workspaceSource, /viewportHeight - flyoutHeight - margin/);
  assert.match(workspaceSource, /w-\[min\(360px,calc\(100vw-24px\)\)\]/);
  assert.match(workspaceSource, /overflow-x-hidden/);
  assert.match(workspaceSource, /\[overflow-wrap:anywhere\]/);
});

test("create action modal keeps a stable command snapshot before running", () => {
  assert.match(workspaceSource, /const \[actionModalStepIds, setActionModalStepIds\]/);
  assert.match(workspaceSource, /const \[actionModalTimelineSteps, setActionModalTimelineSteps\]/);
  assert.match(workspaceSource, /const actionModalSelectedSteps = actionModalSourceSteps\.filter/);
  assert.match(workspaceSource, /setActionModalStepIds\(stepIds\)/);
  assert.match(workspaceSource, /setActionModalTimelineSteps\(timelineSteps\)/);
  assert.match(workspaceSource, /const timelineSteps = actionModalTimelineSteps\.length/);
  assert.match(workspaceSource, /const stepIds = actionModalStepIds\.length/);
  assert.match(workspaceSource, /Select at least one command before creating an action/);
  assert.match(workspaceSource, /`\/api\/automation\/projects\/\$\{encodeURIComponent\(projectKey\)\}\/actions`/);
  assert.match(workspaceSource, /scenarioId,/);
  assert.doesNotMatch(workspaceSource, /scenarios\/\$\{encodeURIComponent\(scenarioId\)\}\/actions`/);
  assert.match(scenarioActionRouteSource, /AUTOMATION SCENARIO ACTION POST ERROR/);
  assert.match(scenarioActionRouteSource, /request\.json\(\)\.catch\(\(\) => \(\{\}\)\)/);
});

test("initial navigation is scenario setup and is excluded from reusable actions", () => {
  assert.match(workspaceSource, /function isScenarioInitStep\(step: AutomationStep, index: number\)/);
  assert.match(workspaceSource, /index === 0 && displayAction\(step\.action\) === "navigate"/);
  assert.match(workspaceSource, /function actionCandidateSteps\(steps: AutomationStep\[\]\)/);
  assert.match(workspaceSource, /const stepsRequiringAction = actionCandidateSteps\(scopedRunSteps\)/);
  assert.match(workspaceSource, /stepsRequiringAction\.some\(\(step\) => step\.action !== "action"\)/);
  assert.match(workspaceSource, /const actionableSteps = actionCandidateSteps\(timelineSteps\)/);
  assert.match(workspaceSource, /The initial URL step is scenario setup/);
});

test("valid navigation commands do not show locator confidence badges", () => {
  assert.match(workspaceSource, /if \(action === "navigate"\) \{/);
  assert.match(workspaceSource, /\^https\?:\\\/\\\/.*test\(url\) \? \[\] :/);
  assert.match(workspaceSource, /Missing URL/);
  assert.match(workspaceSource, /Check URL/);
});

test("recording flow does not interrupt with command drawers", () => {
  assert.doesNotMatch(workspaceSource, /setSelectedStepId\(navigateStep\.id\);\s*setDrawerOpen\(true\);/);
  assert.match(workspaceSource, /if \(!recording\) \{[\s\S]{0,180}setDrawerOpen\(true\);/);
  assert.match(workspaceSource, /else \{[\s\S]{0,80}appendLog\("Verify target captured\."\);/);
});

test("live recorded commands can be deleted without reappearing from polling", () => {
  assert.match(workspaceSource, /ignoredRecorderStepIdsRef/);
  assert.match(workspaceSource, /function removeLiveEventsForStepIds|const removeLiveEventsForStepIds =/);
  assert.match(workspaceSource, /eventToStep\(event\)/);
  assert.match(workspaceSource, /ignoredRecorderStepIdsRef\.current\.add\(id\)/);
  assert.match(workspaceSource, /recorderEventsFromProviderEvents\(data\.events \?\? \[\], captureAfterMs\)\.filter/);
});

test("live recorded commands are draft-saved and restored after hard refresh", () => {
  assert.match(workspaceSource, /function draftScenarioForVisibleSteps/);
  assert.match(workspaceSource, /function shouldUseCachedScenario/);
  assert.match(workspaceSource, /if \(!liveSteps\.length\) return;/);
  assert.match(workspaceSource, /writeDraftCache\(projectKey, scenarioId, draftScenario\)/);
  assert.match(workspaceSource, /if \(shouldUseCachedScenario\(loadedScenario, cached\)\)/);
  assert.match(workspaceSource, /setScenario\(cached\)/);
});

test("fill commands show captured input values without exposing secrets", () => {
  assert.match(workspaceSource, /function visibleStepInputValue\(step: AutomationStep\)/);
  assert.match(workspaceSource, /function isSecretInputStep\(step: AutomationStep\)/);
  assert.match(workspaceSource, /Fill \$\{targetName\} with "\$\{value\}"/);
  assert.match(workspaceSource, /value: \{stepValue\}/);
  assert.match(workspaceSource, /return "\*\*\*\*\*\*";/);
});

test("repeated edits to the same recorded field collapse into the latest fill command", () => {
  assert.match(workspaceSource, /function recorderFillFieldKey\(event: RecorderEvent\)/);
  assert.match(workspaceSource, /function recorderEventTimestamp\(event: RecorderEvent\)/);
  assert.match(workspaceSource, /left\.timestamp - right\.timestamp/);
  assert.match(workspaceSource, /const openFillIndexes = new Map<string, number>\(\)/);
  assert.match(workspaceSource, /const openFillTimestamps = new Map<string, number>\(\)/);
  assert.match(workspaceSource, /previousTimestamp > timestamp && timestamp > 0/);
  assert.match(workspaceSource, /merged\[previousIndex\] = null/);
  assert.match(workspaceSource, /openFillIndexes\.set\(fillFieldKey, merged\.length\)/);
  assert.match(workspaceSource, /function isRecorderCommandBoundary\(event: RecorderEvent\)/);
});

test("playback failures show failed step guidance and recovery actions", () => {
  assert.match(workspaceSource, /type StepExecutionResult = \{/);
  assert.match(workspaceSource, /const \[runStatus, setRunStatus\]/);
  assert.match(workspaceSource, /const \[failedStepResult, setFailedStepResult\]/);
  assert.match(workspaceSource, /function stepResultFromEvent\(event: ProviderSessionEvent\)/);
  assert.match(workspaceSource, /Retry Step/);
  assert.match(workspaceSource, /Resume from Previous/);
  assert.match(workspaceSource, /Stop Run/);
  assert.match(workspaceSource, /border-rose-300 bg-rose-50/);
});

test("automation workspace exposes interactive playback separately from formal run", () => {
  assert.match(workspaceSource, /type PlaybackScope =/);
  assert.match(workspaceSource, /type PlaybackStateGuard =/);
  assert.match(workspaceSource, /const \[playbackJobs, setPlaybackJobs\]/);
  assert.match(workspaceSource, /const \[playbackStateGuard, setPlaybackStateGuard\]/);
  assert.match(workspaceSource, /const \[playbackConfig, setPlaybackConfig\]/);
  assert.match(workspaceSource, /const \[playbackConsoleOpen, setPlaybackConsoleOpen\]/);
  assert.match(workspaceSource, /const playbackStepsForScope =/);
  assert.match(workspaceSource, /const playbackStateGuardFor =/);
  assert.match(workspaceSource, /Current browser URL/);
  assert.match(workspaceSource, /Selected command expected page/);
  assert.match(workspaceSource, /Continue Anyway/);
  assert.match(workspaceSource, /Navigate to Starting URL/);
  assert.match(workspaceSource, /Playback from Beginning/);
  assert.match(workspaceSource, /const startPlayback = async/);
  assert.match(workspaceSource, /selectedToEnd/);
  assert.match(workspaceSource, /startToSelected/);
  assert.match(workspaceSource, /singleCommand/);
  assert.match(workspaceSource, /Playback/);
  assert.match(workspaceSource, /To End/);
  assert.match(workspaceSource, /To Here/);
  assert.match(workspaceSource, /Playback Console/);
  assert.match(workspaceSource, /Stop Queue/);
  assert.match(workspaceSource, /Playback Config/);
  assert.match(workspaceSource, /this phase only executes web commands through Companion\/Playwright/);
  assert.match(workspaceSource, /suppressRecording: true/);
});

test("playback configuration supports timeout healing environment and parameter controls", () => {
  assert.match(workspaceSource, /autoElementTimeoutMs: 5000/);
  assert.match(workspaceSource, /manualElementTimeoutMs: 30000/);
  assert.match(workspaceSource, /manualPageTimeoutMs: 60000/);
  assert.match(workspaceSource, /pauseOnElementErrors/);
  assert.match(workspaceSource, /selfHealingEnabled/);
  assert.match(workspaceSource, /environmentId/);
  assert.match(workspaceSource, /executionParameters/);
  assert.match(workspaceSource, /Auto playback/);
  assert.match(workspaceSource, /Pause on Element Errors/);
  assert.match(workspaceSource, /Enable Self-Healing/);
  assert.match(workspaceSource, /savePlaybackConfig/);
});

test("canvas tab captures views renders overlays and inserts catalog commands", () => {
  assert.match(workspaceSource, /type CanvasView =/);
  assert.match(workspaceSource, /type CanvasElement =/);
  assert.match(workspaceSource, /const \[workspaceTab, setWorkspaceTab\]/);
  assert.match(workspaceSource, /const \[canvasView, setCanvasView\]/);
  assert.match(workspaceSource, /const \[canvasElements, setCanvasElements\]/);
  assert.match(workspaceSource, /const \[canvasExploreElement, setCanvasExploreElement\]/);
  assert.match(workspaceSource, /const \[canvasInsertPreview, setCanvasInsertPreview\]/);
  assert.match(workspaceSource, /const canvasCandidateStack =/);
  assert.match(workspaceSource, /const openCanvasExploreMode =/);
  assert.match(workspaceSource, /const previewCanvasCommandInsert =/);
  assert.match(workspaceSource, /const captureCanvasFromTimeline = async/);
  assert.match(workspaceSource, /const saveCanvasElement = async/);
  assert.match(workspaceSource, /const remapCanvasElement = async/);
  assert.match(workspaceSource, /const insertCanvasCommand = async/);
  assert.match(workspaceSource, /Canvas/);
  assert.match(workspaceSource, /Capture Canvas/);
  assert.match(workspaceSource, /Save Element/);
  assert.match(workspaceSource, /Re-map Saved Element/);
  assert.match(workspaceSource, /Test Locator/);
  assert.match(workspaceSource, /Insert Command/);
  assert.match(workspaceSource, /Show Usage/);
  assert.match(workspaceSource, /Explore Mode/);
  assert.match(workspaceSource, /Command Insertion Preview/);
  assert.match(workspaceSource, /Insert position/);
  assert.match(workspaceSource, /Candidate hierarchy: parent \/ current \/ child \/ sibling/);
  assert.match(workspaceSource, /canvasBoxStyle/);
  assert.match(workspaceSource, /border-emerald-500/);
  assert.match(workspaceSource, /border-sky-500/);
  assert.match(workspaceSource, /border-orange-400/);
  assert.match(workspaceSource, /border-dotted/);
});

test("command library groups authorable phase 3 commands by catalog domain", () => {
  assert.match(workspaceSource, /AUTOMATION_COMMAND_CATALOG/);
  assert.match(workspaceSource, /commandCatalogByDomain/);
  assert.match(workspaceSource, /const commandActionOptions = \[/);
  assert.match(workspaceSource, /AUTOMATION_COMMAND_CATALOG\.filter\(\(command\) => command\.visibleInDropdown !== false\)/);
  assert.match(workspaceSource, /const visibleCommands = AUTOMATION_COMMAND_CATALOG\.filter\(\(command\) => command\.visibleInLibrary !== false\)/);
  assert.match(workspaceSource, /disabled=\{!implemented\}/);
  assert.match(workspaceSource, /Coming soon/);
  assert.match(workspaceSource, /Command Library/);
  assert.match(workspaceSource, /Object\.entries\(commandCatalogByDomain\)/);
  assert.match(workspaceSource, /adapter pending/);
  assert.match(workspaceSource, /makeManualStep\(visibleSteps\.length \+ 1\)/);
  assert.match(workspaceSource, /command\.executable && command\.domain === "web"/);
});

test("automation workspace grid clamps browser timeline and failure panels", () => {
  assert.match(workspaceSource, /grid min-h-\[700px\] min-w-0 gap-3/);
  assert.match(workspaceSource, /grid min-w-0 grid-rows-\[minmax\(0,1fr\)_auto\] gap-3 overflow-hidden/);
  assert.match(workspaceSource, /Math\.max\(660, activeLivePreviewSize\.panelMinHeight \+ 100\)/);
  assert.match(workspaceSource, /relative min-w-0 overflow-hidden rounded-\[16px\]/);
  assert.match(workspaceSource, /flex min-w-0 flex-wrap items-center justify-between/);
  assert.match(workspaceSource, /min-w-0 flex-1 truncate text-xs/);
  assert.match(workspaceSource, /min-w-0 rounded-\[14px\] border border-rose-200/);
  assert.match(workspaceSource, /livePreviewSize === "full" \? "min-h-\[420px\]" : "min-h-\[660px\]"/);
});
