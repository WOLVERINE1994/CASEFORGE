import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const languageCoreSource = readFileSync(
  new URL("../../utils/automation/language-core.ts", import.meta.url),
  "utf8",
);
const workspaceSource = readFileSync(
  new URL("../../components/AutomationScenarioWorkspace.tsx", import.meta.url),
  "utf8",
);

test("phase 3 automation language core models variables outputs control flow and runtime context", () => {
  assert.match(languageCoreSource, /export type AutomationStepKind =/);
  assert.match(languageCoreSource, /"ifElse"/);
  assert.match(languageCoreSource, /"loop"/);
  assert.match(languageCoreSource, /"reusableActionCall"/);
  assert.match(languageCoreSource, /export type StepParameterValue = \{/);
  assert.match(languageCoreSource, /valueType: StepParameterValueType/);
  assert.match(languageCoreSource, /export type AutomationVariableStore =/);
  assert.match(languageCoreSource, /export type AutomationOutputDefinition = \{/);
  assert.match(languageCoreSource, /export type AutomationExecutionContext = \{/);
  assert.match(languageCoreSource, /secretsProvider\?:/);
  assert.match(languageCoreSource, /failureState\?:/);
  assert.match(languageCoreSource, /export type AutomationIfElseStep = \{/);
  assert.match(languageCoreSource, /thenSteps: AutomationLanguageStep\[\]/);
  assert.match(languageCoreSource, /export type AutomationLoopStep = \{/);
  assert.match(languageCoreSource, /loopType: AutomationLoopType/);
  assert.match(languageCoreSource, /export type AutomationReusableAction = \{/);
  assert.match(languageCoreSource, /inputMappings: Record<string, StepParameterValue>/);
});

test("language core exposes command catalog families from the provided command set", () => {
  assert.match(languageCoreSource, /export const AUTOMATION_COMMAND_CATALOG/);
  assert.match(languageCoreSource, /Click on a Web Element/);
  assert.match(languageCoreSource, /Double click on a Web Element/);
  assert.match(languageCoreSource, /Right click on a Web Element/);
  assert.match(languageCoreSource, /Verify Page Contains Text[\s\S]{0,220}runtimeHandler: "web\.verifyPageText"/);
  assert.doesNotMatch(languageCoreSource, /Verify Page Contains Text[\s\S]{0,220}executable: false/);
  assert.match(languageCoreSource, /Select an item from a Web Dropdown/);
  assert.match(languageCoreSource, /Enter text in a Web Input/);
  assert.match(languageCoreSource, /Upload file with Web Element/);
  assert.match(languageCoreSource, /Click on mobile element/);
  assert.match(languageCoreSource, /Open PDF file/);
  assert.match(languageCoreSource, /Click on OCR located text on Desktop/);
  assert.match(languageCoreSource, /Invoke ReST Request \(GET\)/);
  assert.match(languageCoreSource, /Execute Database Query/);
  assert.match(languageCoreSource, /Get JSON Node value/);
  assert.match(languageCoreSource, /Verify File Exists/);
  assert.match(languageCoreSource, /Execute Salesforce query/);
  assert.match(languageCoreSource, /Open Salesforce Setup/);
  assert.match(languageCoreSource, /Search Salesforce Setup Quick Find/);
  assert.match(languageCoreSource, /Open Object Manager for object/);
  assert.match(languageCoreSource, /Verify Salesforce field configuration/);
  assert.match(languageCoreSource, /Verify Salesforce validation rule/);
  assert.match(languageCoreSource, /Verify Salesforce permission access/);
  assert.match(languageCoreSource, /Run Salesforce report/);
  assert.match(languageCoreSource, /Install AppExchange package/);
  assert.match(languageCoreSource, /Verify Salesforce Setup Audit Trail/);
  assert.match(languageCoreSource, /Global Search in Workday/);
  assert.match(languageCoreSource, /Navigate to Transaction from Current SAP Screen/);
  assert.match(languageCoreSource, /Get Random Email/);
  assert.match(languageCoreSource, /export const PLAYWRIGHT_EXECUTABLE_COMMANDS/);
});

test("language core keeps expression evaluation safe and validates common authoring mistakes", () => {
  assert.match(languageCoreSource, /export function evaluateAutomationExpression/);
  assert.match(languageCoreSource, /parseSimpleExpression/);
  assert.match(languageCoreSource, /safeRegexTest/);
  assert.doesNotMatch(languageCoreSource, /\beval\s*\(/);
  assert.doesNotMatch(languageCoreSource, /new Function/);
  assert.match(languageCoreSource, /export function validateAutomationStep/);
  assert.match(languageCoreSource, /"missing_required_param"/);
  assert.match(languageCoreSource, /"unknown_variable"/);
  assert.match(languageCoreSource, /"missing_secret"/);
  assert.match(languageCoreSource, /"invalid_loop_source"/);
  assert.match(languageCoreSource, /"invalid_reusable_action_input"/);
});

test("language core supports all phase 3 parameter value sources and validation categories", () => {
  assert.match(languageCoreSource, /export type StepParameterValueType =/);
  assert.match(languageCoreSource, /"static"/);
  assert.match(languageCoreSource, /"variable"/);
  assert.match(languageCoreSource, /"secret"/);
  assert.match(languageCoreSource, /"testData"/);
  assert.match(languageCoreSource, /"environment"/);
  assert.match(languageCoreSource, /"generated"/);
  assert.match(languageCoreSource, /"expression"/);
  assert.match(languageCoreSource, /"previousStepOutput"/);
  assert.match(languageCoreSource, /"type_mismatch"/);
  assert.match(languageCoreSource, /"invalid_expression"/);
  assert.match(languageCoreSource, /"duplicate_variable"/);
  assert.match(languageCoreSource, /"missing_output_mapping"/);
  assert.match(languageCoreSource, /"unsupported_command"/);
});

test("command catalog entries carry executable metadata and normalized internal actions", () => {
  assert.match(languageCoreSource, /domain: AutomationCommandDomain/);
  assert.match(languageCoreSource, /aliases: string\[\]/);
  assert.match(languageCoreSource, /id: string/);
  assert.match(languageCoreSource, /category: string/);
  assert.match(languageCoreSource, /runtimeHandler: string/);
  assert.match(languageCoreSource, /supportStatus: AutomationCommandSupportStatus/);
  assert.match(languageCoreSource, /defaultTimeoutMs: number/);
  assert.match(languageCoreSource, /logging: \{/);
  assert.match(languageCoreSource, /parameters: AutomationCommandParameterDefinition\[\]/);
  assert.match(languageCoreSource, /inputs: AutomationCommandParameterDefinition\[\]/);
  assert.match(languageCoreSource, /outputs: AutomationOutputDefinition\[\]/);
  assert.match(languageCoreSource, /outputDefinition: AutomationOutputDefinition/);
  assert.match(languageCoreSource, /executable: boolean/);
  assert.match(languageCoreSource, /normalizedAction: string/);
  assert.match(languageCoreSource, /normalizedAction: action/);
  assert.match(languageCoreSource, /const domain = options\.domain \?\? "web"/);
  assert.match(languageCoreSource, /supportStatus === "implemented"/);
  assert.match(languageCoreSource, /domain: "api"[\s\S]{0,240}executable: false/);
  assert.match(languageCoreSource, /domain: "database"[\s\S]{0,240}executable: false/);
  assert.match(languageCoreSource, /domain: "mobile"[\s\S]{0,240}executable: false/);
  assert.match(languageCoreSource, /domain: "enterprise"[\s\S]{0,240}executable: false/);
});

test("workspace command picker and live library use the shared command registry", () => {
  assert.match(workspaceSource, /AUTOMATION_COMMAND_CATALOG\.filter\(\(command\) => command\.visibleInDropdown !== false\)/);
  assert.match(workspaceSource, /AUTOMATION_COMMAND_CATALOG\.filter\(\(command\) => command\.visibleInLibrary !== false\)/);
  assert.match(workspaceSource, /commandDefinitionForAction/);
  assert.match(workspaceSource, /normalizeAutomationAction/);
  assert.match(workspaceSource, /valueSourceOptions/);
  assert.match(workspaceSource, /Value source/);
  assert.match(workspaceSource, /Save \{selectedCommandOutputTypeLabel\} as variable/);
  assert.match(workspaceSource, /Optional condition expression/);
  assert.match(workspaceSource, /Failure behavior/);
  assert.match(workspaceSource, /Screenshot on failure/);
  assert.match(workspaceSource, /phaseFailureBehavior/);
  assert.match(workspaceSource, /phaseParameterPreview/);
  assert.match(workspaceSource, /function commandRequiresLocator\(action: string\)/);
  assert.match(workspaceSource, /function commandShowsInputValue\(action: string\)/);
  assert.match(workspaceSource, /function commandSupportsTestData\(action: string\)/);
  assert.match(workspaceSource, /const selectedCommandDefinition =/);
  assert.match(workspaceSource, /selectedCommandDefinition\.inputs\.filter/);
  assert.match(workspaceSource, /shouldRenderCommandSchemaParameter/);
  assert.match(workspaceSource, /Fields are generated from the shared CaseForge command registry/);
  assert.match(workspaceSource, /updateCommandSchemaParameter/);
  assert.match(workspaceSource, /Coming soon/);
  assert.match(workspaceSource, /Double click \$\{targetName\}/);
  assert.match(workspaceSource, /Right click \$\{targetName\}/);
  assert.match(workspaceSource, /Clear \$\{targetName\}/);
  assert.match(workspaceSource, /Check \$\{targetName\}/);
  assert.match(workspaceSource, /Uncheck \$\{targetName\}/);
});
