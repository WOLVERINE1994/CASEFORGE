import {
  getAutomationRuntimeStrategy,
  getBrowserExtensionAdapterConfig,
  getLocalAutomationAdapters,
  getPrivateAccessConnectorConfig,
} from "../../../../lib/automation/local-adapters";

export async function GET() {
  return Response.json({
    adapters: getLocalAutomationAdapters(),
    browserExtension: getBrowserExtensionAdapterConfig(),
    privateAccessConnector: getPrivateAccessConnectorConfig(),
    strategy: getAutomationRuntimeStrategy(),
  });
}
