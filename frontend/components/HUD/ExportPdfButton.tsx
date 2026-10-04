"use client";

import { useState } from "react";
import { usePolarisStore } from "@/lib/store";
import { generateMissionPdf } from "@/lib/missionPdfGenerator";

export function ExportPdfButton() {
  const vessel = usePolarisStore((s) => s.vessel);
  const destination = usePolarisStore((s) => s.destination);
  const routes = usePolarisStore((s) => s.routes);
  const lockedRouteId = usePolarisStore((s) => s.lockedRouteId);
  const icebergs = usePolarisStore((s) => s.allIcebergs.length > 0 ? s.allIcebergs : s.icebergs);
  const alerts = usePolarisStore((s) => s.alerts);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const pdfBytes = await generateMissionPdf({
        vessel,
        destination: destination || { lat: -64.58, lon: -43.1 },
        routes,
        selectedRouteId: lockedRouteId || "safest",
        icebergs,
        alerts,
      });

      const blob = new Blob([pdfBytes as any], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `polaris_mission_plan_${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to generate mission PDF:", err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      type="button"
      disabled={isExporting}
      className="w-full rounded-lg border border-cyan-500/30 bg-slate-900/90 hover:bg-slate-800 px-3 py-2 text-xs font-bold uppercase text-cyan-200 transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
      onClick={handleExport}
    >
      <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <span>{isExporting ? "Generating PDF..." : "Export Mission PDF"}</span>
    </button>
  );
}

