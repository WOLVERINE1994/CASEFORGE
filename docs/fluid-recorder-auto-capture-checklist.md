# Fluid Recorder Auto-Capture Checklist

This phase covers only observed user actions. Verification, OCR, right-click command authoring, and hover highlight behavior are intentionally out of scope.

## Manual Tests

1. Start recording on GlowCart or another test page.
2. Click a button and confirm one click step is recorded.
3. Type into an email field and confirm one final type/fill step is recorded after typing pauses.
4. Type into a field that transforms text and confirm `rawValue` and `domValue` are both stored in step options.
5. Select a dropdown option and confirm one select step is recorded.
6. Check a checkbox and confirm one check step is recorded.
7. Uncheck a checkbox and confirm one uncheck step is recorded.
8. Select a radio option and confirm one check/select-style step is recorded.
9. Press meaningful keys such as Enter, Tab, Escape, or arrow keys and confirm one press step is recorded.
10. Navigate to another URL and confirm one navigate step is recorded.
11. Confirm normal browser clicks still happen.
12. Confirm normal browser typing still happens.
13. Refresh the CaseForge page and confirm recorded steps persist.
14. Run a single step and confirm recorded steps do not vanish.
15. Pause recording and confirm new actions are not captured.
16. Resume recording and confirm capture continues.

## Exclusions

- Do not auto-create verification/assertion steps from visible text.
- Do not auto-capture validation alerts as verification commands in this phase.
- Do not implement OCR capture in this phase.
