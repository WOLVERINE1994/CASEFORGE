import type { AutomationStep } from "./types";

export type AutomationStepKind =
  | "command"
  | "assertion"
  | "ifElse"
  | "loop"
  | "reusableActionCall"
  | "comment"
  | "group"
  | "wait"
  | "dataSetup"
  | "dataCleanup";

export type StepParameterValueType =
  | "static"
  | "variable"
  | "secret"
  | "testData"
  | "environment"
  | "generated"
  | "expression"
  | "previousStepOutput";

export type StepParameterValue = {
  parameterName: string;
  valueType: StepParameterValueType;
  rawValue: unknown;
  resolvedValue?: unknown;
  isResolvedAtRuntime: boolean;
  isSecret: boolean;
  displayValue?: string;
};

export type AutomationVariableSource =
  | "manual"
  | "environment"
  | "testData"
  | "commandOutput"
  | "generated"
  | "secretReference"
  | "expressionResult";

export type AutomationVariableRecord = {
  name: string;
  source: AutomationVariableSource;
  value?: unknown;
  displayValue?: string;
  isSecret?: boolean;
};

export type AutomationVariableStore = Record<string, AutomationVariableRecord>;

export type AutomationOutputType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "passFail"
  | "void";

export type AutomationOutputDefinition = {
  outputType: AutomationOutputType;
  outputSchema?: Record<string, unknown>;
  canSaveAsVariable: boolean;
  defaultOutputVariableName?: string;
};

export type AutomationStepFailureBehavior = {
  stopOnFailure: boolean;
  continueOnFailure: boolean;
  retryCount: number;
  timeoutMs: number;
  screenshotOnFailure: boolean;
  recoveryActionId?: string;
};

export type AutomationConditionOperator =
  | "equals"
  | "notEquals"
  | "contains"
  | "notContains"
  | "greaterThan"
  | "lessThan"
  | "greaterOrEqual"
  | "lessOrEqual"
  | "regex"
  | "isEmpty"
  | "isNotEmpty"
  | "exists"
  | "notExists"
  | "and"
  | "or"
  | "not";

export type AutomationCondition =
  | {
      operator: Exclude<AutomationConditionOperator, "and" | "or" | "not">;
      left?: unknown;
      right?: unknown;
    }
  | {
      operator: "and" | "or";
      conditions: AutomationCondition[];
    }
  | {
      operator: "not";
      condition: AutomationCondition;
    };

export type AutomationIfElseStep = {
  kind: "ifElse";
  condition: AutomationCondition | string;
  thenSteps: AutomationLanguageStep[];
  elseSteps: AutomationLanguageStep[];
};

export type AutomationLoopType =
  | "repeatCount"
  | "forEachDataRow"
  | "forEachListItem"
  | "whileCondition";

export type AutomationLoopStep = {
  kind: "loop";
  loopType: AutomationLoopType;
  source?: string;
  maxIterations: number;
  steps: AutomationLanguageStep[];
};

export type AutomationReusableAction = {
  id?: string;
  name: string;
  description?: string;
  inputParams: StepParameterValue[];
  outputParams: AutomationOutputDefinition[];
  steps: AutomationLanguageStep[];
  tags: string[];
};

export type AutomationReusableActionCallStep = {
  kind: "reusableActionCall";
  actionId: string;
  inputMappings: Record<string, StepParameterValue>;
  outputMappings: Record<string, string>;
};

export type AutomationLanguageStep =
  | (AutomationStep & {
      kind?: "command" | "assertion" | "wait" | "comment" | "group" | "dataSetup" | "dataCleanup";
      parameters?: StepParameterValue[];
      outputDefinition?: AutomationOutputDefinition;
      outputVariableName?: string;
      failureBehavior?: AutomationStepFailureBehavior;
      childSteps?: AutomationLanguageStep[];
    })
  | AutomationIfElseStep
  | AutomationLoopStep
  | AutomationReusableActionCallStep;

export type AutomationExecutionContext = {
  projectId: string;
  scenarioId?: string;
  runId: string;
  environment: Record<string, unknown>;
  variables: AutomationVariableStore;
  secretsProvider?: (name: string) => unknown;
  currentTestDataRow?: Record<string, unknown>;
  browser?: unknown;
  session?: unknown;
  artifacts: Array<Record<string, unknown>>;
  logs: string[];
  outputs: Record<string, unknown>;
  failureState?: Record<string, unknown>;
};

export type AutomationCommandDomain =
  | "web"
  | "mobile"
  | "pdf"
  | "api"
  | "database"
  | "data"
  | "file"
  | "utility"
  | "desktop"
  | "enterprise";

export type AutomationCommandSupportStatus = "implemented" | "planned" | "disabled";

export type AutomationCommandParameterType =
  | "locator"
  | "string"
  | "secureString"
  | "secret"
  | "number"
  | "boolean"
  | "select"
  | "multiSelect"
  | "keyboardKey"
  | "cssProperty"
  | "attributeName"
  | "propertyName"
  | "url"
  | "filePath"
  | "json"
  | "expression"
  | "variableName"
  | "variableReference"
  | "dateTime"
  | "connection"
  | "query"
  | "coordinates";

export type AutomationCommandParameterDefinition = {
  name: string;
  label?: string;
  type?: AutomationCommandParameterType;
  required?: boolean;
  valueTypes?: StepParameterValueType[];
  valueSourceAllowed?: StepParameterValueType[];
  defaultValue?: unknown;
  options?: Array<{ label: string; value: string }>;
  description?: string;
};

export type AutomationCommandDefinition = {
  action: string;
  aliases: string[];
  category: string;
  defaultRetryCount: number;
  defaultTimeoutMs: number;
  description: string;
  domain: AutomationCommandDomain;
  label: string;
  id: string;
  normalizedAction: string;
  logging: {
    onStart: string;
    onSuccess: string;
    onFailure: string;
  };
  runtimeAction: string;
  runtimeHandler: string;
  stepKind: AutomationStepKind;
  executable: boolean;
  supportStatus: AutomationCommandSupportStatus;
  visibleInDropdown: boolean;
  visibleInLibrary: boolean;
  parameters: AutomationCommandParameterDefinition[];
  inputs: AutomationCommandParameterDefinition[];
  outputDefinition: AutomationOutputDefinition;
  outputs: AutomationOutputDefinition[];
  canSaveOutput: boolean;
};

export type AutomationValidationIssueCode =
  | "missing_required_param"
  | "type_mismatch"
  | "unknown_variable"
  | "missing_secret"
  | "invalid_expression"
  | "duplicate_variable"
  | "missing_output_mapping"
  | "invalid_loop_source"
  | "invalid_reusable_action_input"
  | "unsupported_command";

export type AutomationLanguageValidationIssue = {
  code: AutomationValidationIssueCode;
  message: string;
  path?: string;
  severity: "error" | "warning";
};

export type AutomationLanguageValidationResult = {
  valid: boolean;
  issues: AutomationLanguageValidationIssue[];
};

const defaultFailureBehavior: AutomationStepFailureBehavior = {
  continueOnFailure: false,
  retryCount: 0,
  screenshotOnFailure: true,
  stopOnFailure: true,
  timeoutMs: 30000,
};

const stringOutput: AutomationOutputDefinition = {
  canSaveAsVariable: true,
  defaultOutputVariableName: "textValue",
  outputType: "string",
};

const passFailOutput: AutomationOutputDefinition = {
  canSaveAsVariable: true,
  defaultOutputVariableName: "verificationPassed",
  outputType: "passFail",
};

const accordionValidationOutput: AutomationOutputDefinition = {
  canSaveAsVariable: true,
  defaultOutputVariableName: "accordionResults",
  outputSchema: {
    properties: {
      accordionCount: { type: "number" },
      failed: { type: "number" },
      failedAccordionItems: { type: "array" },
      passed: { type: "number" },
      results: { type: "array" },
    },
    type: "object",
  },
  outputType: "object",
};

const tableDataOutput: AutomationOutputDefinition = {
  canSaveAsVariable: true,
  defaultOutputVariableName: "tableData",
  outputSchema: {
    properties: {
      columnCount: { type: "number" },
      headers: { type: "array" },
      rowCount: { type: "number" },
      tableData: { type: "array" },
      warnings: { type: "array" },
    },
    type: "object",
  },
  outputType: "object",
};

const tableValidationOutput: AutomationOutputDefinition = {
  canSaveAsVariable: true,
  defaultOutputVariableName: "tableValidation",
  outputSchema: {
    properties: {
      columnCount: { type: "number" },
      failedCells: { type: "array" },
      failedRows: { type: "array" },
      headers: { type: "array" },
      rowCount: { type: "number" },
      tableData: { type: "array" },
      warnings: { type: "array" },
    },
    type: "object",
  },
  outputType: "object",
};

const tableComparisonOutput: AutomationOutputDefinition = {
  canSaveAsVariable: true,
  defaultOutputVariableName: "tableComparison",
  outputSchema: {
    properties: {
      extraColumns: { type: "array" },
      extraRows: { type: "array" },
      failedCount: { type: "number" },
      mismatchedCells: { type: "array" },
      missingColumns: { type: "array" },
      missingRows: { type: "array" },
      passedCount: { type: "number" },
      warnings: { type: "array" },
    },
    type: "object",
  },
  outputType: "object",
};

const flowControlOutput: AutomationOutputDefinition = {
  canSaveAsVariable: true,
  defaultOutputVariableName: "flowResult",
  outputSchema: {
    properties: {
      branch: { type: "string" },
      conditionPassed: { type: "boolean" },
      executedSteps: { type: "number" },
      skippedBranches: { type: "array" },
    },
    type: "object",
  },
  outputType: "object",
};

const loopControlOutput: AutomationOutputDefinition = {
  canSaveAsVariable: true,
  defaultOutputVariableName: "loopResult",
  outputSchema: {
    properties: {
      failed: { type: "number" },
      iterations: { type: "number" },
      passed: { type: "number" },
      results: { type: "array" },
    },
    type: "object",
  },
  outputType: "object",
};

const collectionOutput: AutomationOutputDefinition = {
  canSaveAsVariable: true,
  defaultOutputVariableName: "collectionResult",
  outputSchema: {
    properties: {
      count: { type: "number" },
      result: {},
      sourceType: { type: "string" },
    },
    type: "object",
  },
  outputType: "object",
};

const comparisonOutput: AutomationOutputDefinition = {
  canSaveAsVariable: true,
  defaultOutputVariableName: "comparisonResult",
  outputSchema: {
    properties: {
      failedCount: { type: "number" },
      mismatches: { type: "array" },
      passed: { type: "boolean" },
      passedCount: { type: "number" },
    },
    type: "object",
  },
  outputType: "object",
};

const voidOutput: AutomationOutputDefinition = {
  canSaveAsVariable: false,
  outputType: "void",
};

const allValueSources: StepParameterValueType[] = [
  "static",
  "variable",
  "secret",
  "testData",
  "environment",
  "generated",
  "expression",
  "previousStepOutput",
];

const inputValueSources: StepParameterValueType[] = [
  "static",
  "variable",
  "testData",
  "environment",
  "generated",
  "expression",
  "previousStepOutput",
];

const secretValueSources: StepParameterValueType[] = ["secret", "environment", "variable", "testData"];

const noOutput: AutomationOutputDefinition[] = [];

