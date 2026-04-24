import type { AutomationProvider, AutomationStep } from "./workspace";

export type AutomationStepTemplateId =
  | "login-flow"
  | "create-record"
  | "search"
  | "submit-form"
  | "validate-message";

export type AutomationStepTemplate = {
  id: AutomationStepTemplateId;
  label: string;
  description: string;
};

export const automationStepTemplates: AutomationStepTemplate[] = [
  {
    id: "login-flow",
    label: "Login Flow",
    description: "Open a login route, fill credentials, and verify a post-login state.",
  },
  {
    id: "create-record",
    label: "Create Record",
    description: "Navigate to a module, create a record, and verify the saved result.",
  },
  {
    id: "search",
    label: "Search",
    description: "Search for a record or entity and validate results are shown.",
  },
  {
    id: "submit-form",
    label: "Submit Form",
    description: "Fill a form, submit it, and verify success behavior.",
  },
  {
    id: "validate-message",
    label: "Validate Message",
    description: "Wait for and assert a visible success, warning, or error message.",
  },
];

const makeStep = (
  scriptId: string,
  order: number,
  partial: Partial<AutomationStep>
): AutomationStep => ({
  id: crypto.randomUUID(),
  scriptId,
  order,
  action: "click",
  targetType: "selector",
  targetValue: "",
  inputValue: "",
  expectedValue: "",
  timeoutMs: 5000,
  metaJson: {},
  ...partial,
});

