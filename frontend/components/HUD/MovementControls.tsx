"use client";

import { usePolarisStore } from "@/lib/store";

function KeyCap({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) {
  return (
    <span
      className={`grid h-8 w-8 place-items-center rounded-lg border text-xs font-bold font-mono transition-all duration-100 ${
        active
          ? "bg-cyan-500 border-cyan-400 text-white shadow-lg shadow-cyan-500/40 scale-95"
          : "bg-white/10 border-white/15 text-white/80"
      }`}
    >
      {label}
    </span>
  );
}

export function MovementControls() {
  const keys = usePolarisStore((s) => s.keys);
  const orbiting = usePolarisStore((s) => s.cameraOrbiting);
  const vessel = usePolarisStore((s) => s.vessel);
  
  // Determine movement state
  const speed = vessel.sogKnots;
  let movementState = "IDLE";
  if (speed > 0.1) movementState = "FORWARD";
  else if (speed < -0.1) movementState = "REVERSE";

  return (
    <section className="hud-panel px-4 py-3 flex items-center gap-4 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl text-white shadow-xl">
      <div>
        <h2 className="hud-header mb-2 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">
          Ship Control
        </h2>
        <div className="grid grid-cols-3 gap-1.5 w-[100px]">
          <span />
          <KeyCap label="W" active={keys.w || keys.up} />
          <span />
          <KeyCap label="A" active={keys.a || keys.left} />
          <KeyCap label="S" active={keys.s || keys.down} />
          <KeyCap label="D" active={keys.d || keys.right} />
        </div>
        <div className="mt-2 text-center">
          <div className="text-[11px] font-mono text-cyan-300 font-bold">
            {Math.abs(speed).toFixed(1)} kn
          </div>
          <div className="text-[8px] uppercase tracking-wider text-white/40">
            {movementState}
          </div>
        </div>
      </div>
    </section>
  );
}