function param(
  name: string,
  type: AutomationCommandParameterType,
  options: Omit<AutomationCommandParameterDefinition, "name" | "type"> = {},
): AutomationCommandParameterDefinition {
  return {
    label: options.label ?? name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^\w/, (match) => match.toUpperCase()),
    name,
    type,
    valueSourceAllowed:
      options.valueSourceAllowed ??
      (type === "secureString" || type === "secret" ? secretValueSources : inputValueSources),
    ...options,
  };
}

const locatorParam = (options: Omit<AutomationCommandParameterDefinition, "name" | "type"> = {}) =>
  param("locator", "locator", { required: true, ...options });

const elementIndexParam = param("elementIndex", "string", {
  description: "Optional element number to target when the locator matches multiple elements. Supports variables like {{loop.number}}.",
  label: "Element Index",
  required: false,
  valueSourceAllowed: allValueSources,
});

const indexBaseParam = param("indexBase", "select", {
  defaultValue: "oneBased",
  description: "Use one-based indexes for loop numbers, or zero-based indexes for developer-style indexes.",
  label: "Index Base",
  options: [
    { label: "One-based", value: "oneBased" },
    { label: "Zero-based", value: "zeroBased" },
  ],
});

const indexedLocatorParams = (options: Omit<AutomationCommandParameterDefinition, "name" | "type"> = {}) => [
  locatorParam(options),
  elementIndexParam,
  indexBaseParam,
];

const timeoutParam = param("timeoutMs", "number", {
  defaultValue: 30000,
  description: "Maximum wait time for this command.",
});

const matchTypeParam = param("matchType", "select", {
  defaultValue: "contains",
  options: [
    { label: "Equals", value: "equals" },
    { label: "Contains", value: "contains" },
    { label: "Regex", value: "regex" },
    { label: "Starts with", value: "startsWith" },
    { label: "Ends with", value: "endsWith" },
  ],
});

const operatorParam = param("operator", "select", {
  defaultValue: "equals",
  options: [
    { label: "Equals", value: "equals" },
    { label: "Not equals", value: "notEquals" },
    { label: "Contains", value: "contains" },
    { label: "Does not contain", value: "notContains" },
    { label: "Greater than", value: "greaterThan" },
    { label: "Less than", value: "lessThan" },
    { label: "Greater or equal", value: "greaterOrEqual" },
    { label: "Less or equal", value: "lessOrEqual" },
    { label: "Regex", value: "regex" },
    { label: "Is empty", value: "isEmpty" },
    { label: "Is not empty", value: "isNotEmpty" },
  ],
});

function command(
  action: string,
  label: string,
  parameters: AutomationCommandParameterDefinition[],
  options: Partial<AutomationCommandDefinition> = {},
): AutomationCommandDefinition {
  const supportStatus =
    options.supportStatus ?? (options.executable === false ? "planned" : "implemented");
  const executable = supportStatus === "implemented" && options.executable !== false;
  const outputDefinition = options.outputDefinition ?? voidOutput;
  const domain = options.domain ?? "web";
  const category = options.category ?? `${domain}.general`;
  const id = options.id ?? `${domain}.${action}`;
  return {
    action,
    aliases: options.aliases ?? [],
    canSaveOutput: options.canSaveOutput ?? outputDefinition.canSaveAsVariable,
    category,
    defaultRetryCount: options.defaultRetryCount ?? 0,
    defaultTimeoutMs: options.defaultTimeoutMs ?? 30000,
    description: options.description ?? label,
    domain,
    executable,
    id,
    label,
    logging: options.logging ?? {
      onFailure: `${label} failed.`,
      onStart: `${label} started.`,
      onSuccess: `${label} completed.`,
    },
    normalizedAction: action,
    runtimeAction: options.runtimeAction ?? action,
    runtimeHandler: options.runtimeHandler ?? `${domain}.${action}`,
    outputDefinition,
    outputs: options.outputs ?? (outputDefinition.outputType === "void" ? noOutput : [outputDefinition]),
    parameters,
    inputs: options.inputs ?? parameters,
    stepKind: options.stepKind ?? "command",
    supportStatus,
    visibleInDropdown: options.visibleInDropdown ?? true,
    visibleInLibrary: options.visibleInLibrary ?? true,
  };
}

