# CaseForge Local Agent

CaseForge Cloud saves projects, scenarios, actions, and runs. Visible browser
recording runs on the user's machine through the CaseForge Local Agent.

## Run The Agent

From the CaseForge project folder:

```bash
npm install
npm run agent
```

Keep the terminal window open while recording. The agent listens on:

```text
http://127.0.0.1:4873
```

## Recording Flow

1. Open CaseForge in the browser.
2. Open Automation > Scenarios.
3. Create or open a scenario.
4. Click Record.
5. The local agent opens Chromium through Playwright.
6. Use the browser normally.
7. Captured commands sync back into CaseForge.

## Supported Captures

- Navigation
- Click
- Fill
- Select
- Enter, Escape, and Tab key presses
- Ctrl+Alt+T text assertion
- Ctrl+Alt+I image assertion
- Ctrl+Alt+A accessibility scan command
- Ctrl+Alt+L label/name assertion
- Ctrl+Alt+F keyboard focus assertion

## Why This Exists

Vercel can save scenarios and run server-side workflows, but it cannot open a
visible browser window on a user's laptop. The local agent owns desktop execution
in the same way enterprise automation tools use a machine agent.
