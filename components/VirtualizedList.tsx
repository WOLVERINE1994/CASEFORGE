"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type UIEvent } from "react";

type Props<T> = {
  items: T[];
  itemHeight: number;
  overscan?: number;
  className?: string;
  innerClassName?: string;
  emptyState?: ReactNode;
  renderItem: (item: T, index: number) => ReactNode;
};

export default function VirtualizedList<T>({
  items,
  itemHeight,
  overscan = 4,
  className,
  innerClassName,
  emptyState = null,
  renderItem,
}: Props<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [startIndex, setStartIndex] = useState(0);
  const startIndexRef = useRef(0);

  const updateViewportHeight = useCallback(() => {
    if (!containerRef.current) {
      return;
    }
    setViewportHeight(containerRef.current.clientHeight);
  }, []);

  useEffect(() => {
    updateViewportHeight();
    window.addEventListener("resize", updateViewportHeight);
    return () => window.removeEventListener("resize", updateViewportHeight);
  }, [updateViewportHeight]);

  const totalHeight = items.length * itemHeight;
  const visibleCount = viewportHeight > 0 ? Math.ceil(viewportHeight / itemHeight) : 0;
  const safeStartIndex = Math.min(startIndex, Math.max(0, items.length - 1));
  const endIndex = Math.min(
    items.length,
    safeStartIndex + visibleCount + overscan * 2
  );
  const offsetTop = safeStartIndex * itemHeight;

  const visibleItems = useMemo(
    () => items.slice(safeStartIndex, endIndex),
    [endIndex, items, safeStartIndex]
  );

  const handleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const nextStartIndex = Math.max(
        0,
        Math.floor(event.currentTarget.scrollTop / itemHeight) - overscan
      );
      if (startIndexRef.current !== nextStartIndex) {
        startIndexRef.current = nextStartIndex;
        setStartIndex(nextStartIndex);
      }
    },
    [itemHeight, overscan]
  );

  if (items.length === 0) {
    return <>{emptyState}</>;
  }

  return (
    <div
      ref={containerRef}
      className={className}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        <div
          className={innerClassName}
          style={{
            position: "absolute",
            top: offsetTop,
            left: 0,
            right: 0,
          }}
        >
          {visibleItems.map((item, index) => renderItem(item, safeStartIndex + index))}
        </div>
      </div>
    </div>
  );
}
