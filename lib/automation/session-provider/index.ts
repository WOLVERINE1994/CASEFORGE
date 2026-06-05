import type { AutomationSessionProviderId } from "../../../utils/automation/types";
import {
  getPreferredSessionProvider,
  isBrowserExtensionModeEnabled,
  isLocalConnectorEnabled,
  isLocalEndpoint,
  isPrivateAccessConnectorEnabled,
} from "./flags";
import { OptionalLocalConnectorProvider } from "./local-connector";
import { ManagedBrowserProvider } from "./managed";
import { SelfHostedPlaywrightProvider } from "./self-hosted";
import type { SessionProvider } from "./types";

export { OptionalLocalConnectorProvider } from "./local-connector";
export { ManagedBrowserProvider } from "./managed";
export { SelfHostedPlaywrightProvider } from "./self-hosted";
export type {
  CreateSessionInput,
  ProviderSessionArtifacts,
  ProviderSessionEvent,
  ProviderSessionMetadata,
  ProviderRunResult,
  SessionProvider,
} from "./types";
export {
  getPreferredSessionProvider,
  isBrowserExtensionModeEnabled,
  isLocalConnectorEnabled,
  isLocalEndpoint,
  isPrivateAccessConnectorEnabled,
};

export function getSessionProvider(
  providerId: AutomationSessionProviderId = getPreferredSessionProvider(),
): SessionProvider {
  if (providerId === "self_hosted_playwright") {
    return new SelfHostedPlaywrightProvider();
  }
  if (providerId === "optional_local_connector") {
    return new OptionalLocalConnectorProvider();
  }
  return new ManagedBrowserProvider();
}

export function assertProviderAllowed(providerId: AutomationSessionProviderId) {
  if (providerId === "optional_local_connector" && !isLocalConnectorEnabled()) {
    throw new Error("Private access connector is disabled for the default automation flow.");
  }
  if (
    providerId === "managed_browser" &&
    isLocalEndpoint(process.env.AUTOMATION_MANAGED_BROWSER_ENDPOINT)
  ) {
    throw new Error("Managed browser endpoint must not point at localhost.");
  }
}