export const AUTOMATION_COMMAND_CATALOG: AutomationCommandDefinition[] = [
  command("navigate", "Load URL in Browser", [param("url", "url", { required: true })], {
    aliases: ["goto", "Open URL", "Navigate", "Load URL in an existing browser", "Invoke new browser with a URL"],
    category: "browser.navigation",
    description: "Navigates the current browser page to a URL.",
    runtimeHandler: "web.navigate",
  }),
  command("goBack", "Navigate Back in Browser", [], {
    aliases: ["Browser back", "Go back"],
    category: "browser.navigation",
    runtimeHandler: "web.goBack",
  }),
  command("goForward", "Navigate Forward in Browser", [], {
    aliases: ["Browser forward", "Go forward"],
    category: "browser.navigation",
    runtimeHandler: "web.goForward",
  }),
  command("reload", "Reload Browser", [], {
    aliases: ["Refresh page", "Reload page"],
    category: "browser.navigation",
    runtimeHandler: "web.reload",
  }),
  command("switchPage", "Switch tab or window", [
    param("targetType", "select", {
      defaultValue: "latest",
      options: [
        { label: "Current", value: "current" },
        { label: "Index", value: "index" },
        { label: "Title", value: "title" },
        { label: "URL", value: "url" },
        { label: "Main", value: "main" },
        { label: "Latest", value: "latest" },
      ],
    }),
    param("targetValue", "string"),
  ], {
    aliases: ["Switch to Browser tab", "Switch to Browser with URL", "Switch to Browser with Title", "Switch to Main Browser"],
    category: "browser.tabs",
    runtimeHandler: "web.switchPage",
  }),
  command("closePage", "Close current tab or window", [], {
    aliases: ["Close browser tab", "Close current window", "Close active tab", "Close tab"],
    category: "browser.tabs",
    runtimeHandler: "web.closePage",
  }),
  command("closeBrowser", "Close Browser", [], {
    aliases: ["Close all browser windows", "End browser session", "Close browser session"],
    category: "browser.session",
    runtimeHandler: "web.closeBrowser",
  }),
  command("getCurrentUrl", "Get Current Browser URL", [], {
    aliases: ["Get current URL", "Browser URL"],
    category: "browser.get",
    outputDefinition: { ...stringOutput, defaultOutputVariableName: "url" },
    runtimeHandler: "web.getCurrentUrl",
  }),
  command("getTitle", "Get Current Browser Title", [], {
    aliases: ["Get Browser Title", "Get page title"],
    category: "browser.get",
    outputDefinition: { ...stringOutput, defaultOutputVariableName: "title" },
    runtimeHandler: "web.getTitle",
  }),
  command("verifyPageText", "Verify Page Contains Text", [param("expectedText", "string", { required: true }), matchTypeParam, timeoutParam], {
    aliases: ["Verify Page does not Contain Text"],
    category: "browser.verify",
    executable: false,
    outputDefinition: passFailOutput,
    runtimeHandler: "web.verifyPageText",
    stepKind: "assertion",
  }),
  command("executeScript", "Execute JavaScript on browser page", [param("script", "expression", { required: true }), param("args", "json")], {
    aliases: ["Execute JavaScript on browser page", "Run JS"],
    category: "browser.javascript",
    outputDefinition: { canSaveAsVariable: true, defaultOutputVariableName: "js.result", outputType: "object" },
    runtimeHandler: "web.executeScript",
  }),
  command("runJavaScriptSnippet", "Run JavaScript Snippet", [
    param("script", "expression", {
      required: true,
      description: "JavaScript to run in the active browser page. Use return for multi-line snippets, or enter a single expression.",
    }),
    param("outputFormat", "select", {
      defaultValue: "auto",
      options: [
        { label: "Auto", value: "auto" },
        { label: "JSON", value: "json" },
        { label: "Text", value: "text" },
        { label: "Boolean", value: "boolean" },
        { label: "Number", value: "number" },
      ],
    }),
    param("logOutputToConsole", "boolean", { defaultValue: true }),
    param("failIfEmpty", "boolean", { defaultValue: false }),
    param("timeoutMs", "number", { defaultValue: 5000 }),
  ], {
    aliases: [
      "Run JS Snippet",
      "Run custom JavaScript",
      "Get dataLayer",
      "Capture dataLayer",
      "Verify GTM",
      "Verify GA4",
      "Inspect page globals",
      "Debug JavaScript output",
    ],
    category: "browser.javascript",
    description: "Runs a custom JavaScript snippet in the active browser page, logs the returned output, and can save it to a variable.",
    outputDefinition: { canSaveAsVariable: true, defaultOutputVariableName: "jsSnippet.result", outputType: "object" },
    runtimeHandler: "web.runJavaScriptSnippet",
  }),
  command("logMessage", "Log Message to Console", [param("message", "string", { required: true })], {
    aliases: ["Print variable", "Print message", "Debug log", "Log message to Test Report", "Console log"],
    category: "debug.console",
    description: "Prints text or resolved variables to the Command Console while debugging a run.",
    runtimeHandler: "web.logMessage",
  }),
  command("conditionalBlock", "Add conditional flow", [
    param("conditionSource", "select", {
      defaultValue: "variable",
      options: [
        { label: "Viewport/device", value: "viewport" },
        { label: "Resolution width", value: "resolutionWidth" },
        { label: "Resolution height", value: "resolutionHeight" },
        { label: "Environment", value: "environment" },
        { label: "Base URL", value: "baseUrl" },
        { label: "Current URL", value: "currentUrl" },
        { label: "Page title", value: "pageTitle" },
        { label: "Browser", value: "browser" },
        { label: "OS/platform", value: "platform" },
        { label: "Variable", value: "variable" },
        { label: "Element exists", value: "element" },
        { label: "JavaScript expression", value: "javascript" },
      ],
    }),
    param("variableName", "variableReference", {
      description: "Variable path for variable conditions, for example user.role or activeCount.",
    }),
    param("operator", "select", operatorParam),
    param("expectedValue", "string", {
      description: "Expected value for the selected source/operator.",
    }),
    param("locator", "locator", {
      description: "Locator used when the condition source is Element exists.",
    }),
    param("expression", "expression", {
      description: "Advanced JavaScript condition. Return true or false. Receives context, variables, viewport, currentUrl, title, env.",
    }),
    param("thenSteps", "json", {
      description: "Commands to run when the IF condition is true. Use an array of step objects.",
    }),
    param("elseIfBranches", "json", {
      description: "Optional array of branches: [{ label, conditionSource, variableName, operator, expectedValue, steps }].",
    }),
    param("elseSteps", "json", {
      description: "Commands to run when no IF/ELSE IF branch matches.",
    }),
    param("failIfNoBranchMatched", "boolean", { defaultValue: false }),
    param("timeoutMs", "number", { defaultValue: 30000 }),
  ], {
    aliases: [
      "If / Else If / Else condition block",
      "If / else flow",
      "Branch flow",
      "If condition",
      "Else if condition",
      "Else condition",
      "If viewport is desktop",
      "If phone",
      "If environment is staging",
      "If production",
      "Conditional statement",
      "Branch by resolution",
    ],
    category: "logic.conditions",
    description: "Builds a branch flow based on viewport, resolution, environment, URL, variable, element, or an advanced expression.",
    outputDefinition: flowControlOutput,
    runtimeHandler: "web.logic.conditionalBlock",
    stepKind: "ifElse",
  }),
  command("loopBlock", "Add repeat / for-each flow", [
    param("loopType", "select", {
      defaultValue: "repeatCount",
      options: [
        { label: "Repeat count", value: "repeatCount" },
        { label: "For each list item", value: "forEachListItem" },
        { label: "For each map key/value", value: "forEachMapEntry" },
        { label: "For each test data row", value: "forEachDataRow" },
        { label: "For each web table row", value: "forEachTableRow" },
        { label: "While condition", value: "whileCondition" },
        { label: "Until condition", value: "untilCondition" },
      ],
    }),
    param("count", "string", {
      description: "Fixed or variable repeat count, for example 5, {{retryCount}}, or {{products.length}}.",
    }),
    param("source", "variableReference", {
      description: "List/map/table/test-data source for for-each loops.",
    }),
    param("itemVariableName", "variableName", { defaultValue: "item" }),
    param("keyVariableName", "variableName", { defaultValue: "key" }),
    param("valueVariableName", "variableName", { defaultValue: "value" }),
    param("conditionSource", "select", {
      defaultValue: "variable",
      options: [
        { label: "Variable", value: "variable" },
        { label: "Element exists", value: "element" },
        { label: "Current URL", value: "currentUrl" },
        { label: "JavaScript expression", value: "javascript" },
      ],
    }),
    param("variableName", "variableReference"),
    param("operator", "select", operatorParam),
    param("expectedValue", "string"),
    param("locator", "locator"),
    param("expression", "expression", {
      description: "Advanced JavaScript condition for while/until loops.",
    }),
    param("steps", "json", {
      description: "Commands to repeat. Use an array of step objects.",
    }),
    param("maxIterations", "number", { defaultValue: 100 }),
    param("continueOnIterationFailure", "boolean", { defaultValue: false }),
    param("timeoutMs", "number", { defaultValue: 30000 }),
  ], {
    aliases: [
      "Loop / For each block",
      "Loop flow",
      "For each flow",
      "Repeat fixed count",
      "Repeat variable count",
      "For each item in list",
      "For each key value in map",
      "Loop through list",
      "Loop through table rows",
      "While condition",
      "Until condition",
    ],
    category: "logic.loops",
    description: "Builds a repeat or for-each flow for counts, lists, maps, test data rows, table rows, while, or until logic.",
    outputDefinition: loopControlOutput,
    runtimeHandler: "web.logic.loopBlock",
    stepKind: "loop",
  }),
  command("breakLoop", "Break loop", [], {
    aliases: ["Exit loop", "Stop current loop"],
    category: "logic.loops",
    description: "Stops the nearest running CaseForge loop block.",
    outputDefinition: { canSaveAsVariable: true, defaultOutputVariableName: "loopControl", outputType: "object" },
    runtimeHandler: "web.logic.breakLoop",
  }),
  command("continueLoop", "Continue loop", [], {
    aliases: ["Skip to next loop item", "Continue current loop"],
    category: "logic.loops",
    description: "Skips the remaining commands in the current iteration and continues the nearest running CaseForge loop block.",
    outputDefinition: { canSaveAsVariable: true, defaultOutputVariableName: "loopControl", outputType: "object" },
    runtimeHandler: "web.logic.continueLoop",
  }),
  command("createList", "Create list", [
    param("items", "json", { description: "Initial list items." }),
  ], {
    aliases: ["New array", "Make list"],
    category: "data.collections.list",
    description: "Creates a list/array value that can be saved to a variable.",
    outputDefinition: collectionOutput,
    runtimeHandler: "web.data.createList",
  }),
  command("addItemToList", "Add item to list", [
    param("source", "variableReference", { required: true }),
    param("item", "json", { required: true }),
  ], {
    aliases: ["Push item", "Append to list"],
    category: "data.collections.list",
    outputDefinition: collectionOutput,
    runtimeHandler: "web.data.addItemToList",
  }),
  command("removeItemFromList", "Remove item from list", [
    param("source", "variableReference", { required: true }),
    param("matchField", "string"),
    param("matchValue", "string"),
    param("index", "number"),
  ], {
    aliases: ["Delete from list", "Remove array item"],
    category: "data.collections.list",
    outputDefinition: collectionOutput,
    runtimeHandler: "web.data.removeItemFromList",
  }),
  command("countListItems", "Count list items", [param("source", "variableReference", { required: true })], {
    aliases: ["List count", "Array length", "Count items"],
    category: "data.collections.list",
    outputDefinition: { canSaveAsVariable: true, defaultOutputVariableName: "listCount", outputType: "number" },
    runtimeHandler: "web.data.countListItems",
  }),
  command("filterList", "Filter list", [
    param("source", "variableReference", { required: true }),
    param("field", "string"),
    param("operator", "select", operatorParam),
    param("expectedValue", "string"),
    param("expression", "expression", {
      description: "Advanced predicate. Return true to keep item. Receives item, index, variables.",
    }),
  ], {
    aliases: ["Array filter", "Filter array", "Where list"],
    category: "data.collections.list",
    outputDefinition: collectionOutput,
    runtimeHandler: "web.data.filterList",
  }),
  command("mapList", "Map list", [
    param("source", "variableReference", { required: true }),
    param("field", "string", {
      description: "Field to pick from each item, for example name or user.email.",
    }),
    param("expression", "expression", {
      description: "Advanced mapper. Return the mapped value. Receives item, index, variables.",
    }),
  ], {
    aliases: ["Array map", "Pick field from list", "Transform list"],
    category: "data.collections.list",
    outputDefinition: collectionOutput,
    runtimeHandler: "web.data.mapList",
  }),
  command("findItemInList", "Find item in list", [
    param("source", "variableReference", { required: true }),
    param("field", "string"),
    param("operator", "select", operatorParam),
    param("expectedValue", "string"),
    param("expression", "expression"),
  ], {
    aliases: ["Array find", "Find row", "Find object in list"],
    category: "data.collections.list",
    outputDefinition: collectionOutput,
    runtimeHandler: "web.data.findItemInList",
  }),
  command("listContains", "Check list contains", [
    param("source", "variableReference", { required: true }),
    param("expectedValue", "string", { required: true }),
    param("field", "string"),
    param("operator", "select", operatorParam),
  ], {
    aliases: ["Array contains", "List includes"],
    category: "data.collections.list",
    outputDefinition: { canSaveAsVariable: true, defaultOutputVariableName: "listContains", outputType: "boolean" },
    runtimeHandler: "web.data.listContains",
  }),
  command("sortList", "Sort list", [
    param("source", "variableReference", { required: true }),
    param("field", "string"),
    param("sortOrder", "select", {
      defaultValue: "asc",
      options: [
        { label: "Ascending", value: "asc" },
        { label: "Descending", value: "desc" },
      ],
    }),
    param("dataType", "select", {
      defaultValue: "string",
      options: [
        { label: "String", value: "string" },
        { label: "Number", value: "number" },
        { label: "Date", value: "date" },
      ],
    }),
  ], {
    aliases: ["Array sort", "Sort array"],
    category: "data.collections.list",
    outputDefinition: collectionOutput,
    runtimeHandler: "web.data.sortList",
  }),
  command("getListItem", "Get list item by index", [
    param("source", "variableReference", { required: true }),
    param("index", "number", { required: true }),
  ], {
    aliases: ["Get array item", "Get first item", "Get last item"],
    category: "data.collections.list",
    outputDefinition: collectionOutput,
    runtimeHandler: "web.data.getListItem",
  }),
  command("joinList", "Join list as text", [
    param("source", "variableReference", { required: true }),
    param("separator", "string", { defaultValue: "," }),
  ], {
    aliases: ["Array join", "Join array"],
    category: "data.collections.list",
    outputDefinition: { canSaveAsVariable: true, defaultOutputVariableName: "joinedText", outputType: "string" },
    runtimeHandler: "web.data.joinList",
  }),
  command("splitTextToList", "Split text to list", [
    param("text", "string", { required: true }),
    param("separator", "string", { defaultValue: "," }),
  ], {
    aliases: ["String split", "Convert text to list"],
    category: "data.collections.list",
    outputDefinition: collectionOutput,
    runtimeHandler: "web.data.splitTextToList",
  }),
  command("uniqueList", "Remove duplicate list items", [
    param("source", "variableReference", { required: true }),
    param("field", "string"),
  ], {
    aliases: ["Distinct list", "Array unique", "Remove duplicates"],
    category: "data.collections.list",
    outputDefinition: collectionOutput,
    runtimeHandler: "web.data.uniqueList",
  }),
  command("compareValues", "Compare values", [
    param("actual", "json", {
      description: "Actual value or variable reference.",
      required: true,
      valueSourceAllowed: allValueSources,
    }),
    param("expected", "json", {
      description: "Expected value or variable reference.",
      required: true,
      valueSourceAllowed: allValueSources,
    }),
    param("operator", "select", operatorParam),
    param("caseSensitive", "boolean", { defaultValue: false }),
    param("trimWhitespace", "boolean", { defaultValue: true }),
    param("numericTolerance", "number"),
  ], {
    aliases: ["Compare string", "Compare text", "Compare variable values", "Assert values equal", "Verify value equals"],
    category: "data.compare",
    description: "Compares two scalar values such as strings, numbers, booleans, or variables.",
    outputDefinition: comparisonOutput,
    runtimeHandler: "web.data.compareValues",
    stepKind: "assertion",
  }),
  command("compareLists", "Compare lists", [
    param("actual", "variableReference", { required: true }),
    param("expected", "json", { required: true }),
    param("compareMode", "select", {
      defaultValue: "exact",
      options: [
        { label: "Exact", value: "exact" },
        { label: "Actual contains expected", value: "containsExpected" },
        { label: "Ignore order", value: "ignoreOrder" },
      ],
    }),
    param("keyFields", "string", {
      description: "Optional comma-separated field names for matching object rows by key.",
    }),
    param("caseSensitive", "boolean", { defaultValue: false }),
    param("trimWhitespace", "boolean", { defaultValue: true }),
    param("numericTolerance", "number"),
  ], {
    aliases: ["Compare arrays", "Verify list equals", "Compare list to list", "Compare collection"],
    category: "data.collections.list",
    description: "Compares two lists and reports missing, extra, and mismatched items.",
    outputDefinition: comparisonOutput,
    runtimeHandler: "web.data.compareLists",
    stepKind: "assertion",
  }),
  command("compareDatasets", "Compare datasets", [
    param("actual", "json", {
      description: "Actual dataset variable or JSON.",
      required: true,
      valueSourceAllowed: allValueSources,
    }),
    param("expected", "json", {
      description: "Expected dataset variable or JSON.",
      required: true,
      valueSourceAllowed: allValueSources,
    }),
    param("compareMode", "select", {
      defaultValue: "exact",
      options: [
        { label: "Exact", value: "exact" },
        { label: "Actual contains expected", value: "containsExpected" },
        { label: "Ignore order", value: "ignoreOrder" },
        { label: "Ignore extra actual rows", value: "ignoreExtraActual" },
        { label: "Ignore extra expected rows", value: "ignoreExtraExpected" },
      ],
    }),
    param("keyFields", "string", {
      description: "Optional comma-separated field names for matching object rows by key.",
    }),
    param("caseSensitive", "boolean", { defaultValue: false }),
    param("trimWhitespace", "boolean", { defaultValue: true }),
    param("numericTolerance", "number"),
  ], {
    aliases: ["Compare data sets", "Compare objects", "Compare object arrays", "Compare JSON", "Compare expected and actual data"],
    category: "data.compare",
    description: "Compares strings, lists, object arrays, maps, or JSON datasets with detailed mismatch output.",
    outputDefinition: comparisonOutput,
    runtimeHandler: "web.data.compareDatasets",
    stepKind: "assertion",
  }),
  command("createMap", "Create map/object", [
    param("entries", "json", { description: "Initial object/map entries." }),
  ], {
    aliases: ["Create object", "New map"],
    category: "data.collections.map",
    outputDefinition: collectionOutput,
    runtimeHandler: "web.data.createMap",
  }),
  command("setMapValue", "Set map value", [
    param("source", "variableReference", { required: true }),
    param("key", "string", { required: true }),
    param("value", "json", { required: true }),
  ], {
    aliases: ["Set object property", "Put map value"],
    category: "data.collections.map",
    outputDefinition: collectionOutput,
    runtimeHandler: "web.data.setMapValue",
  }),
  command("getMapValue", "Get map value", [
    param("source", "variableReference", { required: true }),
    param("key", "string", { required: true }),
  ], {
    aliases: ["Get object property", "Read map value"],
    category: "data.collections.map",
    outputDefinition: collectionOutput,
    runtimeHandler: "web.data.getMapValue",
  }),
  command("mapKeys", "Get map keys", [param("source", "variableReference", { required: true })], {
    aliases: ["Object keys", "Get all keys"],
    category: "data.collections.map",
    outputDefinition: collectionOutput,
    runtimeHandler: "web.data.mapKeys",
  }),
  command("mapValues", "Get map values", [param("source", "variableReference", { required: true })], {
    aliases: ["Object values", "Get all values"],
    category: "data.collections.map",
    outputDefinition: collectionOutput,
    runtimeHandler: "web.data.mapValues",
  }),
  command("mergeMaps", "Merge maps/objects", [
    param("source", "variableReference", { required: true }),
    param("other", "json", { required: true }),
  ], {
    aliases: ["Merge objects", "Object assign"],
    category: "data.collections.map",
    outputDefinition: collectionOutput,
    runtimeHandler: "web.data.mergeMaps",
  }),
  command("validateAccordionSections", "Validate all accordion sections", [
    param("containerLocator", "locator", {
      description: "Optional CSS locator that scopes detection to one FAQ, policy, help, or accordion container.",
    }),
    param("headerLocator", "locator", {
      description: "Optional CSS locator for accordion question/header elements.",
    }),
    param("answerLocator", "locator", {
      description: "Optional CSS locator for answer/panel elements. When provided, answers are matched by index.",
    }),
    param("minExpectedItems", "number", { defaultValue: "" }),
    param("maxExpectedItems", "number", { defaultValue: "" }),
    param("expectedCount", "number", { defaultValue: "" }),
    param("expandMode", "select", {
      defaultValue: "auto",
      options: [
        { label: "Auto", value: "auto" },
        { label: "Click header", value: "click-header" },
        { label: "Click icon", value: "click-icon" },
      ],
    }),
    param("collapseAfterValidate", "boolean", { defaultValue: true }),
    param("validateAnswerVisible", "boolean", { defaultValue: true }),
    param("validateAnswerNotEmpty", "boolean", { defaultValue: true }),
    param("validateCollapse", "boolean", { defaultValue: true }),
    param("failOnEmptyAnswer", "boolean", { defaultValue: true }),
    param("timeoutMs", "number", { defaultValue: 30000 }),
  ], {
    aliases: [
      "Validate all expandable sections",
      "Validate FAQ accordion",
      "Validate collapsible questions",
      "Validate expand/collapse sections",
    ],
    category: "browser.bulkValidation",
    description: "Finds all accordion, FAQ, or collapsible sections on the page, expands each item, validates the visible answer, optionally collapses it, and returns detailed per-item results.",
    outputDefinition: accordionValidationOutput,
    runtimeHandler: "web.validateAccordionSections",
  }),
  command("scroll", "Scroll Page", [
    param("deltaY", "number", { defaultValue: 600 }),
    param("direction", "select", {
      options: [
        { label: "Custom", value: "custom" },
        { label: "Top", value: "top" },
        { label: "Bottom", value: "bottom" },
      ],
    }),
  ], {
    aliases: ["Scroll", "Scroll Page To Top", "Scroll Page To Bottom"],
    category: "browser.scroll",
    runtimeHandler: "web.scroll",
  }),
  command("click", "Click on a Web Element", [...indexedLocatorParams(), timeoutParam, param("scrollIntoView", "boolean", { defaultValue: true })], {
    aliases: ["Click web element", "Click (JS) a Web Element", "Scroll and Click on Web Element"],
    category: "web.element",
    runtimeHandler: "web.click",
  }),
  command("doubleClick", "Double click on a Web Element", [...indexedLocatorParams(), timeoutParam], {
    aliases: ["Double click web element"],
    category: "web.element",
    runtimeHandler: "web.doubleClick",
  }),
  command("rightClick", "Right click on a Web Element", [...indexedLocatorParams(), timeoutParam], {
    aliases: ["Right click web element"],
    category: "web.element",
    runtimeHandler: "web.rightClick",
  }),
  command("hover", "Hover on a Web Element", [...indexedLocatorParams(), timeoutParam], {
    aliases: ["Hover on web element"],
    category: "web.element",
    runtimeHandler: "web.hover",
  }),
  command("scrollIntoView", "Scroll element into view", [...indexedLocatorParams(), param("scrollBehavior", "select", {
    options: [
      { label: "Auto", value: "auto" },
      { label: "Smooth", value: "smooth" },
      { label: "Center", value: "center" },
      { label: "Top", value: "top" },
      { label: "Bottom", value: "bottom" },
    ],
  })], {
    aliases: ["Scroll into Web Element"],
    category: "web.element",
    runtimeHandler: "web.scrollIntoView",
  }),
  command("coordinateClick", "Click Web Element coordinates", [
    param("coordinates", "coordinates"),
    param("x", "number", { required: true }),
    param("y", "number", { required: true }),
    param("coordinateMode", "select", {
      defaultValue: "viewport",
      options: [
        { label: "Viewport", value: "viewport" },
        { label: "Element", value: "element" },
        { label: "Page", value: "page" },
      ],
    }),
  ], {
    aliases: ["Click element coordinates"],
    category: "web.element",
    runtimeHandler: "web.coordinateClick",
  }),
  command("press", "Press special keyboard key on Web Element", [param("key", "keyboardKey", { required: true }), ...indexedLocatorParams({ required: false })], {
    aliases: ["Send combo click on Web Element", "Press keyboard key"],
    category: "web.element",
    runtimeHandler: "web.press",
  }),
  command("uploadFile", "Upload file with Web Element", [locatorParam(), param("filePath", "filePath", { required: true })], {
    aliases: ["Upload file"],
    category: "web.element",
    executable: false,
    runtimeHandler: "web.uploadFile",
  }),
  command("fill", "Enter text in a Web Input", [
    ...indexedLocatorParams(),
    param("text", "string", { label: "Text", required: true, valueSourceAllowed: allValueSources }),
    param("clearBeforeType", "boolean", { defaultValue: true }),
  ], {
    aliases: ["Enter text in web input", "Fill", "Enter Text in element with keystroke delay"],
    category: "web.input",
    runtimeHandler: "web.fill",
  }),
  command("type", "Enter Text in element with keystroke delay", [
    ...indexedLocatorParams(),
    param("text", "string", { required: true, valueSourceAllowed: allValueSources }),
    param("delayMs", "number"),
  ], {
    aliases: ["Type text with keystrokes"],
    category: "web.input",
    runtimeHandler: "web.type",
  }),
  command("fillSecret", "Enter encrypted text in a Web Input", [locatorParam(), param("value", "secret", { required: true })], {
    aliases: ["Enter secure text", "Enter password"],
    category: "web.input",
    executable: false,
    runtimeAction: "fill",
    runtimeHandler: "web.fillSecret",
  }),
  command("clear", "Clear text in Web Input field", indexedLocatorParams(), {
    aliases: ["Clear web input"],
    category: "web.input",
    runtimeHandler: "web.clear",
  }),
  command("getInputValue", "Get value from Web Input field", indexedLocatorParams(), {
    aliases: ["Get input value"],
    category: "web.input",
    outputDefinition: { ...stringOutput, defaultOutputVariableName: "inputValue" },
    runtimeHandler: "web.getInputValue",
  }),
  command("assert", "Verify Web Element exists", [locatorParam(), timeoutParam], {
    aliases: ["Assert Exists", "Verify web element", "Verify Web Element exists/enabled", "Is Web Element displayed"],
    category: "web.verify",
    outputDefinition: passFailOutput,
    runtimeHandler: "web.assert",
    stepKind: "assertion",
  }),
  command("assertNotExists", "Verify Web Element Not exists", [locatorParam(), timeoutParam], {
    aliases: ["Assert Not Exists", "Verify element hidden"],
    category: "web.verify",
    executable: false,
    outputDefinition: passFailOutput,
    runtimeHandler: "web.assertNotExists",
    stepKind: "assertion",
  }),
  command("assertText", "Assert Text", [locatorParam(), param("expectedText", "string", { required: true }), matchTypeParam], {
    aliases: ["Verify Web Element text", "Assert Text Is Not", "Verify Web Element text Is Not"],
    category: "web.verify",
    executable: false,
    outputDefinition: passFailOutput,
    runtimeHandler: "web.assertText",
    stepKind: "assertion",
  }),
  command("assertProperty", "Assert Property Is", [locatorParam(), param("propertyName", "propertyName", { required: true }), param("expectedValue", "string", { required: true }), matchTypeParam], {
    aliases: ["Verify Web Element property Is", "Assert Property Is Not"],
    category: "web.verify",
    executable: false,
    outputDefinition: passFailOutput,
    runtimeHandler: "web.assertProperty",
    stepKind: "assertion",
  }),
  command("assertCss", "Assert CSS Property Is", [locatorParam(), param("cssProperty", "cssProperty", { required: true }), param("expectedValue", "string", { required: true }), matchTypeParam], {
    aliases: ["Verify Web Element CSS property Is", "Assert CSS Property is Not"],
    category: "web.verify",
    executable: false,
    outputDefinition: passFailOutput,
    runtimeHandler: "web.assertCss",
    stepKind: "assertion",
  }),
  command("assertCount", "Verify Web Element count", [locatorParam(), param("expectedCount", "number", { required: true }), operatorParam], {
    aliases: ["Verify Sort Order of Repeat Element Text"],
    category: "web.verify",
    executable: false,
    outputDefinition: passFailOutput,
    runtimeHandler: "web.assertCount",
    stepKind: "assertion",
  }),
  command("getText", "Get text from a Web Element", indexedLocatorParams(), {
    aliases: ["Get Web Element property/text"],
    category: "web.get",
    outputDefinition: { ...stringOutput, defaultOutputVariableName: "text" },
    runtimeHandler: "web.getText",
  }),
  command("getProperty", "Get Web Element property/text", [...indexedLocatorParams(), param("propertyName", "propertyName", { required: true })], {
    aliases: ["Get element property"],
    category: "web.get",
    outputDefinition: { ...stringOutput, defaultOutputVariableName: "propertyValue" },
    runtimeHandler: "web.getProperty",
  }),
  command("getCssValue", "Get Web Element CSS value", [...indexedLocatorParams(), param("cssProperty", "cssProperty", { required: true })], {
    category: "web.get",
    outputDefinition: { ...stringOutput, defaultOutputVariableName: "cssValue" },
    runtimeHandler: "web.getCssValue",
  }),
  command("getElementCount", "Get Web Element count", [locatorParam()], {
    category: "web.get",
    outputDefinition: { canSaveAsVariable: true, defaultOutputVariableName: "count", outputType: "number" },
    runtimeHandler: "web.getElementCount",
  }),
  command("getWebElementsText", "Get Web Elements text list", [
    locatorParam(),
    param("includeHidden", "boolean", { defaultValue: false }),
    param("trimWhitespace", "boolean", { defaultValue: true }),
  ], {
    aliases: ["Get repeated element text", "Get list of element texts", "Get Web Elements Text"],
    category: "web.get",
    description: "Returns visible text from every element matching a CSS, XPath, text, role, label, or test id locator.",
    outputDefinition: { canSaveAsVariable: true, defaultOutputVariableName: "items", outputType: "array" },
    runtimeHandler: "web.getWebElementsText",
  }),
  command("getWebElementsAttribute", "Get Web Elements attribute list", [
    locatorParam(),
    param("attributeName", "attributeName", { required: true }),
    param("includeHidden", "boolean", { defaultValue: false }),
    param("trimWhitespace", "boolean", { defaultValue: true }),
  ], {
    aliases: ["Get repeated element attribute", "Get list of element attributes", "Get hrefs from elements"],
    category: "web.get",
    description: "Returns one attribute value from every element matching the locator.",
    outputDefinition: { canSaveAsVariable: true, defaultOutputVariableName: "items", outputType: "array" },
    runtimeHandler: "web.getWebElementsAttribute",
  }),
  command("getWebElementsList", "Get Web Elements list", [
    locatorParam(),
    param("includeHidden", "boolean", { defaultValue: false }),
    param("attributeName", "attributeName", {
      description: "Optional attribute to include for each matched element.",
    }),
    param("maxItems", "number", { defaultValue: 500 }),
  ], {
    aliases: ["Get repeated web elements", "Get element list", "Get Web Elements"],
    category: "web.get",
    description: "Returns a rich array of matched elements with index, text, tag, role, selected attribute, and locator hints.",
    outputDefinition: { canSaveAsVariable: true, defaultOutputVariableName: "items", outputType: "array" },
    runtimeHandler: "web.getWebElementsList",
  }),
  command("wait", "Wait", [param("duration", "number", { defaultValue: 1000 })], {
    aliases: ["Hard wait", "Wait for time"],
    category: "wait.time",
    runtimeHandler: "web.wait",
    stepKind: "wait",
  }),
  command("waitForTimeout", "Wait for time", [param("duration", "number", { required: true })], {
    aliases: ["Wait"],
    category: "wait.time",
    runtimeAction: "wait",
    runtimeHandler: "web.wait",
    stepKind: "wait",
  }),
  command("waitForElement", "Wait for Web Element", [locatorParam(), param("state", "select", {
    defaultValue: "visible",
    options: [
      { label: "Attached", value: "attached" },
      { label: "Visible", value: "visible" },
      { label: "Hidden", value: "hidden" },
      { label: "Detached", value: "detached" },
      { label: "Enabled", value: "enabled" },
      { label: "Disabled", value: "disabled" },
    ],
  }), timeoutParam], {
    aliases: ["Wait for Element", "Wait for Web Element appear/enable", "Wait Until Element is Enabled", "Wait Until Element Disappears"],
    category: "wait.element",
    runtimeHandler: "web.waitForElement",
    stepKind: "wait",
  }),
  command("select", "Select item in Web Dropdown by text", [locatorParam(), param("option", "string", { required: true })], {
    aliases: ["Select an item from a Web Dropdown", "Select dropdown option", "Search and select item from dropdown"],
    category: "web.dropdown",
    runtimeHandler: "web.select",
  }),
  command("selectByValue", "Select item in Web Dropdown by value", [locatorParam(), param("value", "string", { required: true })], {
    aliases: ["Select item In Web Dropdown (by value)"],
    category: "web.dropdown",
    executable: false,
    runtimeAction: "select",
    runtimeHandler: "web.selectByValue",
  }),
  command("selectByIndex", "Select item in Web Dropdown by index", [locatorParam(), param("index", "number", { required: true })], {
    aliases: ["Select item in Web Dropdown (by index)"],
    category: "web.dropdown",
    executable: false,
    runtimeAction: "select",
    runtimeHandler: "web.selectByIndex",
  }),
  command("selectMultiple", "Select items multiple from Web Dropdown", [locatorParam(), param("values", "multiSelect", { required: true })], {
    aliases: ["Select items multiple"],
    category: "web.dropdown",
    executable: false,
    runtimeHandler: "web.selectMultiple",
  }),
  command("getSelectedOption", "Get selected text in Web Dropdown", [locatorParam()], {
    category: "web.dropdown",
    executable: false,
    outputDefinition: { ...stringOutput, defaultOutputVariableName: "selectedText" },
    runtimeHandler: "web.getSelectedOption",
  }),
  command("getDropdownItems", "Get all items in Web Dropdown", [locatorParam()], {
    category: "web.dropdown",
    executable: false,
    outputDefinition: { canSaveAsVariable: true, defaultOutputVariableName: "items", outputType: "array" },
    runtimeHandler: "web.getDropdownItems",
  }),
  command("verifyDropdownItems", "Verify Web Dropdown items", [locatorParam(), param("expectedItems", "multiSelect", { required: true }), matchTypeParam], {
    category: "web.dropdown",
    executable: false,
    outputDefinition: passFailOutput,
    runtimeHandler: "web.verifyDropdownItems",
    stepKind: "assertion",
  }),
  command("check", "Check Web Checkbox", [locatorParam()], {
    aliases: ["Check checkbox/radio", "Set checkbox checked", "Assert Is Checked"],
    category: "web.checkbox",
    runtimeHandler: "web.check",
  }),
  command("uncheck", "Uncheck Web Checkbox", [locatorParam()], {
    aliases: ["Set checkbox unchecked", "Assert Not Checked"],
    category: "web.checkbox",
    runtimeHandler: "web.uncheck",
  }),
  command("isChecked", "Is Web Checkbox checked", [locatorParam()], {
    aliases: ["Verify Web Checkbox is checked", "Verify Web Checkbox Not checked"],
    category: "web.checkbox",
    executable: false,
    outputDefinition: { canSaveAsVariable: true, defaultOutputVariableName: "checked", outputType: "boolean" },
    runtimeHandler: "web.isChecked",
  }),
  command("setRadioValue", "Set Web Radio Group value", [locatorParam({ label: "Group locator" }), param("value", "string", { required: true })], {
    aliases: ["Set radio option with label"],
    category: "web.radio",
    executable: false,
    runtimeHandler: "web.setRadioValue",
  }),
  command("getRadioValue", "Get Web Radio Group value", [locatorParam({ label: "Group locator" })], {
    category: "web.radio",
    executable: false,
    outputDefinition: { ...stringOutput, defaultOutputVariableName: "radioValue" },
    runtimeHandler: "web.getRadioValue",
  }),
  command("validateWebTable", "Validate entire web table", [
    param("tableLocator", "locator", { required: true }),
    param("headerLocator", "locator"),
    param("rowLocator", "locator"),
    param("cellLocator", "locator"),
    param("expectedHeaders", "json", { description: "JSON array of expected header names." }),
    param("expectedRowCount", "number", { defaultValue: "" }),
    param("minRowCount", "number", { defaultValue: "" }),
    param("maxRowCount", "number", { defaultValue: "" }),
    param("expectedColumnCount", "number", { defaultValue: "" }),
    param("requiredColumns", "json", { description: "JSON array of required columns." }),
    param("uniqueColumns", "json", { description: "JSON array of columns that must be unique." }),
    param("notEmptyColumns", "json", { description: "JSON array of columns that must not be empty." }),
    param("validateNoBlankRows", "boolean", { defaultValue: true }),
    param("validateNoDuplicateRows", "boolean", { defaultValue: false }),
    param("trimWhitespace", "boolean", { defaultValue: true }),
    param("caseSensitive", "boolean", { defaultValue: false }),
    param("timeoutMs", "number", { defaultValue: 30000 }),
  ], {
    aliases: ["Bulk validate table", "Validate table rows and columns", "Verify whole web table"],
    category: "web.table.bulk",
    description: "Extracts a visible web table and validates headers, counts, required columns, uniqueness, blank rows, and duplicate rows in one command.",
    outputDefinition: tableValidationOutput,
    runtimeHandler: "web.table.validateEntireTable",
    stepKind: "assertion",
  }),
  command("compareWebTableWithExpectedData", "Compare web table with expected data", [
    param("tableLocator", "locator", { required: true }),
    param("expectedDataSource", "select", {
      defaultValue: "manual",
      options: [
        { label: "Manual", value: "manual" },
        { label: "Excel", value: "excel" },
        { label: "CSV", value: "csv" },
        { label: "API response", value: "apiResponse" },
        { label: "DB result", value: "dbResult" },
        { label: "Variable", value: "variable" },
      ],
    }),
    param("expectedData", "json"),
    param("filePath", "filePath"),
    param("sheetName", "string"),
    param("variableName", "variableReference"),
    param("keyColumns", "json"),
    param("compareMode", "select", {
      defaultValue: "exactTableMatch",
      options: [
        { label: "Exact table match", value: "exactTableMatch" },
        { label: "Contains expected rows", value: "containsExpectedRows" },
        { label: "Contains expected columns", value: "containsExpectedColumns" },
        { label: "Ignore extra rows", value: "ignoreExtraRows" },
        { label: "Ignore extra columns", value: "ignoreExtraColumns" },
      ],
    }),
    param("columnMapping", "json"),
    param("orderMatters", "boolean", { defaultValue: false }),
    param("trimWhitespace", "boolean", { defaultValue: true }),
    param("caseSensitive", "boolean", { defaultValue: false }),
    param("numericTolerance", "number", { defaultValue: "" }),
    param("dateFormat", "string"),
  ], {
    aliases: ["Compare web table with JSON", "Compare table data", "Verify table against expected rows"],
    category: "web.table.compare",
    description: "Compares extracted web table data with manual, file, API, DB, or variable-backed expected data and reports row/cell mismatches.",
    outputDefinition: tableComparisonOutput,
    runtimeHandler: "web.table.compareExpectedData",
    stepKind: "assertion",
  }),
  command("verifyWebTableRowExists", "Verify row exists in web table", [
    param("tableLocator", "locator", { required: true }),
    param("matchCriteria", "json", { required: true, description: "JSON object of column/value pairs to match." }),
    param("matchMode", "select", {
      defaultValue: "allColumns",
      options: [
        { label: "All columns", value: "allColumns" },
        { label: "Any column", value: "anyColumn" },
        { label: "Contains", value: "contains" },
      ],
    }),
    param("caseSensitive", "boolean", { defaultValue: false }),
    param("trimWhitespace", "boolean", { defaultValue: true }),
  ], {
    aliases: ["Find row in web table", "Verify table row by column values"],
    category: "web.table.verify",
    outputDefinition: { canSaveAsVariable: true, defaultOutputVariableName: "matchedRow", outputType: "object" },
    runtimeHandler: "web.table.verifyRowExists",
    stepKind: "assertion",
  }),
  command("verifyWebTableColumnExists", "Verify column exists in web table", [
    param("tableLocator", "locator", { required: true }),
    param("columnName", "string", { required: true }),
    param("caseSensitive", "boolean", { defaultValue: false }),
    param("trimWhitespace", "boolean", { defaultValue: true }),
  ], {
    aliases: ["Verify table column exists", "Verify required table column"],
    category: "web.table.verify",
    outputDefinition: { canSaveAsVariable: true, defaultOutputVariableName: "matchedColumn", outputType: "object" },
    runtimeHandler: "web.table.verifyColumnExists",
    stepKind: "assertion",
  }),
  command("verifyWebTableCellValue", "Verify cell value in web table", [
    param("tableLocator", "locator", { required: true }),
    param("rowSelectorType", "select", {
      defaultValue: "rowIndex",
      options: [
        { label: "Row index", value: "rowIndex" },
        { label: "Row text", value: "rowText" },
        { label: "Key column", value: "keyColumn" },
      ],
    }),
    param("rowIndex", "number", { defaultValue: "" }),
    param("rowText", "string"),
    param("keyColumn", "string"),
    param("keyValue", "string"),
    param("columnSelectorType", "select", {
      defaultValue: "columnName",
      options: [
        { label: "Column index", value: "columnIndex" },
        { label: "Column name", value: "columnName" },
      ],
    }),
    param("columnIndex", "number", { defaultValue: "" }),
    param("columnName", "string"),
    param("expectedValue", "string", { required: true }),
    matchTypeParam,
    param("caseSensitive", "boolean", { defaultValue: false }),
    param("trimWhitespace", "boolean", { defaultValue: true }),
  ], {
    aliases: ["Verify text in a cell", "Verify table cell text", "Get text from a cell in web table"],
    category: "web.table.verify",
    outputDefinition: { canSaveAsVariable: true, defaultOutputVariableName: "cellVerification", outputType: "object" },
    runtimeHandler: "web.table.verifyCellValue",
    stepKind: "assertion",
  }),
  command("verifyWebTableRowCount", "Verify table row count", [
    param("tableLocator", "locator", { required: true }),
    param("expectedRowCount", "number", { required: true }),
  ], {
    aliases: ["Get number of rows in web table", "Verify web table row count"],
    category: "web.table.verify",
    outputDefinition: { canSaveAsVariable: true, defaultOutputVariableName: "rowCount", outputType: "number" },
    runtimeHandler: "web.table.verifyRowCount",
    stepKind: "assertion",
  }),
  command("verifyWebTableColumnCount", "Verify table column count", [
    param("tableLocator", "locator", { required: true }),
    param("expectedColumnCount", "number", { required: true }),
  ], {
    aliases: ["Get number of columns in web table", "Verify web table column count"],
    category: "web.table.verify",
    outputDefinition: { canSaveAsVariable: true, defaultOutputVariableName: "columnCount", outputType: "number" },
    runtimeHandler: "web.table.verifyColumnCount",
    stepKind: "assertion",
  }),
  command("verifyWebTableHeaders", "Verify table headers", [
    param("tableLocator", "locator", { required: true }),
    param("expectedHeaders", "json", { required: true, description: "JSON array of expected header names." }),
    param("compareMode", "select", {
      defaultValue: "containsExpectedColumns",
      options: [
        { label: "Exact table match", value: "exactTableMatch" },
        { label: "Contains expected columns", value: "containsExpectedColumns" },
        { label: "Ignore extra columns", value: "ignoreExtraColumns" },
      ],
    }),
    param("caseSensitive", "boolean", { defaultValue: false }),
    param("trimWhitespace", "boolean", { defaultValue: true }),
  ], {
    aliases: ["Verify web table headers", "Verify table columns"],
    category: "web.table.verify",
    outputDefinition: tableValidationOutput,
    runtimeHandler: "web.table.verifyHeaders",
    stepKind: "assertion",
  }),
  command("verifyWebTableSortOrder", "Verify table sort order", [
    param("tableLocator", "locator", { required: true }),
    param("columnName", "string", { required: true }),
    param("sortOrder", "select", {
      defaultValue: "asc",
      options: [
        { label: "Ascending", value: "asc" },
        { label: "Descending", value: "desc" },
      ],
    }),
    param("dataType", "select", {
      defaultValue: "string",
      options: [
        { label: "String", value: "string" },
        { label: "Number", value: "number" },
        { label: "Date", value: "date" },
      ],
    }),
    param("dateFormat", "string"),
    param("ignoreBlankValues", "boolean", { defaultValue: true }),
  ], {
    aliases: ["Verify column sort", "Verify table column sorted"],
    category: "web.table.verify",
    outputDefinition: { canSaveAsVariable: true, defaultOutputVariableName: "sortVerification", outputType: "object" },
    runtimeHandler: "web.table.verifySortOrder",
    stepKind: "assertion",
  }),
  command("getWebTableData", "Get web table data", [
    param("tableLocator", "locator", { required: true }),
    param("includeHiddenRows", "boolean", { defaultValue: false }),
    param("includeHiddenColumns", "boolean", { defaultValue: false }),
    param("outputFormat", "select", {
      defaultValue: "arrayOfObjects",
      options: [
        { label: "Array of objects", value: "arrayOfObjects" },
        { label: "Array of arrays", value: "arrayOfArrays" },
        { label: "CSV", value: "csv" },
        { label: "JSON", value: "json" },
      ],
    }),
  ], {
    aliases: ["Extract web table", "Get all table rows", "Read web table data"],
    category: "web.table.get",
    outputDefinition: tableDataOutput,
    runtimeHandler: "web.table.getData",
  }),
  command("compareWebTableWithExternalData", "Compare web table with Excel/CSV/API/DB result", [
    param("tableLocator", "locator", { required: true }),
    param("expectedDataSource", "select", {
      defaultValue: "csv",
      options: [
        { label: "Excel", value: "excel" },
        { label: "CSV", value: "csv" },
        { label: "API response", value: "apiResponse" },
        { label: "DB result", value: "dbResult" },
        { label: "Variable", value: "variable" },
        { label: "Manual", value: "manual" },
      ],
    }),
    param("expectedData", "json"),
    param("filePath", "filePath"),
    param("sheetName", "string"),
    param("variableName", "variableReference"),
    param("keyColumns", "json"),
    param("compareMode", "select", {
      defaultValue: "exactTableMatch",
      options: [
        { label: "Exact table match", value: "exactTableMatch" },
        { label: "Contains expected rows", value: "containsExpectedRows" },
        { label: "Contains expected columns", value: "containsExpectedColumns" },
        { label: "Ignore extra rows", value: "ignoreExtraRows" },
        { label: "Ignore extra columns", value: "ignoreExtraColumns" },
      ],
    }),
    param("columnMapping", "json"),
    param("orderMatters", "boolean", { defaultValue: false }),
    param("trimWhitespace", "boolean", { defaultValue: true }),
    param("caseSensitive", "boolean", { defaultValue: false }),
    param("numericTolerance", "number", { defaultValue: "" }),
    param("dateFormat", "string"),
  ], {
    aliases: ["Compare web table with Excel", "Compare web table with CSV", "Compare web table with API response", "Compare web table with DB result"],
    category: "web.table.compare",
    description: "Compares extracted web table data with Excel, CSV, API, DB, variable, or manual expected data.",
    outputDefinition: tableComparisonOutput,
    runtimeAction: "compareWebTableWithExpectedData",
    runtimeHandler: "web.table.compareExternalData",
    stepKind: "assertion",
  }),
  command("clickTableCell", "Click Table Cell", [param("tableLocator", "locator", { required: true }), param("rowIndex", "number"), param("rowText", "string"), param("columnIndex", "number"), param("columnName", "string")], {
    aliases: ["Click Web Table row", "Click JS Web Table cell/row"],
    category: "web.table",
    executable: false,
    runtimeHandler: "web.table.clickCell",
  }),
  command("getTableCellText", "Get text from a cell in web table", [param("tableLocator", "locator", { required: true }), param("rowIndex", "number"), param("columnIndex", "number"), param("columnName", "string")], {
    category: "web.table",
    executable: false,
    outputDefinition: { ...stringOutput, defaultOutputVariableName: "cellText" },
    runtimeHandler: "web.table.getCellText",
  }),
  command("getTableRowCount", "Get number of rows in web table", [param("tableLocator", "locator", { required: true })], {
    aliases: ["Get number of columns in web table"],
    category: "web.table",
    executable: false,
    outputDefinition: { canSaveAsVariable: true, defaultOutputVariableName: "count", outputType: "number" },
    runtimeHandler: "web.table.getRowCount",
  }),
  command("verifyTableCellText", "Verify text in a cell", [param("tableLocator", "locator", { required: true }), param("rowIndex", "number"), param("columnIndex", "number"), param("expectedText", "string", { required: true }), matchTypeParam], {
    aliases: ["Verify number of rows/columns", "Verify column sort"],
    category: "web.table",
    executable: false,
    outputDefinition: passFailOutput,
    runtimeHandler: "web.table.verifyCellText",
    stepKind: "assertion",
  }),
  command("waitForAlert", "Wait for Browser Alert", [timeoutParam], {
    category: "browser.alert",
    executable: false,
    runtimeHandler: "web.alert.wait",
  }),
  command("handleAlert", "Handle Alert Dialog", [param("action", "select", {
    defaultValue: "accept",
    options: [
      { label: "Accept", value: "accept" },
      { label: "Dismiss", value: "dismiss" },
    ],
  }), param("text", "string")], {
    aliases: ["Enter text in Browser Alert and confirm", "Click and dismiss Alert"],
    category: "browser.alert",
    executable: false,
    runtimeHandler: "web.alert.handle",
  }),
  command("getAlertMessage", "Get Browser Alert Message", [timeoutParam], {
    aliases: ["Verify Browser Alert Message", "Is Browser Alert Exists"],
    category: "browser.alert",
    executable: false,
    outputDefinition: { ...stringOutput, defaultOutputVariableName: "alertMessage" },
    runtimeHandler: "web.alert.getMessage",
  }),
  command("addCookie", "Add cookie to browser", [param("cookieName", "string", { required: true }), param("cookieValue", "string", { required: true })], {
    aliases: ["Delete cookie from browser", "Delete all browser cookies", "Get cookie value", "Is cookie exists"],
    category: "browser.cookie",
    executable: false,
    runtimeHandler: "web.cookie.add",
  }),
  command("getNetworkCalls", "Get all matching Network Calls", [param("urlPattern", "string"), param("method", "select", {
    defaultValue: "ANY",
    options: ["ANY", "GET", "POST", "PUT", "PATCH", "DELETE"].map((value) => ({ label: value, value })),
  }), param("statusCode", "number"), timeoutParam], {
    aliases: ["Verify info of a Network Call", "Get info of a Network Call", "Is Network Request Sent"],
    category: "network",
    executable: false,
    outputDefinition: { canSaveAsVariable: true, defaultOutputVariableName: "network.calls", outputType: "array" },
    runtimeHandler: "network.getCalls",
  }),
  command("clearNetworkLogs", "Clear Network Logs", [], {
    aliases: ["Set Network Log Epoch", "Resume Network Logging", "Pause Network Logging"],
    category: "network",
    executable: false,
    runtimeHandler: "network.clear",
  }),
  command("apiRequest", "Invoke ReST Request", [param("method", "select", {
    required: true,
    options: ["GET", "POST", "PUT", "PATCH", "DELETE"].map((value) => ({ label: value, value })),
  }), param("url", "url", { required: true }), param("headers", "json"), param("body", "json")], {
    aliases: ["Invoke ReST Request (GET)", "Invoke ReST Request (POST)", "Invoke ReST Request (PUT)", "Invoke ReST Request (DELETE)"],
    category: "api.rest",
    domain: "api",
    executable: false,
    outputDefinition: { canSaveAsVariable: true, defaultOutputVariableName: "api.response", outputType: "object" },
    runtimeHandler: "api.request",
  }),
  command("executeDbQuery", "Execute Database Query", [param("connection", "connection", { required: true }), param("query", "query", { required: true }), param("params", "json")], {
    aliases: ["Connect to Database", "Get Database Field Value", "Verify Database Field Value", "Get row count"],
    category: "database.query",
    domain: "database",
    executable: false,
    outputDefinition: { canSaveAsVariable: true, defaultOutputVariableName: "db.rows", outputType: "array" },
    runtimeHandler: "database.executeQuery",
  }),
  command("cloudAction", "Run cloud service command", [param("connection", "connection", { required: true }), param("service", "string", { required: true }), param("operation", "string", { required: true }), param("payload", "json")], {
    aliases: ["AWS S3", "AWS Lambda", "DynamoDB", "Step Function", "Cosmos", "Couchbase"],
    category: "cloud",
    domain: "api",
    executable: false,
    outputDefinition: { canSaveAsVariable: true, defaultOutputVariableName: "cloud.response", outputType: "object" },
    runtimeHandler: "cloud.action",
  }),
  command("fileExists", "Verify File Exists", [param("filePath", "filePath", { required: true })], {
    aliases: ["Is File Exists", "Wait for File Exists"],
    category: "file",
    domain: "file",
    executable: false,
    outputDefinition: { canSaveAsVariable: true, defaultOutputVariableName: "file.exists", outputType: "boolean" },
    runtimeHandler: "file.exists",
  }),
  command("writeFile", "Write content to File", [param("filePath", "filePath", { required: true }), param("content", "string", { required: true })], {
    aliases: ["Create File", "Verify File Content", "Replace string in text file"],
    category: "file",
    domain: "file",
    executable: false,
    runtimeHandler: "file.write",
  }),
  command("excelGetCell", "Get Cell Text in Excel File", [param("filePath", "filePath", { required: true }), param("sheetName", "string", { required: true }), param("row", "number", { required: true }), param("column", "string", { required: true })], {
    aliases: ["Create Excel File", "Update Excel Cell Value", "Verify Cell Text", "Get Row Count", "CSV get cell"],
    category: "file.excel",
    domain: "file",
    executable: false,
    outputDefinition: { ...stringOutput, defaultOutputVariableName: "cellValue" },
    runtimeHandler: "file.excel.getCell",
  }),
  command("getCurrentDateTime", "Get current date time", [param("format", "string"), param("timezone", "string")], {
    aliases: ["Get current time", "Get Year", "Get Month", "Get day-of-week"],
    category: "dateTime",
    domain: "utility",
    executable: false,
    outputDefinition: { ...stringOutput, defaultOutputVariableName: "dateTime" },
    runtimeHandler: "utility.dateTime.now",
  }),
  command("addToDate", "Add To Date", [param("baseDate", "dateTime", { required: true }), param("amount", "number", { required: true }), param("unit", "select", {
    required: true,
    options: ["days", "months", "years", "hours", "minutes"].map((value) => ({ label: value, value })),
  })], {
    aliases: ["Add To Current Date", "Add to current time", "Convert date time format", "Compare date times"],
    category: "dateTime",
    domain: "utility",
    executable: false,
    outputDefinition: { ...stringOutput, defaultOutputVariableName: "dateTime" },
    runtimeHandler: "utility.dateTime.add",
  }),
  command("sendEmail", "Send email", [param("connection", "connection"), param("to", "string", { required: true }), param("subject", "string", { required: true }), param("body", "string")], {
    aliases: ["Reply to Email", "Download email attachments", "Get email information", "Verify email information", "Get email count"],
    category: "email",
    domain: "utility",
    executable: false,
    runtimeHandler: "email.send",
  }),
  command("pdfOpen", "Open PDF file", [param("filePath", "filePath", { required: true })], {
    aliases: ["Open PDF file"],
    category: "pdf.document",
    domain: "pdf",
    executable: false,
    runtimeHandler: "pdf.open",
  }),
  command("pdfClick", "Click on a PDF Element", [locatorParam()], {
    aliases: ["Hover on a PDF Element"],
    category: "pdf.element",
    domain: "pdf",
    executable: false,
    runtimeHandler: "pdf.click",
  }),
  command("pdfFill", "Enter text in a PDF Input", [locatorParam(), param("text", "string", { required: true })], {
    aliases: ["Enter encrypted text in a PDF Input"],
    category: "pdf.input",
    domain: "pdf",
    executable: false,
    runtimeHandler: "pdf.fill",
  }),
  command("pdfVerify", "Verify PDF content", [param("expected", "string", { required: true }), matchTypeParam], {
    aliases: ["Verify text in PDF file", "Verify PDF Element exists/enabled", "Verify PDF Checkbox is checked"],
    category: "pdf.verify",
    domain: "pdf",
    executable: false,
    outputDefinition: passFailOutput,
    runtimeHandler: "pdf.verify",
    stepKind: "assertion",
  }),
  command("mobileClick", "Click on mobile element", [locatorParam()], {
    aliases: ["Touch or Tap on the mobile element"],
    category: "mobile.element",
    domain: "mobile",
    executable: false,
    runtimeHandler: "mobile.click",
  }),
  command("mobileSetText", "Enter text in mobile input", [locatorParam(), param("text", "string", { required: true })], {
    category: "mobile.input",
    domain: "mobile",
    executable: false,
    runtimeHandler: "mobile.setText",
  }),
  command("desktopOcrClick", "Click on OCR located text on Desktop", [param("text", "string", { required: true })], {
    aliases: ["Right Click on OCR located text on Desktop", "Double Click on OCR located text on Desktop"],
    category: "desktop.ocr",
    domain: "desktop",
    executable: false,
    runtimeHandler: "desktop.ocr.click",
  }),
  command("windowsGuiClick", "Click Windows GUI element", [locatorParam()], {
    aliases: ["Windows GUI", "Desktop element click"],
    category: "desktop.windows",
    domain: "desktop",
    executable: false,
    runtimeHandler: "desktop.windows.click",
  }),
  command("salesforceQuery", "Execute Salesforce query", [param("query", "query", { required: true })], {
    aliases: ["Define Salesforce Query connection (SOQL/SOSL)", "Get Field Value from Salesforce Query Result"],
    category: "enterprise.salesforce",
    domain: "enterprise",
    executable: false,
    outputDefinition: { canSaveAsVariable: true, defaultOutputVariableName: "salesforce.result", outputType: "array" },
    runtimeHandler: "enterprise.salesforce.query",
  }),
  command("workdayAction", "Run Workday action", [param("actionName", "string", { required: true })], {
    aliases: ["Global Search in Workday", "Search and select an item from Workday search dropdown", "Approve Task in Workday"],
    category: "enterprise.workday",
    domain: "enterprise",
    executable: false,
    runtimeHandler: "enterprise.workday.action",
  }),
  command("sapNavigate", "Navigate SAP transaction", [param("transaction", "string", { required: true })], {
    aliases: ["Create New SAP Session", "Navigate to Transaction from Current SAP Screen", "Return to SAP Easy Access Menu"],
    category: "enterprise.sap",
    domain: "enterprise",
    executable: false,
    runtimeHandler: "enterprise.sap.navigate",
  }),
  command("jsonNodeValue", "Get JSON Node value", [param("json", "json", { required: true }), param("path", "query", { required: true })], {
    aliases: ["Verify JSON Node exists"],
    category: "data.json",
    domain: "data",
    executable: false,
    outputDefinition: { canSaveAsVariable: true, defaultOutputVariableName: "json.node", outputType: "object" },
    runtimeHandler: "data.json.nodeValue",
  }),
  command("generateRandomEmail", "Generate random email", [], {
    aliases: ["Get Random Email"],
    category: "utility.generator",
    domain: "utility",
    executable: false,
    outputDefinition: { ...stringOutput, defaultOutputVariableName: "randomEmail" },
    runtimeHandler: "utility.generate.randomEmail",
  }),
];

