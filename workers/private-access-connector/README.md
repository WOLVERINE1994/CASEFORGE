# CaseForge Private Access Connector

Optional connector for targets that managed cloud browsers cannot reach: localhost, VPN, intranet, staging networks, and private DNS.

This is separate from normal public-web usage. Public apps should continue to use managed cloud sessions or self-hosted Playwright workers without installing local software.

## Responsibilities

- Register with the CaseForge control plane using a short-lived connector token.
- Maintain outbound-only connectivity, preferably WebSocket or worker-pull, so customers do not expose inbound ports.
- Receive session/run instructions for restricted targets only.
- Reach private origins from inside the customer network.
- Stream command, log, network, screenshot, video, and trace artefact metadata back to CaseForge.
- Upload large artefacts through signed URLs or a brokered storage API.

## Boundaries

- Do not make Electron the default runtime.
- Do not proxy public-web sessions through the connector.
- Do not store browser auth state in scenario payloads or localStorage.
- Keep compatibility with the legacy desktop bridge behind explicit migration flags only.

## Suggested Endpoints

- `POST /connectors/register`
- `POST /connectors/:id/heartbeat`
- `GET /connectors/:id/work`
- `POST /connectors/:id/events`
- `POST /connectors/:id/artifacts`

The connector can be packaged later as a service, container, or lightweight daemon. The control plane should treat it as an optional adapter, not as a required desktop agent.