export const buildAutomationTemplateSteps = ({
  templateId,
  provider,
  scriptId,
  startOrder,
}: {
  templateId: AutomationStepTemplateId;
  provider: AutomationProvider;
  scriptId: string;
  startOrder: number;
}): AutomationStep[] => {
  const baseOrder = startOrder;
  const uiOrSalesforceRouteTarget =
    provider === "api" ? "endpoint placeholder" : "route placeholder";

  switch (templateId) {
    case "login-flow":
      return [
        makeStep(scriptId, baseOrder, {
          action: "goto",
          targetType: provider === "api" ? "endpoint" : "route",
          targetValue: provider === "api" ? "authentication endpoint placeholder" : "login route",
          metaJson: {
            description: "Open the shared login entry point.",
            expectedResult: "The sign-in surface is ready for input.",
          },
        }),
        makeStep(scriptId, baseOrder + 1, {
          action: "fill",
          targetType: "selector",
          targetValue: "username or email field",
          inputValue: "{{credential:user.email}}",
          metaJson: {
            description: "Provide a reusable account alias instead of a hardcoded credential.",
            expectedResult: "The username field accepts the placeholder value.",
          },
        }),
        makeStep(scriptId, baseOrder + 2, {
          action: "fill",
          targetType: "selector",
          targetValue: "password field",
          inputValue: "{{credential:user.password}}",
          metaJson: {
            description: "Provide a reusable password alias.",
            expectedResult: "The password field accepts the placeholder value.",
          },
        }),
        makeStep(scriptId, baseOrder + 3, {
          action: "click",
          targetType: "selector",
          targetValue: "sign in button",
          metaJson: {
            description: "Submit the login flow.",
            expectedResult: "Authentication starts and the app transitions to an authenticated state.",
          },
        }),
        makeStep(scriptId, baseOrder + 4, {
          action: provider === "api" ? "assert-text" : "assert-visible",
          targetType: provider === "api" ? "text" : "selector",
          targetValue: provider === "api" ? "response body" : "post-login landing surface",
          expectedValue:
            provider === "api" ? "authentication succeeded placeholder" : "dashboard is visible",
          metaJson: {
            description: "Verify the authenticated landing state.",
            expectedResult: "The flow confirms a successful sign-in outcome.",
          },
        }),
      ];
    case "create-record":
      return [
        makeStep(scriptId, baseOrder, {
          action: "goto",
          targetType: provider === "api" ? "endpoint" : "route",
          targetValue: provider === "api" ? "create record endpoint placeholder" : uiOrSalesforceRouteTarget,
          metaJson: {
            description: "Open the module or route where creation begins.",
            expectedResult: "The create-record workflow is ready to start.",
          },
        }),
        makeStep(scriptId, baseOrder + 1, {
          action: "click",
          targetType: "selector",
          targetValue: "new record action",
          metaJson: {
            description: "Start the create record flow.",
            expectedResult: "The record creation form or modal opens.",
          },
        }),
        makeStep(scriptId, baseOrder + 2, {
          action: "fill",
          targetType: "selector",
          targetValue: "primary record field",
          inputValue: "sample record value placeholder",
          metaJson: {
            description: "Populate the most important creation field.",
            expectedResult: "The form contains the required sample input.",
          },
        }),
        makeStep(scriptId, baseOrder + 3, {
          action: "click",
          targetType: "selector",
          targetValue: "save record button",
          metaJson: {
            description: "Submit the new record.",
            expectedResult: "The record save request is sent.",
          },
        }),
        makeStep(scriptId, baseOrder + 4, {
          action: "assert-visible",
          targetType: "selector",
          targetValue: "record success confirmation",
          expectedValue: "record saved successfully",
          metaJson: {
            description: "Verify the saved state.",
            expectedResult: "A new record confirmation or detail header is visible.",
          },
        }),
      ];
    case "search":
      return [
        makeStep(scriptId, baseOrder, {
          action: "goto",
          targetType: provider === "api" ? "endpoint" : "route",
          targetValue: provider === "api" ? "search endpoint placeholder" : "search surface route",
          metaJson: {
            description: "Open the search surface.",
            expectedResult: "The search entry point is ready.",
          },
        }),
        makeStep(scriptId, baseOrder + 1, {
          action: "fill",
          targetType: "selector",
          targetValue: "search input",
          inputValue: "search query placeholder",
          metaJson: {
            description: "Enter a reusable query placeholder.",
            expectedResult: "The query is ready to submit.",
          },
        }),
        makeStep(scriptId, baseOrder + 2, {
          action: "click",
          targetType: "selector",
          targetValue: "search submit action",
          metaJson: {
            description: "Trigger search.",
            expectedResult: "Results begin loading.",
          },
        }),
        makeStep(scriptId, baseOrder + 3, {
          action: "wait-for",
          targetType: "selector",
          targetValue: "results container",
          metaJson: {
            description: "Wait for results to render.",
            expectedResult: "The results surface becomes available.",
          },
        }),
        makeStep(scriptId, baseOrder + 4, {
          action: "assert-visible",
          targetType: "selector",
          targetValue: "first result row",
          expectedValue: "matching result is shown",
          metaJson: {
            description: "Confirm matching data appears.",
            expectedResult: "At least one relevant result is visible.",
          },
        }),
      ];
    case "submit-form":
      return [
        makeStep(scriptId, baseOrder, {
          action: "goto",
          targetType: provider === "api" ? "endpoint" : "route",
          targetValue: provider === "api" ? "form submission endpoint placeholder" : "form route",
          metaJson: {
            description: "Open the relevant form surface.",
            expectedResult: "The target form is ready for entry.",
          },
        }),
        makeStep(scriptId, baseOrder + 1, {
          action: "fill",
          targetType: "selector",
          targetValue: "required field one",
          inputValue: "sample value one",
          metaJson: {
            description: "Populate the first required field.",
            expectedResult: "Field one contains a valid sample value.",
          },
        }),
        makeStep(scriptId, baseOrder + 2, {
          action: "fill",
          targetType: "selector",
          targetValue: "required field two",
          inputValue: "sample value two",
          metaJson: {
            description: "Populate the second required field.",
            expectedResult: "Field two contains a valid sample value.",
          },
        }),
        makeStep(scriptId, baseOrder + 3, {
          action: "click",
          targetType: "selector",
          targetValue: "submit button",
          metaJson: {
            description: "Submit the form.",
            expectedResult: "The form submission is triggered.",
          },
        }),
        makeStep(scriptId, baseOrder + 4, {
          action: "assert-visible",
          targetType: "selector",
          targetValue: "submission confirmation message",
          expectedValue: "submission succeeded",
          metaJson: {
            description: "Verify the form submission outcome.",
            expectedResult: "A success or confirmation state is visible.",
          },
        }),
      ];
    case "validate-message":
    default:
      return [
        makeStep(scriptId, baseOrder, {
          action: "wait-for",
          targetType: "selector",
          targetValue: "message container",
          metaJson: {
            description: "Wait for the relevant message surface.",
            expectedResult: "The feedback message area becomes available.",
          },
        }),
        makeStep(scriptId, baseOrder + 1, {
          action: "assert-visible",
          targetType: "selector",
          targetValue: "message banner or toast",
          expectedValue: "message is visible",
          metaJson: {
            description: "Check that the message is shown.",
            expectedResult: "A visible validation, success, or error message appears.",
          },
        }),
        makeStep(scriptId, baseOrder + 2, {
          action: "assert-text",
          targetType: "selector",
          targetValue: "message text area",
          expectedValue: "expected message placeholder",
          metaJson: {
            description: "Confirm the message text.",
            expectedResult: "The message contains the expected placeholder text.",
          },
        }),
      ];
  }
};