export const PLAYWRIGHT_EXECUTABLE_COMMANDS = AUTOMATION_COMMAND_CATALOG
  .filter((item) => item.executable && item.domain === "web")
  .map((item) => item.action);

const commandByAction = new Map(AUTOMATION_COMMAND_CATALOG.map((item) => [item.action, item]));
const commandByAlias = new Map(
  AUTOMATION_COMMAND_CATALOG.flatMap((item) =>
    [item.action, ...item.aliases].map((alias) => [normalizeCommandToken(alias), item] as const),
  ),
);

export function commandDefinitionForAction(action: string) {
  return commandByAction.get(normalizeAutomationAction(action));
}

export function normalizeAutomationAction(action: string) {
  const direct = commandByAction.get(action);
  if (direct) return direct.action;
  const normalized = commandByAlias.get(normalizeCommandToken(action));
  if (normalized) return normalized.action;
  if (action === "goto") return "navigate";
  if (action === "waitForTimeout" || action === "waitForElement") return "wait";
  return action;
}

export function defaultStepFailureBehavior(overrides: Partial<AutomationStepFailureBehavior> = {}) {
  return { ...defaultFailureBehavior, ...overrides };
}

export function createVariableStore(records: AutomationVariableRecord[] = []): AutomationVariableStore {
  return Object.fromEntries(records.map((record) => [record.name, record]));
}

