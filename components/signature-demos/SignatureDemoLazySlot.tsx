"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import useSignatureDemoMotion from "./useSignatureDemoMotion";

type DemoLoader = () => Promise<{ default: ComponentType }>;

type SignatureDemoLazySlotProps = {
  fallback: ReactNode;
  loader: DemoLoader;
};

export default function SignatureDemoLazySlot({
  fallback,
  loader,
}: SignatureDemoLazySlotProps) {
  const motion = useSignatureDemoMotion();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const loadStartedRef = useRef(false);
  const [DemoComponent, setDemoComponent] = useState<ComponentType | null>(null);

  useEffect(() => {
    if (!motion.signatureDemosEnabled) return;

    const node = rootRef.current;
    if (!node) return;

    let cancelled = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || loadStartedRef.current) return;
        loadStartedRef.current = true;
        void loader().then((mod) => {
          if (!cancelled) setDemoComponent(() => mod.default);
        });
      },
      { rootMargin: "420px 0px", threshold: 0.01 },
    );

    observer.observe(node);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [loader, motion.signatureDemosEnabled]);

  return <div ref={rootRef}>{DemoComponent ? <DemoComponent /> : fallback}</div>;
}
