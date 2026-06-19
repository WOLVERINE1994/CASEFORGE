# Fluid Recorder Phase 1 Checklist

Phase 1 focuses only on recorder state stability, browser session reuse, safe step persistence, and graceful worker errors.

## Manual Regression Checklist

1. Open Automation Scenario Workspace.
2. Start a browser or Try GlowCart Demo and confirm Browser status is `connected`.
3. Start Recorder and confirm Recorder status changes to `recording`.
4. Pause Recorder and confirm Recorder status changes to `paused`.
5. Resume Recorder and confirm Recorder status returns to `recording`.
6. Stop Recorder and confirm recorded commands remain in the timeline.
7. Start Live Preview, then start Recorder, and confirm no second browser opens.
8. Click Add Verify with an active browser session and confirm it attaches to the same session.
9. Run a single command and confirm the command timeline remains visible.
10. Run full playback and confirm existing commands are not deleted.
11. Stop or break the worker, then run a command and confirm a friendly error appears.
12. Force an empty worker response and confirm the workspace does not crash.

## Expected State Separation

- Recorder state: `idle`, `recording`, `paused`, `selectingTarget`, `verifyingTarget`.
- Playback state: `idle`, `running`, `stepRunning`, `failed`, `completed`.
- Browser session state: `disconnected`, `connecting`, `connected`, `expired`.
- Scenario steps: persisted command definitions only.

Runtime playback results, recorder events, and worker errors must not replace or clear scenario steps.