export function setVariable(
  store: AutomationVariableStore,
  name: string,
  value: unknown,
  source: AutomationVariableSource = "manual",
  options: { displayValue?: string; isSecret?: boolean } = {},
) {
  store[name] = {
    displayValue: options.displayValue,
    isSecret: options.isSecret,
    name,
    source,
    value,
  };
  return store[name];
}

export function getVariableValue(store: AutomationVariableStore, name: string) {
  return store[name]?.value;
}

export function resolveStepParameterValue(
  parameter: StepParameterValue,
  context: Pick<AutomationExecutionContext, "environment" | "variables" | "currentTestDataRow" | "outputs" | "secretsProvider">,
): StepParameterValue {
  const resolvedValue = resolveRawParameterValue(parameter, context);
  return {
    ...parameter,
    displayValue: parameter.isSecret ? "******" : String(resolvedValue ?? ""),
    resolvedValue,
  };
}

function resolveRawParameterValue(
  parameter: StepParameterValue,
  context: Pick<AutomationExecutionContext, "environment" | "variables" | "currentTestDataRow" | "outputs" | "secretsProvider">,
) {
  const raw = parameter.rawValue;
  if (parameter.valueType === "static" || parameter.valueType === "generated") return interpolateVariables(raw, context.variables);
  const key = String(raw ?? "");
  if (parameter.valueType === "variable") return getVariableValue(context.variables, stripVariableSyntax(key));
  if (parameter.valueType === "secret") return context.secretsProvider?.(stripVariableSyntax(key));
  if (parameter.valueType === "testData") return context.currentTestDataRow?.[stripVariableSyntax(key)];
  if (parameter.valueType === "environment") return context.environment?.[stripVariableSyntax(key)];
  if (parameter.valueType === "previousStepOutput") return context.outputs?.[stripVariableSyntax(key)];
  if (parameter.valueType === "expression") return evaluateAutomationExpression(String(raw ?? ""), context);
  return raw;
}

