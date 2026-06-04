import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspaceSource = readFileSync(
  new URL("../../components/AutomationScenarioWorkspace.tsx", import.meta.url),
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
  assert.match(projectSidebarSource, /cf-safe-wrap mt-3 text-xl/);
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
  assert.match(workspaceSource, /Test Data/);
  assert.match(workspaceSource, /Test data parameter/);
  assert.match(workspaceSource, /inputValue: parameterName \? parameterToken\(parameterName\) : ""/);
  assert.match(workspaceSource, /parameterName: parameterName \|\| undefined/);
  assert.match(workspaceSource, /const saveOpenCommandPromptDraft = async \(\) => \{/);
  assert.match(workspaceSource, /const activeRunTestData = \(\) => \{/);
  assert.match(workspaceSource, /normalizedTestDataDrafts\(parameterDrafts, testCaseDrafts\)/);
  assert.match(workspaceSource, /const currentStepForRun = \(step: AutomationStep\)/);
  assert.match(workspaceSource, /for \(const \[index, testCase\] of activeTestCases\.entries\(\)\)/);
  assert.match(workspaceSource, /substituteStepsParameters\(executableSteps, parameterData\)/);
  assert.match(workspaceSource, /name: `\$\{scenarioName\} \/ \$\{testCase\.name\}`/);
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
  assert.match(workspaceSource, /const commandContextSteps = timelineContextStepsForStep\(runnableStep, setupSourceSteps\)/);
  assert.match(workspaceSource, /const commandRun = await expandActionSteps\(commandContextSteps\)/);
  assert.match(workspaceSource, /const parameterizedSteps = substituteStepsParameters\(commandSteps, parameterData\)/);
  assert.match(workspaceSource, /const parameterizedSummarySteps = substituteStepsParameters\(\[runnableStep\], parameterData\)/);
  assert.match(workspaceSource, /const executableSteps = withScenarioInitSteps\(parameterizedSteps, parameterizedSetupSteps\)/);
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

test("single command and action runs include scenario init setup", () => {
  assert.match(workspaceSource, /function scenarioInitSteps\(steps: AutomationStep\[\]\)/);
  assert.match(workspaceSource, /function withScenarioInitSteps\(runSteps: AutomationStep\[\], setupSourceSteps: AutomationStep\[\]\)/);
  assert.match(workspaceSource, /function timelineContextStepsForStep\(step: AutomationStep, sourceSteps: AutomationStep\[\]\)/);
  assert.match(workspaceSource, /if \(!runSteps\.length \|\| firstNavigationUrl\(runSteps\)\) return runSteps/);
  assert.match(workspaceSource, /const setupSourceSteps = mergeStepsById\(\[\.\.\.finalizedSteps, \.\.\.liveSteps, \.\.\.latestSteps\]\)/);
  assert.match(workspaceSource, /const parameterizedSetupSteps = substituteStepsParameters\(setupSourceSteps, parameterData\)/);
  assert.match(workspaceSource, /startUrl: firstNavigationUrl\(executableActionSteps\) \|\| normalizeUrl\(targetUrl\)/);
  assert.match(workspaceSource, /startUrl: firstNavigationUrl\(executableSteps\) \|\| normalizeUrl\(targetUrl\)/);
  assert.match(workspaceSource, /summarySteps: parameterizedSummarySteps/);
});

test("single command and action runs replay prior scenario context", () => {
  assert.match(workspaceSource, /return \[\.\.\.sourceSteps\.slice\(0, stepIndex\), step\]/);
  assert.match(workspaceSource, /const actionContextSteps = timelineContextStepsForStep\(runnableStep, setupSourceSteps\)/);
  assert.match(workspaceSource, /const actionRun = await expandActionSteps\(actionContextSteps, \{/);
  assert.match(workspaceSource, /Running action with scenario context/);
  assert.match(workspaceSource, /const commandContextSteps = timelineContextStepsForStep\(runnableStep, setupSourceSteps\)/);
  assert.match(workspaceSource, /summarySteps: parameterizedSummarySteps/);
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
  assert.match(workspaceSource, /parameterizedSummarySteps = substituteStepsParameters\(scopedRunSteps, parameterData\)/);
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
  assert.match(workspaceSource, /import type \{ KeyboardEvent as ReactKeyboardEvent, MouseEvent \} from "react"/);
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
  assert.match(workspaceSource, /if \(shouldUseCachedScenario\(data\.scenario, cached\)\)/);
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

test("automation workspace grid clamps browser timeline and failure panels", () => {
  assert.match(workspaceSource, /grid min-h-\[700px\] min-w-0 gap-3/);
  assert.match(workspaceSource, /grid min-h-\[660px\] min-w-0 grid-rows-\[minmax\(0,1fr\)_auto\] gap-3 overflow-hidden/);
  assert.match(workspaceSource, /relative min-w-0 overflow-hidden rounded-\[16px\]/);
  assert.match(workspaceSource, /flex min-w-0 flex-wrap items-center justify-between/);
  assert.match(workspaceSource, /min-w-0 flex-1 truncate text-xs/);
  assert.match(workspaceSource, /min-w-0 rounded-\[14px\] border border-rose-200/);
  assert.match(workspaceSource, /grid min-h-\[660px\] min-w-0 grid-rows-\[minmax\(0,1fr\)_auto\] gap-3 overflow-hidden/);
});
