"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSignatureDemoMotion from "./useSignatureDemoMotion";

export type DemoPlaybackState =
  | "idle"
  | "playing"
  | "paused"
  | "completed"
  | "replaying"
  | "reduced-motion";

type DemoTimelineOptions = {
  durationMs: number;
  autoPlay?: boolean;
};

export type DemoTimeline = {
  controls: {
    pause: () => void;
    play: () => void;
    replay: () => void;
    skip: () => void;
  };
  inView: boolean;
  isMotionEnabled: boolean;
  progress: number;
  progressPercent: number;
  setRootElement: (node: HTMLElement | null) => void;
  state: DemoPlaybackState;
};

export function useDemoTimeline({
  autoPlay = true,
  durationMs,
}: DemoTimelineOptions): DemoTimeline {
  const motion = useSignatureDemoMotion();
  const nodeRef = useRef<HTMLElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const elapsedRef = useRef(0);
  const startedAtRef = useRef(0);
  const completedAutoPlayRef = useRef(false);
  const [inView, setInView] = useState(false);
  const [progress, setProgress] = useState(1);
  const [state, setState] = useState<DemoPlaybackState>("reduced-motion");

  const isMotionEnabled = motion.enabled;

  const cancelFrame = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startPlayback = useCallback((fromStart: boolean, replaying: boolean) => {
    cancelFrame();
    if (fromStart) {
      elapsedRef.current = 0;
      setProgress(0);
    }

    startedAtRef.current = performance.now() - elapsedRef.current;
    setState(replaying ? "replaying" : "playing");
  }, [cancelFrame]);

  const controls = useMemo(
    () => ({
      pause: () => {
        if (!isMotionEnabled) return;
        cancelFrame();
        setState("paused");
      },
      play: () => {
        if (!isMotionEnabled) return;
        startPlayback(false, false);
      },
      replay: () => {
        if (!isMotionEnabled) return;
        completedAutoPlayRef.current = true;
        startPlayback(true, true);
      },
      skip: () => {
        cancelFrame();
        elapsedRef.current = durationMs;
        setProgress(1);
        setState(isMotionEnabled ? "completed" : "reduced-motion");
      },
    }),
    [cancelFrame, durationMs, isMotionEnabled, startPlayback],
  );

  const setRootElement = useCallback((node: HTMLElement | null) => {
    nodeRef.current = node;
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!isMotionEnabled) {
        cancelFrame();
        elapsedRef.current = durationMs;
        setProgress(1);
        setState("reduced-motion");
        return;
      }

      setProgress(0);
      setState("idle");
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [cancelFrame, durationMs, isMotionEnabled]);

  useEffect(() => {
    if (!isMotionEnabled) {
      cancelFrame();
      elapsedRef.current = durationMs;
      return;
    }
  }, [cancelFrame, durationMs, isMotionEnabled]);

  useEffect(() => {
    if (!isMotionEnabled) return;

    const node = nodeRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = Boolean(entry?.isIntersecting);
        setInView(visible);
        if (!visible) {
          cancelFrame();
          setState((current) =>
            current === "playing" || current === "replaying" ? "paused" : current,
          );
        }
      },
      { rootMargin: "140px 0px", threshold: 0.24 },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [cancelFrame, isMotionEnabled]);

  useEffect(() => {
    if (!isMotionEnabled || !autoPlay || !inView || completedAutoPlayRef.current) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      completedAutoPlayRef.current = true;
      startPlayback(true, false);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [autoPlay, inView, isMotionEnabled, startPlayback]);

  useEffect(() => {
    if (!isMotionEnabled || (state !== "playing" && state !== "replaying")) {
      return;
    }

    const tick = (now: number) => {
      const elapsed = Math.min(durationMs, now - startedAtRef.current);
      elapsedRef.current = elapsed;
      const nextProgress = elapsed / durationMs;
      setProgress(nextProgress);

      if (nextProgress >= 1) {
        rafRef.current = null;
        setState("completed");
        return;
      }

      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);

    return () => {
      cancelFrame();
    };
  }, [cancelFrame, durationMs, isMotionEnabled, state]);

  useEffect(() => {
    return () => {
      cancelFrame();
    };
  }, [cancelFrame]);

  return {
    controls,
    inView,
    isMotionEnabled,
    progress,
    progressPercent: Math.round(progress * 100),
    setRootElement,
    state,
  };
}

export function after(progress: number, threshold: number) {
  return progress >= threshold;
}

export function between(progress: number, start: number, end: number) {
  if (progress <= start) return 0;
  if (progress >= end) return 1;
  return (progress - start) / (end - start);
}
