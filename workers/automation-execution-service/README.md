# Automation Execution Service Stub

This service boundary owns long-running automation execution. The Next.js app
creates and persists `AutomationRun` records, then a worker should claim queued
runs, drive the configured browser session provider, and report progress.

Expected worker responsibilities:

- transition run status: `queued -> running -> passed | failed | blocked | canceled`
- write step-level `startedAt`, `finishedAt`, `status`, and error details into `summary.stepResults`
- upload trace zip, screenshots, recording/video, console logs, and network logs to object storage
- replace `automation://runs/...` artefact placeholders with durable object-store URIs
- store browser auth state only as encrypted `auth_state` artefacts or `secret://` references
- enforce artefact retention metadata before deleting remote objects

The broker/API layer must not execute Playwright directly or hold browser
lifetimes inside a Vercel route handler.