export function evaluateAutomationExpression(
  expression: AutomationCondition | string,
  context: Pick<AutomationExecutionContext, "variables">,
) {
  if (typeof expression !== "string") return evaluateCondition(expression, context);
  const parsed = parseSimpleExpression(expression);
  if (!parsed) {
    const value = interpolateVariables(expression, context.variables);
    return Boolean(value);
  }
  return evaluateCondition(parsed, context);
}

export function validateAutomationStep(
  step: AutomationLanguageStep,
  context: Pick<AutomationExecutionContext, "variables"> & { knownSecretNames?: string[] } = {
    variables: {},
  },
  path = "step",
): AutomationLanguageValidationResult {
  const issues: AutomationLanguageValidationIssue[] = [];
  collectValidationIssues(step, context, path, issues);
  return {
    issues,
    valid: issues.every((issue) => issue.severity !== "error"),
  };
}

function collectValidationIssues(
  step: AutomationLanguageStep,
  context: Pick<AutomationExecutionContext, "variables"> & { knownSecretNames?: string[] },
  path: string,
  issues: AutomationLanguageValidationIssue[],
) {
  if ("kind" in step && step.kind === "ifElse") {
    if (!isValidCondition(step.condition, context)) {
      issues.push(errorIssue("invalid_expression", "Condition is not valid.", `${path}.condition`));
    }
    step.thenSteps.forEach((child, index) => collectValidationIssues(child, context, `${path}.thenSteps.${index}`, issues));
    step.elseSteps.forEach((child, index) => collectValidationIssues(child, context, `${path}.elseSteps.${index}`, issues));
    return;
  }
  if ("kind" in step && step.kind === "loop") {
    if ((step.loopType === "forEachDataRow" || step.loopType === "forEachListItem" || step.loopType === "whileCondition") && !step.source) {
      issues.push(errorIssue("invalid_loop_source", "Loop source is required for this loop type.", `${path}.source`));
    }
    if (!Number.isFinite(step.maxIterations) || step.maxIterations <= 0) {
      issues.push(errorIssue("invalid_loop_source", "Loop maxIterations must be greater than 0.", `${path}.maxIterations`));
    }
    step.steps.forEach((child, index) => collectValidationIssues(child, context, `${path}.steps.${index}`, issues));
    return;
  }
  if ("kind" in step && step.kind === "reusableActionCall") {
    if (!step.actionId) {
      issues.push(errorIssue("invalid_reusable_action_input", "Reusable action id is required.", `${path}.actionId`));
    }
    for (const [outputName, variableName] of Object.entries(step.outputMappings)) {
      if (!outputName || !variableName) {
        issues.push(errorIssue("missing_output_mapping", "Reusable action output mapping is incomplete.", `${path}.outputMappings`));
      }
    }
    return;
  }

  const commandStep = step as AutomationStep & {
    parameters?: StepParameterValue[];
    outputVariableName?: string;
    childSteps?: AutomationLanguageStep[];
  };
  const action = normalizeAutomationAction(commandStep.action);
  const definition = commandDefinitionForAction(action);
  if (!definition) {
    issues.push(errorIssue("unsupported_command", `Command "${commandStep.action}" is not in the automation catalog.`, `${path}.action`));
  }
  const parameters = commandStep.parameters ?? parametersFromLegacyStep(commandStep);
  for (const required of definition?.parameters.filter((item) => item.required) ?? []) {
    if (!parameters.some((parameter) => parameter.parameterName === required.name && parameter.rawValue !== "" && parameter.rawValue != null)) {
      issues.push(errorIssue("missing_required_param", `Parameter "${required.name}" is required.`, `${path}.parameters.${required.name}`));
    }
  }
  for (const parameter of parameters) {
    validateParameter(parameter, context, `${path}.parameters.${parameter.parameterName}`, issues);
  }
  const duplicateOutputNames = duplicateNames([commandStep.outputVariableName].filter(Boolean) as string[]);
  for (const name of duplicateOutputNames) {
    issues.push(errorIssue("duplicate_variable", `Output variable "${name}" is mapped more than once.`, `${path}.outputVariableName`));
  }
  commandStep.childSteps?.forEach((child, index) => collectValidationIssues(child, context, `${path}.childSteps.${index}`, issues));
}

