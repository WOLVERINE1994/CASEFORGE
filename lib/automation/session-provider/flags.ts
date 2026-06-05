import type { AutomationSessionProviderId } from "../../../utils/automation/types";
import {
  isBrowserExtensionModeEnabled,
  isPrivateAccessConnectorEnabled,
} from "../local-adapters";

export function isLocalConnectorEnabled() {
  return isPrivateAccessConnectorEnabled();
}

export { isBrowserExtensionModeEnabled, isPrivateAccessConnectorEnabled };

export function getPreferredSessionProvider(): AutomationSessionProviderId {
  const configured = process.env.AUTOMATION_SESSION_PROVIDER;
  if (
    configured === "self_hosted_playwright" ||
    configured === "optional_local_connector" ||
    configured === "managed_browser"
  ) {
    return configured;
  }

  return "managed_browser";
}

export function isLocalEndpoint(value?: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1"
    );
  } catch {
    return false;
  }
}
