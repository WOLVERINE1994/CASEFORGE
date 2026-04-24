import type {
  AutomationEnvironmentBinding,
  AutomationReusableBlock,
  AutomationScript,
  AutomationSelectorPreset,
  AutomationStep,
} from "./workspace";

export const buildDefaultAutomationReuseLibrary = (projectId: string) => {
  const now = Date.now();
  const loginBlockId = `${projectId}-shared-login-block`;
  const environments: AutomationEnvironmentBinding[] = [
    {
      id: `${projectId}-env-default`,
      name: "Default Environment",
      baseUrl: "https://example.com",
      routePresets: {
        login: "/login",
        dashboard: "/dashboard",
      },
      credentialAliases: ["qa_user", "admin_user"],
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const selectorPresets: AutomationSelectorPreset[] = [
    {
      id: `${projectId}-selector-email`,
      name: "Email Input",
      selector: "#email",
      description: "Reusable email input selector",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `${projectId}-selector-password`,
      name: "Password Input",
      selector: "#password",
      description: "Reusable password input selector",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `${projectId}-selector-submit`,
      name: "Primary Submit",
      selector: "button[type='submit']",
      description: "Reusable submit button selector",
      createdAt: now,
      updatedAt: now,
    },
  ];

  const blocks: AutomationReusableBlock[] = [
    {
      id: loginBlockId,
      name: "Shared Login Flow",
      description: "Open the login route and submit a shared login path.",
      provider: "playwright",
      steps: [
        {
          id: `${loginBlockId}-goto`,
          scriptId: loginBlockId,
          order: 0,
          action: "goto",
          targetType: "route",
          routeKey: "login",
          timeoutMs: 5000,
        },
        {
          id: `${loginBlockId}-email`,
          scriptId: loginBlockId,
          order: 1,
          action: "fill",
          targetType: "selector-preset",
          targetValue: `${projectId}-selector-email`,
          inputValue: "{{credential:qa_user.email}}",
          timeoutMs: 5000,
        },
        {
          id: `${loginBlockId}-password`,
          scriptId: loginBlockId,
          order: 2,
          action: "fill",
          targetType: "selector-preset",
          targetValue: `${projectId}-selector-password`,
          inputValue: "{{credential:qa_user.password}}",
          timeoutMs: 5000,
        },
        {
          id: `${loginBlockId}-submit`,
          scriptId: loginBlockId,
          order: 3,
          action: "click",
          targetType: "selector-preset",
          targetValue: `${projectId}-selector-submit`,
          timeoutMs: 5000,
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
  ];

  return {
    environments,
    selectorPresets,
    blocks,
    activeEnvironmentId: environments[0].id,
  };
};

export const resolveAutomationReferenceText = (
  value: string | undefined,
  environment: AutomationEnvironmentBinding | null
) => {
  const input = value ?? "";
  if (!input) {
    return input;
  }

  return input
    .replace(/\{\{baseUrl\}\}/g, environment?.baseUrl ?? "")
    .replace(
      /\{\{route:([^}]+)\}\}/g,
      (_, routeKey: string) =>
        environment?.routePresets?.[routeKey.trim()] ?? `/${routeKey.trim()}`
    );
};

const resolveActionCallBindings = (step: AutomationStep) => {
  const actionCall = step.metaJson?.actionCall;
  if (!actionCall || typeof actionCall !== "object" || Array.isArray(actionCall)) {
    return {};
  }

  const bindings = (actionCall as Record<string, unknown>).parameterBindings;
  if (!bindings || typeof bindings !== "object" || Array.isArray(bindings)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(bindings as Record<string, unknown>).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value]] : []
    )
  );
};

const replaceActionParameterTokens = (
  value: unknown,
  bindings: Record<string, string>
): unknown => {
  if (typeof value === "string") {
    return value.replace(/\{\{\s*param:([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) =>
      Object.prototype.hasOwnProperty.call(bindings, key)
        ? bindings[key] ?? ""
        : `{{param:${key}}}`
    );
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceActionParameterTokens(item, bindings));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        replaceActionParameterTokens(item, bindings),
      ])
    );
  }

  return value;
};

