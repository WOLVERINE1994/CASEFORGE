# CaseForge Companion

CaseForge Companion is the Windows desktop app for visual browser recording and playback.

The Vercel app saves scenarios, visual steps, reusable actions, and results. This companion opens the browser on the user's computer so CaseForge can capture and replay workflows visually.

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

The installer is written to `desktop-agent/dist/` as `CaseForge-Companion-Setup-<version>.exe`.

## Connection

- The companion keeps the browser connection available for CaseForge.
- The app shows connection health from its own window.
- Browser recording and playback stay visual in the CaseForge workspace.

For production distribution, code signing should be added before sharing the installer broadly so Windows SmartScreen trusts it.
