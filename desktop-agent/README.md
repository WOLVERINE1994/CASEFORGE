# CaseForge Agent

CaseForge Agent is the Windows desktop wrapper for local browser recording and automation execution.

The Vercel app can save scenarios and run server-side flows, but a visible browser recorder must run on the user's computer. This app starts the local Playwright agent at `http://127.0.0.1:4873` so CaseForge can open a browser, capture commands, and replay scenarios.

## Development

From the repository root:

```bash
npm run agent:desktop
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
- Wrapped script: `scripts/caseforge-local-agent.mjs`

For production distribution, code signing should be added before sharing the installer broadly so Windows SmartScreen trusts it.