function validateParameter(
  parameter: StepParameterValue,
  context: Pick<AutomationExecutionContext, "variables"> & { knownSecretNames?: string[] },
  path: string,
  issues: AutomationLanguageValidationIssue[],
) {
  for (const name of variableReferencesInValue(parameter.rawValue)) {
    if (!context.variables[name]) {
      issues.push(errorIssue("unknown_variable", `Variable "${name}" is not defined.`, path));
    }
  }
  if (parameter.valueType === "secret") {
    const secretName = stripVariableSyntax(String(parameter.rawValue ?? ""));
    if (context.knownSecretNames && !context.knownSecretNames.includes(secretName)) {
      issues.push(errorIssue("missing_secret", `Secret "${secretName}" is not available.`, path));
    }
  }
  if (parameter.valueType === "expression" && !isValidExpression(String(parameter.rawValue ?? ""), context)) {
    issues.push(errorIssue("invalid_expression", `Expression for "${parameter.parameterName}" is not valid.`, path));
  }
}

function parametersFromLegacyStep(step: AutomationStep): StepParameterValue[] {
  const action = normalizeAutomationAction(step.action);
  const params: StepParameterValue[] = [];
  if (action === "navigate") params.push(staticParam("url", step.inputValue || step.target?.value || ""));
  if (["click", "doubleClick", "rightClick", "hover", "scrollIntoView", "check", "uncheck", "assert", "waitForElement"].includes(action)) {
    params.push(staticParam("locator", step.target?.value || ""));
  }
  if (["fill", "type"].includes(action)) {
    params.push(staticParam("locator", step.target?.value || ""));
    params.push(staticParam("text", step.inputValue || ""));
  }
  if (action === "press") {
    params.push(staticParam("locator", step.target?.value || ""));
    params.push(staticParam("key", step.inputValue || ""));
  }
  if (action === "select") {
    params.push(staticParam("locator", step.target?.value || ""));
    params.push(staticParam("option", step.inputValue || ""));
  }
  if (action === "wait" || action === "waitForTimeout") params.push(staticParam("duration", step.inputValue || step.options?.duration || ""));
  return params;
}

