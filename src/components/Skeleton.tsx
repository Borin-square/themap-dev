"use client";

import type { CSSProperties } from "react";

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
  style?: CSSProperties;
}

/** Rettangolo skeleton con animazione shimmer. Serve `@keyframes themap-shimmer` in globals.css. */
export function Skeleton({ width = "100%", height = 14, radius = 4, className, style }: SkeletonProps) {
  return (
    <div
      className={className}
      style={{
        width,
        height,
        borderRadius: radius,
        background: "linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.04) 100%)",
        backgroundSize: "200% 100%",
        animation: "themap-shimmer 1.4s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

/** Card skeleton — usa dentro layout dove aspettavi <div className="cd"> */
export function SkeletonCard({ height = 90, style }: { height?: number; style?: CSSProperties }) {
  return (
    <div
      className="cd"
      style={{
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        ...style,
      }}
    >
      <Skeleton width={140} height={12} />
      <Skeleton width="70%" height={height - 40} radius={6} />
    </div>
  );
}

/** Grid di SkeletonCard responsive */
export function SkeletonGrid({ count = 4, minWidth = 240, height = 90 }: { count?: number; minWidth?: number; height?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`, gap: 16 }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} height={height} />
      ))}
    </div>
  );
}
