import type {
  AutomationEnvironmentBinding,
  AutomationExecution,
  Project,
  TestCaseExecutionResult,
  TestCaseRow,
  TestRunRecord,
} from "./workspace";

export const salesforceObjectOptions = [
  "Account",
  "Contact",
  "Lead",
  "Opportunity",
  "Case",
  "Campaign",
  "Custom Object",
] as const;

export const salesforceModuleOptions = [
  "Sales Cloud",
  "Service Cloud",
  "Marketing",
  "Permissions",
  "Approvals",
  "Flow Automation",
  "Reporting",
  "Lightning UI",
] as const;

export const salesforceTestTypeOptions = [
  "record-lifecycle",
  "validation-rules",
  "page-layouts",
  "permissions",
  "approvals",
  "flows",
  "reports",
  "integration",
  "list-view-search",
] as const;

export const isSalesforceRow = (row: TestCaseRow) =>
  row.platformDomain === "salesforce" ||
  Boolean(
    row.salesforceModule?.trim() ||
      row.salesforceObjectType?.trim() ||
      row.salesforceTestType?.trim()
  );

export const getSalesforceRows = (project: Project | null) =>
  (project?.rows ?? []).filter(isSalesforceRow);

export const getSalesforceEnvironmentBindings = (
  project: Project | null
): AutomationEnvironmentBinding[] =>
  (project?.automationEnvironmentBindings ?? []).filter(
    (environment) => environment.platformDomain === "salesforce"
  );

export const inferSalesforceObjectType = (row: TestCaseRow) => {
  const haystack = [
    row.title,
    row.preconditions,
    row.steps,
    row.expectedResult,
    row.testData ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (haystack.includes("opportunity")) return "Opportunity";
  if (haystack.includes("account")) return "Account";
  if (haystack.includes("contact")) return "Contact";
  if (haystack.includes("lead")) return "Lead";
  if (haystack.includes("campaign")) return "Campaign";
  if (haystack.includes("case")) return "Case";
  if (haystack.includes("custom object")) return "Custom Object";
  return "Account";
};

export const inferSalesforceModule = (row: TestCaseRow) => {
  const haystack = [
    row.title,
    row.preconditions,
    row.steps,
    row.expectedResult,
  ]
    .join(" ")
    .toLowerCase();

  if (haystack.includes("service")) return "Service Cloud";
  if (haystack.includes("campaign") || haystack.includes("marketing")) {
    return "Marketing";
  }
  if (
    haystack.includes("permission") ||
    haystack.includes("profile") ||
    haystack.includes("role")
  ) {
    return "Permissions";
  }
  if (haystack.includes("approval")) return "Approvals";
  if (haystack.includes("flow") || haystack.includes("process")) {
    return "Flow Automation";
  }
  if (haystack.includes("report") || haystack.includes("dashboard")) {
    return "Reporting";
  }
  if (haystack.includes("lightning") || haystack.includes("list view")) {
    return "Lightning UI";
  }
  return "Sales Cloud";
};

export const inferSalesforceTestType = (row: TestCaseRow) => {
  const haystack = [
    row.title,
    row.preconditions,
    row.steps,
    row.expectedResult,
  ]
    .join(" ")
    .toLowerCase();

  if (haystack.includes("approval")) return "approvals";
  if (haystack.includes("permission") || haystack.includes("profile")) {
    return "permissions";
  }
  if (haystack.includes("validation")) return "validation-rules";
  if (haystack.includes("layout")) return "page-layouts";
  if (haystack.includes("report") || haystack.includes("dashboard")) {
    return "reports";
  }
  if (haystack.includes("search") || haystack.includes("list view")) {
    return "list-view-search";
  }
  if (haystack.includes("flow") || haystack.includes("process")) return "flows";
  if (haystack.includes("integration")) return "integration";
  return "record-lifecycle";
};

export const buildSalesforceRunBreakdown = (
  rows: TestCaseRow[],
  runs: TestRunRecord[]
) => {
  const caseIds = new Set(rows.map((row) => row.id));
  const totals: Record<TestCaseExecutionResult, number> = {
    "not-run": 0,
    passed: 0,
    failed: 0,
    blocked: 0,
  };

  runs.forEach((run) => {
    Object.entries(run.rowResults).forEach(([rowId, result]) => {
      if (caseIds.has(rowId)) {
        totals[result] += 1;
      }
    });
  });

  return totals;
};

export const buildSalesforceExecutionFailuresByObject = (
  rows: TestCaseRow[],
  executions: AutomationExecution[]
) => {
  const rowById = Object.fromEntries(rows.map((row) => [row.id, row]));

  return executions
    .filter(
      (execution) =>
        (execution.status === "failed" || execution.status === "blocked") &&
        rowById[execution.caseId]
    )
    .reduce<Record<string, number>>((accumulator, execution) => {
      const row = rowById[execution.caseId];
      const key = row.salesforceObjectType || "Unmapped";
      accumulator[key] = (accumulator[key] ?? 0) + 1;
      return accumulator;
    }, {});
};
