# CaseForge Browser Recorder Extension

Optional adapter for "record in my browser" workflows. This is not the default automation runtime.

## Purpose

- Capture commands from the user's current browser tab.
- Use `activeTab` and `scripting` so recorder code is injected only after a user gesture.
- Stream events to the CaseForge cloud recorder channel over WebSocket.
- Keep public-web automation on managed cloud sessions by default.

## Flow

1. User opens a scenario recorder in CaseForge.
2. CaseForge creates an extension recording token and WebSocket URL.
3. User clicks the extension action on the active tab.
4. The extension injects `content-recorder.js` into that active tab.
5. Captured navigate, click, fill, select, hover, assert, and wait commands are sent to the background worker.
6. The background worker forwards events to the cloud WebSocket.

## Security Notes

- Request `activeTab`, `scripting`, and `storage` only.
- Do not request broad host permissions for normal recording.
- Do not store auth state in scenario payloads or browser localStorage.
- Keep tokens short-lived and scoped to a project/scenario/session.