export const resolveAutomationSteps = ({
  script,
  steps,
  reusableBlocks,
  selectorPresets,
  environments,
}: {
  script: AutomationScript;
  steps: AutomationStep[];
  reusableBlocks: AutomationReusableBlock[];
  selectorPresets: AutomationSelectorPreset[];
  environments: AutomationEnvironmentBinding[];
}) => {
  const environment =
    environments.find((item) => item.id === script.environmentBindingId) ??
    environments.find((item) => item.isDefault) ??
    null;
  const selectorPresetMap = new Map(selectorPresets.map((item) => [item.id, item] as const));
  const blockMap = new Map(reusableBlocks.map((item) => [item.id, item] as const));

  const resolvedSteps: AutomationStep[] = [];
  const referenceMap = new Map<
    string,
    {
      origin: "local-step" | "shared-block";
      referenceId?: string;
      label: string;
      sourceStepId: string;
    }
  >();

  for (const step of steps.sort((left, right) => left.order - right.order)) {
    if (step.action === "run-block") {
      const blockId = step.sharedBlockId ?? step.targetValue ?? "";
      const block = blockMap.get(blockId);
      if (!block) {
        resolvedSteps.push(step);
        referenceMap.set(step.id, {
          origin: "shared-block",
          referenceId: blockId,
          label: blockId || "Shared block",
          sourceStepId: step.id,
        });
        continue;
      }

      const actionBindings = resolveActionCallBindings(step);
      const actionName =
        typeof step.metaJson?.actionCall === "object" &&
        step.metaJson?.actionCall &&
        !Array.isArray(step.metaJson.actionCall) &&
        typeof (step.metaJson.actionCall as Record<string, unknown>).actionName === "string"
          ? ((step.metaJson.actionCall as Record<string, unknown>).actionName as string)
          : block.name;

      block.steps.forEach((blockStep, index) => {
        const actionAwareBlockStep = {
          ...blockStep,
          targetValue: replaceActionParameterTokens(blockStep.targetValue, actionBindings) as
            | string
            | undefined,
          inputValue: replaceActionParameterTokens(blockStep.inputValue, actionBindings) as
            | string
            | undefined,
          expectedValue: replaceActionParameterTokens(
            blockStep.expectedValue,
            actionBindings
          ) as string | undefined,
          routeKey: replaceActionParameterTokens(blockStep.routeKey, actionBindings) as
            | string
            | undefined,
          metaJson: replaceActionParameterTokens(blockStep.metaJson, actionBindings) as
            | Record<string, unknown>
            | undefined,
        };
        const selectorPreset =
          actionAwareBlockStep.selectorPresetId || actionAwareBlockStep.targetValue
            ? selectorPresetMap.get(
                actionAwareBlockStep.selectorPresetId ??
                  (actionAwareBlockStep.targetValue as string)
              )
          : null;
        const targetValue =
          actionAwareBlockStep.targetType === "selector-preset" && selectorPreset
            ? selectorPreset.selector
            : actionAwareBlockStep.targetType === "route"
            ? resolveAutomationReferenceText(
                `{{baseUrl}}{{route:${actionAwareBlockStep.routeKey ?? actionAwareBlockStep.targetValue ?? ""}}}`,
                environment
              )
            : resolveAutomationReferenceText(actionAwareBlockStep.targetValue, environment);

        const resolvedBlockStep: AutomationStep = {
          ...actionAwareBlockStep,
          id: `${step.id}-block-${index}`,
          scriptId: script.id,
          order: resolvedSteps.length,
          targetType:
            actionAwareBlockStep.targetType === "selector-preset" ||
            actionAwareBlockStep.targetType === "route"
              ? actionAwareBlockStep.targetType
              : actionAwareBlockStep.targetType,
          targetValue,
          inputValue: resolveAutomationReferenceText(
            actionAwareBlockStep.inputValue,
            environment
          ),
          expectedValue: resolveAutomationReferenceText(
            actionAwareBlockStep.expectedValue,
            environment
          ),
          sourceStepId: step.id,
          sourceOrigin: "shared-block",
          sourceReferenceId: block.id,
          sourceReferenceLabel: actionName,
        };
        resolvedSteps.push(resolvedBlockStep);
        referenceMap.set(resolvedBlockStep.id, {
          origin: "shared-block",
          referenceId: block.id,
          label: actionName,
          sourceStepId: step.id,
        });
      });

      continue;
    }

    const selectorPreset =
      step.selectorPresetId || step.targetValue
        ? selectorPresetMap.get(step.selectorPresetId ?? (step.targetValue as string))
      : null;
    const targetValue =
      step.targetType === "selector-preset" && selectorPreset
        ? selectorPreset.selector
        : step.targetType === "route"
        ? resolveAutomationReferenceText(
            `{{baseUrl}}{{route:${step.routeKey ?? step.targetValue ?? ""}}}`,
            environment
          )
        : resolveAutomationReferenceText(step.targetValue, environment);

    const resolvedStep: AutomationStep = {
      ...step,
      targetValue,
      inputValue: resolveAutomationReferenceText(step.inputValue, environment),
      expectedValue: resolveAutomationReferenceText(step.expectedValue, environment),
      order: resolvedSteps.length,
      sourceStepId: step.id,
      sourceOrigin: "local-step",
      sourceReferenceId: step.id,
      sourceReferenceLabel: step.action,
    };
    resolvedSteps.push(resolvedStep);
    referenceMap.set(resolvedStep.id, {
      origin: "local-step",
      referenceId: step.id,
      label: step.action,
      sourceStepId: step.id,
    });
  }

  return {
    environment,
    resolvedSteps,
    referenceMap,
  };
};
