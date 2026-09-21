"use client";

import { useEffect, useState } from "react";
import { usePolarisStore } from "@/lib/store";

export function ProximityFlashOverlay() {
  const proximityFlashId = usePolarisStore((s) => s.proximityFlashId);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!proximityFlashId) return;

    // Reset and trigger flash animation
    setActive(false);
    const frame = requestAnimationFrame(() => {
      setActive(true);
    });

    // Pulse 2-3 times over ~1.5s then fade out completely
    const timer = setTimeout(() => {
      setActive(false);
    }, 1600);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [proximityFlashId]);

  if (!active) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-40 animate-proximity-vignette"
      style={{
        boxShadow: "inset 0 0 120px 40px rgba(239, 68, 68, 0.45), inset 0 0 45px 12px rgba(220, 38, 38, 0.65)",
        border: "3px solid rgba(239, 68, 68, 0.55)",
      }}
    />
  );
}
