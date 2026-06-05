export type AutomationRuntimeMode =
  | "managed_cloud_session"
  | "browser_extension"
  | "private_access_connector";

export type LocalAutomationAdapterId =
  | "browser_extension"
  | "private_access_connector"
  | "legacy_desktop_agent";

export type LocalAutomationAdapter = {
  id: LocalAutomationAdapterId;
  defaultEnabled: boolean;
  flag: string;
  intendedUse: string;
  transport: string;
  notes: string[];
};

export type AutomationRuntimeStrategy = {
  defaultMode: "managed_cloud_session";
  modes: Array<{
    id: AutomationRuntimeMode | "legacy_desktop_agent";
    enabled: boolean;
    intendedUse: string;
    ownership: "cloud" | "customer_browser" | "customer_network" | "compatibility";
    transport: string;
  }>;
};

export type BrowserExtensionAdapterConfig = {
  mode: "browser_extension";
  enabled: boolean;
  permissions: ["activeTab", "scripting", "storage"];
  eventStreamUrl?: string;
  capture: {
    injectRecorderOnActiveTab: true;
    sendEventsOverWebSocket: true;
    commands: ["navigate", "click", "fill", "select", "hover", "assert", "wait"];
  };
  intendedUse: "record_in_my_browser";
};

export type PrivateAccessConnectorConfig = {
  mode: "private_access_connector";
  enabled: boolean;
  capabilities: {
    secureTunnel: true;
    localhost: true;
    vpn: true;
    intranet: true;
  };
  intendedUse: "restricted_environment_access";
};

export type BrowserExtensionEvent = {
  action: "navigate" | "click" | "fill" | "select" | "hover" | "assert" | "wait";
  frameUrl?: string;
  locatorCandidates: Array<{
    strategy: "role" | "label" | "text" | "placeholder" | "alt" | "title" | "testid" | "css";
    value: string;
    score: number;
    isUnique?: boolean;
  }>;
  pageUrl: string;
  tabId: number;
  timestamp: string;
  value?: string;
};
