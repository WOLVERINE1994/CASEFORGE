# Cloud-Native Automation Architecture

## Product Information Architecture

CaseForge automation is a recorder-first SaaS workbench:

- Scenarios: lightweight business flows. `+ Scenario` opens the recorder directly.
- Recorder: browser/live view first, command timeline second, command properties on demand.
- Actions: reusable command groups created from selected timeline commands.
- Runs: durable execution history with trace, video, logs, screenshots, network artefacts, and step timings.
- Environments: target URLs, variables, and encrypted auth-state artefact references.

Dashboard-heavy status panels, CLI language, and permanent engineering consoles stay out of the default recorder path.

## Runtime Modes

1. Managed cloud session for public apps
   - Default mode.
   - No local desktop install.
   - Next.js requests a browser session from a managed provider or self-hosted Playwright worker.
   - Use for normal public-web recording and execution.

2. Browser Extension mode for "record in my browser"
   - Optional mode behind `NEXT_PUBLIC_AUTOMATION_BROWSER_EXTENSION_ENABLED=true`.
   - Uses Manifest V3 `activeTab` and `scripting` permissions to inject the recorder only after a user gesture.
   - Captures navigate, click, fill, select, hover, assert, and wait commands from the current tab.
   - Sends command events to the cloud recorder channel over WebSocket.
   - Use when the user specifically wants to capture their existing browser tab/session.

3. Private Access Connector mode for restricted environments
   - Optional mode behind `NEXT_PUBLIC_AUTOMATION_PRIVATE_CONNECTOR_ENABLED=true` and `AUTOMATION_PRIVATE_CONNECTOR_ENABLED=true`.
   - Provides a secure tunnel or connector for localhost, VPN, intranet, and private apps.
   - Decoupled from the public-web default path; public URLs continue to use managed cloud sessions.
   - Use when the target cannot be reached from the managed browser network.

Legacy Electron/local Playwright desktop bridge support is compatibility-only behind `NEXT_PUBLIC_AUTOMATION_LOCAL_CONNECTOR_ENABLED=true`. It must not be the default runtime.

## System Architecture

```text
Next.js App Router UI
  -> API route control-plane brokers
  -> Prisma + Supabase Postgres system of record
  -> SessionProvider abstraction
      -> ManagedBrowserProvider
      -> SelfHostedPlaywrightProvider
      -> OptionalLocalConnectorProvider
  -> external browser/session workers own long-lived browser sessions
  -> optional local adapters
      -> Browser Extension activeTab recorder
      -> Private Access Connector tunnel
      -> legacy desktop bridge during migration only
  -> artefact storage for traces, videos, logs, screenshots, network HAR, encrypted auth state
```

Next.js is the control plane and product UI. Route handlers create records, request sessions, enqueue runs, and retrieve metadata. They do not own long-lived browsers.

## Canonical Domain Models

The Prisma schema defines:

- `AutomationScenario`
- `AutomationAction`
- `AutomationStep`
- `AutomationRun`
- `AutomationArtifact`
- `AutomationEnvironment`
- `AutomationSession`
- `AutomationLocatorCandidate`

Steps store business-readable command text, target metadata, options, and ranked locator candidates. Prefer role, label, text, placeholder, alt, title, and testid locators first. CSS is fallback. Auth state is represented by encrypted `AutomationArtifact` records and must not be written into browser storage or project JSON blobs.

## Session Providers

`utils/automation/session-providers.ts` defines the migration-safe contract:

- `ManagedBrowserProvider`: default cloud path.
- `SelfHostedPlaywrightProvider`: worker fleet path for owned infrastructure.
- `OptionalLocalConnectorProvider`: private access connector metadata and broker integration.

Scenario, action, step, run, session, environment, and artefact persistence is DB-backed. Browser storage is limited to:

- `caseforge:automation:legacy-imported:*` as a one-time import marker for old browser-only scenario data.
- `caseforge:automation:draft-cache:*` as an offline/pending-save cache for recorder commands.

Neither key is used as the canonical scenario library source.

## Self-Hosted Playwright Worker

The self-hosted worker lives outside the Next.js app:

```text
workers/playwright-worker/
```

Run it with:

```bash
npm run worker:playwright
```

Set the control plane to use it with:

```text
AUTOMATION_SESSION_PROVIDER=self_hosted_playwright
AUTOMATION_SELF_HOSTED_WORKER_ENDPOINT=https://your-worker.example
```

The worker owns browser lifetime and exposes:

- `GET /health`
- `POST /sessions`
- `GET /sessions/:id`
- `DELETE /sessions/:id`
- `POST /sessions/:id/run`
- `GET /sessions/:id/events`

`POST /sessions` returns `sessionId`, `status`, `liveViewUrl` placeholder, and `eventStreamUrl`. The Next.js API remains a broker.

## Optional Browser Extension

The extension design lives in:

```text
extensions/browser-recorder/
```

It uses `activeTab` for scoped access, injects the recorder with `chrome.scripting.executeScript`, ranks locator candidates client-side, and streams business-readable command events to `AUTOMATION_EXTENSION_EVENT_STREAM_ENDPOINT`. It is not required for public-web automation.

## Optional Private Access Connector

The private connector design lives in:

```text
workers/private-access-connector/
```

The connector should establish outbound-only connectivity to the CaseForge control plane, receive session/run instructions, reach restricted targets from inside the customer network, and upload artefacts back through signed URLs or brokered APIs. It is not used for public-web targets.

## Run And Artefact Pipeline

Runs are first-class records. Workers attach artefact metadata for:

- trace
- video
- log
- network
- screenshot
- encrypted auth state

The API returns artefact metadata and URIs. Large files belong in object storage, not route handler memory.

## Migration Plan

1. Keep managed cloud sessions as the default public-web runtime.
2. Keep self-hosted Playwright workers outside Vercel for customers who own their browser fleet.
3. Add Browser Extension mode only for current-browser recording.
4. Add Private Access Connector mode only for restricted targets.
5. Keep the legacy desktop bridge behind local connector flags until parity is complete.
6. Store new scenarios, steps, actions, sessions, runs, and artefacts in Prisma/Supabase.
7. Import old `caseforge:automation:scenarios:*` browser storage once through the DB import API, then mark that browser as imported.

## Follow-Up TODOs

- Provision the managed browser provider endpoint and token.
- Add authenticated WebSocket gateway for extension command events.
- Implement private connector registration, tunnel auth, and restricted-origin policy.
- Add worker callbacks for command events and run status updates.
- Add encrypted artefact upload/signing service for auth state and videos.
- Expand API integration tests against a real test database.
