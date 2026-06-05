# CaseForge Legacy Desktop Agent

CaseForge Agent is the old Electron wrapper around the local Playwright bridge at `http://127.0.0.1:4873`.

It is no longer the default automation runtime. Public-web automation should use managed cloud sessions or the self-hosted Playwright worker. Local software is optional and reserved for special cases:

1. Managed cloud session: public apps, no desktop install.
2. Browser Extension mode: "record in my browser" capture from the current tab.
3. Private Access Connector mode: localhost, VPN, intranet, or other restricted apps.

This desktop app remains only as a migration compatibility adapter behind:

```text
NEXT_PUBLIC_AUTOMATION_LOCAL_CONNECTOR_ENABLED=true
NEXT_PUBLIC_AUTOMATION_LOCAL_AGENT_URL=http://127.0.0.1:4873
```

## Development

From the repository root:

```bash
npm run adapter:legacy-desktop
```

Or from this folder:

```bash
npm install
npm run dev
```

## Build Windows Installer

```bash
cd desktop-agent
npm install
npm run dist:win
```

The installer is written to `desktop-agent/dist/` as `CaseForge-Agent-Setup-<version>.exe`.

## Runtime

- Local endpoint: `http://127.0.0.1:4873`
- Health check: `http://127.0.0.1:4873/health`
- Wrapped script: `scripts/caseforge-agent.mjs`

For production distribution, code signing should be added before sharing the installer broadly so Windows SmartScreen trusts it.
