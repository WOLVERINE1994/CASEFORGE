import type {
  AutomationRuntimeStrategy,
  BrowserExtensionAdapterConfig,
  LocalAutomationAdapter,
  PrivateAccessConnectorConfig,
} from "./types";

function isEnabled(...values: Array<string | undefined>) {
  return values.some((value) => value === "true");
}

export function isBrowserExtensionModeEnabled() {
  return isEnabled(
    process.env.NEXT_PUBLIC_AUTOMATION_BROWSER_EXTENSION_ENABLED,
    process.env.AUTOMATION_BROWSER_EXTENSION_ENABLED,
  );
}

export function isPrivateAccessConnectorEnabled() {
  return isEnabled(
    process.env.NEXT_PUBLIC_AUTOMATION_PRIVATE_CONNECTOR_ENABLED,
    process.env.AUTOMATION_PRIVATE_CONNECTOR_ENABLED,
    process.env.NEXT_PUBLIC_AUTOMATION_LOCAL_CONNECTOR_ENABLED,
    process.env.AUTOMATION_LOCAL_CONNECTOR_ENABLED,
  );
}

export function getBrowserExtensionAdapterConfig(): BrowserExtensionAdapterConfig {
  return {
    capture: {
      commands: ["navigate", "click", "fill", "select", "hover", "assert", "wait"],
      injectRecorderOnActiveTab: true,
      sendEventsOverWebSocket: true,
    },
    enabled: isBrowserExtensionModeEnabled(),
    eventStreamUrl: process.env.AUTOMATION_EXTENSION_EVENT_STREAM_ENDPOINT,
    intendedUse: "record_in_my_browser",
    mode: "browser_extension",
    permissions: ["activeTab", "scripting", "storage"],
  };
}

export function getPrivateAccessConnectorConfig(): PrivateAccessConnectorConfig {
  return {
    capabilities: {
      intranet: true,
      localhost: true,
      secureTunnel: true,
      vpn: true,
    },
    enabled: isPrivateAccessConnectorEnabled(),
    intendedUse: "restricted_environment_access",
    mode: "private_access_connector",
  };
}

export function getLocalAutomationAdapters(): LocalAutomationAdapter[] {
  return [
    {
      defaultEnabled: false,
      flag: "NEXT_PUBLIC_AUTOMATION_BROWSER_EXTENSION_ENABLED",
      id: "browser_extension",
      intendedUse: "Record commands from the user's current browser tab after an explicit action.",
      notes: [
        "Uses activeTab and scripting permissions for on-demand injection.",
        "Sends captured command events to the cloud recorder channel over WebSocket.",
        "Does not replace managed cloud sessions for normal public-web automation.",
      ],
      transport: "Browser extension -> cloud WebSocket",
    },
    {
      defaultEnabled: false,
      flag: "NEXT_PUBLIC_AUTOMATION_PRIVATE_CONNECTOR_ENABLED",
      id: "private_access_connector",
      intendedUse: "Reach localhost, VPN, intranet, and other restricted targets.",
      notes: [
        "Connector is decoupled from the public-web default path.",
        "Use outbound tunnel or worker pull so private networks do not need inbound exposure.",
        "Legacy local connector flags are accepted only as migration aliases.",
      ],
      transport: "Connector tunnel -> automation control plane",
    },
    {
      defaultEnabled: false,
      flag: "NEXT_PUBLIC_AUTOMATION_LOCAL_CONNECTOR_ENABLED",
      id: "legacy_desktop_agent",
      intendedUse: "Temporary compatibility for the old Electron/Playwright desktop bridge.",
      notes: [
        "Do not use as the default runtime.",
        "Keep behind flags until managed, extension, and private connector modes reach parity.",
      ],
      transport: "Browser -> 127.0.0.1 desktop bridge",
    },
  ];
}

export function getAutomationRuntimeStrategy(): AutomationRuntimeStrategy {
  return {
    defaultMode: "managed_cloud_session",
    modes: [
      {
        enabled: true,
        id: "managed_cloud_session",
        intendedUse: "Default for public web applications with no local software install.",
        ownership: "cloud",
        transport: "Next.js broker -> managed browser provider",
      },
      {
        enabled: isBrowserExtensionModeEnabled(),
        id: "browser_extension",
        intendedUse: "Optional 'record in my browser' capture from the current tab.",
        ownership: "customer_browser",
        transport: "Extension activeTab injection -> cloud WebSocket",
      },
      {
        enabled: isPrivateAccessConnectorEnabled(),
        id: "private_access_connector",
        intendedUse: "Optional access for localhost, VPN, and intranet apps.",
        ownership: "customer_network",
        transport: "Private connector tunnel -> automation control plane",
      },
      {
        enabled: isEnabled(process.env.NEXT_PUBLIC_AUTOMATION_LOCAL_CONNECTOR_ENABLED),
        id: "legacy_desktop_agent",
        intendedUse: "Migration-only Electron/local Playwright bridge compatibility.",
        ownership: "compatibility",
        transport: "Browser -> 127.0.0.1 desktop bridge",
      },
    ],
  };
}
