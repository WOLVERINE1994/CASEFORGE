"use client";

import { useEffect, useState } from "react";

type PremiumMotionState = {
  documentVisible: boolean;
  enabled: boolean;
  hasFinePointer: boolean;
  isTouchLike: boolean;
  prefersReducedMotion: boolean;
};

const envMotionEnabled =
  process.env.NEXT_PUBLIC_PREMIUM_MOTION_ENABLED === "true" ||
  process.env.NEXT_PUBLIC_PREMIUM_MOTION_ENABLED === "1";

const staticState: PremiumMotionState = {
  documentVisible: true,
  enabled: false,
  hasFinePointer: false,
  isTouchLike: false,
  prefersReducedMotion: false,
};

function readMotionState(): PremiumMotionState {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return staticState;
  }

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const hasFinePointer = window.matchMedia("(pointer: fine)").matches;
  const isTouchLike =
    window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(hover: none)").matches ||
    navigator.maxTouchPoints > 0;
  const documentVisible = document.visibilityState === "visible";

  return {
    documentVisible,
    enabled: envMotionEnabled && !prefersReducedMotion && documentVisible,
    hasFinePointer,
    isTouchLike,
    prefersReducedMotion,
  };
}

export default function usePremiumMotion(): PremiumMotionState {
  const [state, setState] = useState<PremiumMotionState>(() =>
    envMotionEnabled ? readMotionState() : staticState,
  );

  useEffect(() => {
    if (!envMotionEnabled) {
      return;
    }

    const reducedMotionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    const finePointerQuery = window.matchMedia("(pointer: fine)");
    const coarsePointerQuery = window.matchMedia("(pointer: coarse)");
    const hoverNoneQuery = window.matchMedia("(hover: none)");

    const updateState = () => {
      setState(readMotionState());
    };

    updateState();
    document.addEventListener("visibilitychange", updateState);
    reducedMotionQuery.addEventListener("change", updateState);
    finePointerQuery.addEventListener("change", updateState);
    coarsePointerQuery.addEventListener("change", updateState);
    hoverNoneQuery.addEventListener("change", updateState);

    return () => {
      document.removeEventListener("visibilitychange", updateState);
      reducedMotionQuery.removeEventListener("change", updateState);
      finePointerQuery.removeEventListener("change", updateState);
      coarsePointerQuery.removeEventListener("change", updateState);
      hoverNoneQuery.removeEventListener("change", updateState);
    };
  }, []);

  return state;
}
