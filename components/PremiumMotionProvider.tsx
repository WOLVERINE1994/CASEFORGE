"use client";

import { useEffect, type ReactNode } from "react";
import usePremiumMotion from "./usePremiumMotion";

type PremiumMotionProviderProps = {
  children: ReactNode;
};

export default function PremiumMotionProvider({
  children,
}: PremiumMotionProviderProps) {
  const motion = usePremiumMotion();

  useEffect(() => {
    if (typeof document === "undefined") return;

    const { body } = document;
    if (!motion.enabled) {
      delete body.dataset.premiumMotion;
      delete body.dataset.premiumMotionInput;
      return;
    }

    body.dataset.premiumMotion = "enabled";
    body.dataset.premiumMotionInput =
      motion.isTouchLike && !motion.hasFinePointer ? "touch" : "fine";

    return () => {
      delete body.dataset.premiumMotion;
      delete body.dataset.premiumMotionInput;
    };
  }, [motion.enabled, motion.hasFinePointer, motion.isTouchLike]);

  return children;
}
