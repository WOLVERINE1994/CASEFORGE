"use client";

import type { DemoTimeline } from "./useDemoTimeline";

type DemoControlsProps = {
  timeline: DemoTimeline;
};

export default function DemoControls({ timeline }: DemoControlsProps) {
  const disabled = !timeline.isMotionEnabled;
  const isPlaying =
    timeline.state === "playing" || timeline.state === "replaying";

  return (
    <div className="cf-signature-demo-controls" aria-label="Demo controls">
      <button type="button" onClick={timeline.controls.play} disabled={disabled || isPlaying}>
        Play
      </button>
      <button type="button" onClick={timeline.controls.pause} disabled={disabled || !isPlaying}>
        Pause
      </button>
      <button type="button" onClick={timeline.controls.replay} disabled={disabled}>
        Replay
      </button>
      <button type="button" onClick={timeline.controls.skip}>
        Skip animation
      </button>
      <span>{timeline.state.replace("-", " ")}</span>
    </div>
  );
}