function staticParam(parameterName: string, rawValue: unknown): StepParameterValue {
  return {
    isResolvedAtRuntime: false,
    isSecret: false,
    parameterName,
    rawValue,
    valueType: "static",
  };
}

function evaluateCondition(
  condition: AutomationCondition,
  context: Pick<AutomationExecutionContext, "variables">,
): boolean {
  if (condition.operator === "and") return condition.conditions.every((item) => evaluateCondition(item, context));
  if (condition.operator === "or") return condition.conditions.some((item) => evaluateCondition(item, context));
  if (condition.operator === "not") return !evaluateCondition(condition.condition, context);

  const simpleCondition = condition as Extract<
    AutomationCondition,
    { operator: Exclude<AutomationConditionOperator, "and" | "or" | "not"> }
  >;
  const left = resolveExpressionOperand(simpleCondition.left, context.variables);
  const right = resolveExpressionOperand(simpleCondition.right, context.variables);
  switch (simpleCondition.operator) {
    case "equals":
      return String(left) === String(right);
    case "notEquals":
      return String(left) !== String(right);
    case "contains":
      return String(left ?? "").includes(String(right ?? ""));
    case "notContains":
      return !String(left ?? "").includes(String(right ?? ""));
    case "greaterThan":
      return Number(left) > Number(right);
    case "lessThan":
      return Number(left) < Number(right);
    case "greaterOrEqual":
      return Number(left) >= Number(right);
    case "lessOrEqual":
      return Number(left) <= Number(right);
    case "regex":
      return safeRegexTest(String(right ?? ""), String(left ?? ""));
    case "isEmpty":
      return left == null || String(left).length === 0;
    case "isNotEmpty":
      return left != null && String(left).length > 0;
    case "exists":
      return left !== undefined && left !== null;
    case "notExists":
      return left === undefined || left === null;
    default:
      return false;
  }
}

function parseSimpleExpression(expression: string): AutomationCondition | null {
  const trimmed = expression.trim();
  const binary = trimmed.match(/^(.+?)\s*(==|!=|>=|<=|>|<|contains|not contains|matches)\s*(.+)$/i);
  if (!binary) {
    if (/^exists\s+(.+)$/i.test(trimmed)) return { left: RegExp.$1.trim(), operator: "exists" };
    if (/^notExists\s+(.+)$/i.test(trimmed)) return { left: RegExp.$1.trim(), operator: "notExists" };
    if (/^isEmpty\s+(.+)$/i.test(trimmed)) return { left: RegExp.$1.trim(), operator: "isEmpty" };
    if (/^isNotEmpty\s+(.+)$/i.test(trimmed)) return { left: RegExp.$1.trim(), operator: "isNotEmpty" };
    return null;
  }
  const operator = binary[2].toLowerCase();
  const operatorMap: Record<string, AutomationConditionOperator> = {
    "!=": "notEquals",
    "<": "lessThan",
    "<=": "lessOrEqual",
    "==": "equals",
    ">": "greaterThan",
    ">=": "greaterOrEqual",
    contains: "contains",
    matches: "regex",
    "not contains": "notContains",
  };
  return {
    left: binary[1].trim(),
    operator: operatorMap[operator] as Exclude<AutomationConditionOperator, "and" | "or" | "not">,
    right: binary[3].trim(),
  };
}

function isValidCondition(
  condition: AutomationCondition | string,
  context: Pick<AutomationExecutionContext, "variables">,
) {
  try {
    evaluateAutomationExpression(condition, context);
    return true;
  } catch {
    return false;
  }
}

function isValidExpression(expression: string, context: Pick<AutomationExecutionContext, "variables">) {
  if (!expression.trim()) return false;
  return isValidCondition(expression, context);
}

function interpolateVariables(value: unknown, variables: AutomationVariableStore): unknown {
  if (typeof value !== "string") return value;
  return value.replace(/\$\{([^}]+)\}/g, (match, name) => {
    const resolved = getVariableValue(variables, name.trim());
    return resolved == null ? match : String(resolved);
  });
}

function resolveExpressionOperand(value: unknown, variables: AutomationVariableStore) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  const unquoted = trimmed.match(/^"(.*)"$/) || trimmed.match(/^'(.*)'$/);
  if (unquoted) return unquoted[1];
  const variableName = exactVariableName(trimmed);
  if (variableName) return getVariableValue(variables, variableName);
  const interpolated = interpolateVariables(trimmed, variables);
  if (typeof interpolated === "string" && /^-?\d+(\.\d+)?$/.test(interpolated)) return Number(interpolated);
  return interpolated;
}

function variableReferencesInValue(value: unknown) {
  if (typeof value !== "string") return [];
  return [...value.matchAll(/\$\{([^}]+)\}/g)].map((match) => match[1].trim()).filter(Boolean);
}

function stripVariableSyntax(value: string) {
  return exactVariableName(value) || value.trim();
}

function exactVariableName(value: string) {
  const match = value.trim().match(/^\$\{([^}]+)\}$/);
  return match?.[1]?.trim() || "";
}

function normalizeCommandToken(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function duplicateNames(names: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) duplicates.add(name);
    seen.add(name);
  }
  return [...duplicates];
}

function safeRegexTest(pattern: string, value: string) {
  try {
    return new RegExp(pattern).test(value);
  } catch {
    return false;
  }
}

function errorIssue(
  code: AutomationValidationIssueCode,
  message: string,
  path?: string,
): AutomationLanguageValidationIssue {
  return {
    code,
    message,
    path,
    severity: "error",
  };
}
