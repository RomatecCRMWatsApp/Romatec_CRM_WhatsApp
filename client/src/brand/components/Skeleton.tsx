import type { CSSProperties } from "react";

export interface SkeletonProps {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  radius?: number;
  className?: string;
}

/** Esqueleto com brilho verde — usar no lugar dos números enquanto o painel carrega. */
export function Skeleton({ width = "100%", height = 16, radius = 10, className }: SkeletonProps) {
  return <span className={["rt-skeleton", className].filter(Boolean).join(" ")} style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}
