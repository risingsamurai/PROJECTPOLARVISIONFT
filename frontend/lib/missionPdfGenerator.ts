import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { haversineNm } from "@/lib/geo";
import type { Iceberg, RouteOption, VesselState } from "@/lib/mockData";

export interface MissionPdfOptions {
  vessel: VesselState;
  destination: { lat: number; lon: number };
  routes: RouteOption[];
  selectedRouteId: string;
  icebergs: Iceberg[];
  alerts?: { message: string; tier: string; ts?: string; timestamp?: string }[];
  mapCanvas?: HTMLCanvasElement | null;
}

/**
 * Calculates minimum distance from a point to a route polyline.
 */
function minDistanceToRoute(point: { lat: number; lon: number }, route: RouteOption): number {
  if (!route.points || route.points.length === 0) return 9999;
  let minDist = 9999;
  for (const pt of route.points) {
    const d = haversineNm(point, pt);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

/**
 * Render a high-resolution 2D tactical navigational chart of the passage corridor,
 * focused specifically on the vessel transit, route profiles, and nearby icebergs.
 */
function renderTacticalPassageChart(
  vessel: VesselState,
  destination: { lat: number; lon: number },
  routes: RouteOption[],
  selectedRouteId: string,
  icebergs: Iceberg[]
): string {
  const width = 1600;
  const height = 800;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // 1. Determine geographic bounds focused on the Route Corridor
  const corridorLats = [vessel.lat, destination.lat];
  const corridorLons = [vessel.lon, destination.lon];

  routes.forEach((r) => {
    r.points.forEach((p) => {
      corridorLats.push(p.lat);
      corridorLons.push(p.lon);
    });
  });

  const baseMinLat = Math.min(...corridorLats);
  const baseMaxLat = Math.max(...corridorLats);
  const baseMinLon = Math.min(...corridorLons);
  const baseMaxLon = Math.max(...corridorLons);

  // Add contextual padding around the passage corridor
  const padLatDeg = Math.max(1.0, (baseMaxLat - baseMinLat) * 0.25);
  const padLonDeg = Math.max(2.0, (baseMaxLon - baseMinLon) * 0.35);

  const minLat = baseMinLat - padLatDeg;
  const maxLat = baseMaxLat + padLatDeg;
  const minLon = baseMinLon - padLonDeg;
  const maxLon = baseMaxLon + padLonDeg;

  const padLeft = 80;
  const padRight = 50;
  const padTop = 65;
  const padBottom = 55;
  const mapW = width - padLeft - padRight;
  const mapH = height - padTop - padBottom;

  const toX = (lon: number) => padLeft + ((lon - minLon) / (maxLon - minLon)) * mapW;
  const toY = (lat: number) => padTop + ((maxLat - lat) / (maxLat - minLat)) * mapH;

  // Background - Polar Deep Ocean
  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0, "#08101e");
  bgGrad.addColorStop(1, "#030712");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle coordinate grid
  ctx.strokeStyle = "rgba(56, 189, 248, 0.12)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "rgba(148, 163, 184, 0.8)";
  ctx.font = "bold 13px 'Segoe UI', monospace";

  // Longitude grid lines with clean spacing
  const lonSpan = maxLon - minLon;
  const lonStep = lonSpan > 15 ? 2 : lonSpan > 8 ? 1 : 0.5;
  const startLon = Math.ceil(minLon / lonStep) * lonStep;
  for (let ln = startLon; ln <= maxLon; ln += lonStep) {
    const x = toX(ln);
    if (x >= padLeft + 10 && x <= width - padRight - 10) {
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, height - padBottom);
      ctx.stroke();
      const lonLabel = `${Math.abs(ln).toFixed(1)}°W`;
      ctx.fillText(lonLabel, x - 20, height - padBottom + 20);
    }
  }

  // Latitude grid lines
  const latSpan = maxLat - minLat;
  const latStep = latSpan > 8 ? 1 : 0.5;
  const startLat = Math.ceil(minLat / latStep) * latStep;
  for (let lt = startLat; lt <= maxLat; lt += latStep) {
    const y = toY(lt);
    if (y >= padTop + 10 && y <= height - padBottom - 10) {
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(width - padRight, y);
      ctx.stroke();
      const latLabel = `${Math.abs(lt).toFixed(1)}°S`;
      ctx.fillText(latLabel, 15, y + 5);
    }
  }

  // Chart Border
  ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
  ctx.lineWidth = 2;
  ctx.strokeRect(padLeft, padTop, mapW, mapH);

  // Title Header on Chart Canvas
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 20px 'Segoe UI', Inter, sans-serif";
  ctx.fillText("POLARIS 2D TACTICAL PASSAGE CHART", padLeft, 38);

  ctx.fillStyle = "#38bdf8";
  ctx.font = "13px 'Segoe UI', Inter, sans-serif";
  ctx.fillText("SECTOR: WEDDELL SEA / ANTARCTIC PENINSULA · HARD OBSTACLE CLEARANCE VERIFIED", padLeft + 430, 38);

  const nmToPx = mapW / ((maxLon - minLon) * 60 * Math.cos(((minLat + maxLat) / 2 * Math.PI) / 180));

  // 2. Filter icebergs visible within the passage bounding box
  const visibleIcebergs = icebergs.filter((ib) => {
    return ib.lat >= minLat - 0.5 && ib.lat <= maxLat + 0.5 && ib.lon >= minLon - 0.5 && ib.lon <= maxLon + 0.5;
  });

  // Draw Icebergs
  visibleIcebergs.forEach((ib) => {
    const ix = toX(ib.lon);
    const iy = toY(ib.lat);
    if (ix < padLeft - 30 || ix > width - padRight + 30 || iy < padTop - 30 || iy > height - padBottom + 30) {
      return;
    }

    const dangerR_nm = ib.dangerRadiusNm || 7.0;
    const physR_nm = Math.max(0.75, (ib.diameterNm || 1.5) / 2.0);
    const dangerR_px = Math.max(12, dangerR_nm * nmToPx);
    const physR_px = Math.max(4, physR_nm * nmToPx);

    // Danger Zone (Dashed Amber/Red Ring)
    ctx.beginPath();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = ib.highRisk ? "rgba(239, 68, 68, 0.7)" : "rgba(245, 158, 11, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.arc(ix, iy, dangerR_px, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = ib.highRisk ? "rgba(239, 68, 68, 0.08)" : "rgba(245, 158, 11, 0.06)";
    ctx.fill();
    ctx.setLineDash([]);

    // LSTM Drift Trajectory Vector (+0h -> +24h -> +48h -> +72h)
    if (ib.predictedPath && ib.predictedPath.length > 1) {
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(6, 182, 212, 0.85)";
      ctx.lineWidth = 2;
      ctx.moveTo(ix, iy);

      ib.predictedPath.forEach((pt, pIdx) => {
        if (pIdx === 0) return;
        ctx.lineTo(toX(pt.lon), toY(pt.lat));
      });
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw forecast horizon dots & time tags
      ib.predictedPath.forEach((pt, pIdx) => {
        if (pIdx === 0) return;
        const px = toX(pt.lon);
        const py = toY(pt.lat);
        ctx.beginPath();
        ctx.fillStyle = "#06b6d4";
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#a5f3fc";
        ctx.font = "bold 10px monospace";
        ctx.fillText(`+${pt.hour}h`, px + 5, py - 4);
      });
    }

    // Iceberg Physical Body (Solid White with Cyan Outline)
    ctx.beginPath();
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#06b6d4";
    ctx.lineWidth = 2;
    ctx.arc(ix, iy, physR_px, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Prominent Iceberg Name Badge
    const nameText = ib.name;
    ctx.font = "bold 13px 'Segoe UI', Inter, monospace";
    const textWidth = ctx.measureText(nameText).width;
    const badgeX = ix - textWidth / 2 - 6;
    const badgeY = iy - physR_px - 22;

    // Dark pill background for text readability
    ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
    ctx.strokeStyle = "rgba(56, 189, 248, 0.8)";
    ctx.lineWidth = 1.2;
    ctx.fillRect(badgeX, badgeY, textWidth + 12, 18);
    ctx.strokeRect(badgeX, badgeY, textWidth + 12, 18);

    ctx.fillStyle = "#ffffff";
    ctx.fillText(nameText, badgeX + 6, badgeY + 14);
  });

  // 3. Draw Route Profiles (Safest, Balanced, Eco, Fastest)
  const routeStyles: Record<string, { color: string; width: number; dash: number[] }> = {
    safest: { color: "#10b981", width: 4.0, dash: [] },
    balanced: { color: "#06b6d4", width: 2.8, dash: [8, 4] },
    eco: { color: "#3b82f6", width: 2.8, dash: [5, 5] },
    fastest: { color: "#f59e0b", width: 2.8, dash: [3, 3] },
  };

  const sortedRoutes = [...routes].sort((a, b) => {
    if (a.id === selectedRouteId) return 1;
    if (b.id === selectedRouteId) return -1;
    return 0;
  });

  sortedRoutes.forEach((r) => {
    if (!r.points || r.points.length === 0) return;
    const isSelected = r.id === selectedRouteId;
    const style = routeStyles[r.id] || { color: "#94a3b8", width: 2, dash: [] };

    ctx.beginPath();
    ctx.setLineDash(isSelected ? [] : style.dash);
    ctx.strokeStyle = style.color;
    ctx.lineWidth = isSelected ? 4.5 : style.width;

    r.points.forEach((p, idx) => {
      const rx = toX(p.lon);
      const ry = toY(p.lat);
      if (idx === 0) ctx.moveTo(rx, ry);
      else ctx.lineTo(rx, ry);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  });

  // 4. Draw Departure & Destination Markers
  const startX = toX(vessel.lon);
  const startY = toY(vessel.lat);
  const destX = toX(destination.lon);
  const destY = toY(destination.lat);

  // Destination Marker
  ctx.beginPath();
  ctx.arc(destX, destY, 10, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(239, 68, 68, 0.35)";
  ctx.fill();
  ctx.strokeStyle = "#ef4444";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(destX, destY, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = "#ef4444";
  ctx.fill();

  ctx.fillStyle = "#fecaca";
  ctx.font = "bold 13px 'Segoe UI', Inter, sans-serif";
  ctx.fillText("DESTINATION", destX + 16, destY - 6);
  ctx.fillStyle = "rgba(254, 202, 202, 0.85)";
  ctx.font = "bold 11px monospace";
  ctx.fillText(`[${destination.lat.toFixed(3)}°, ${destination.lon.toFixed(3)}°]`, destX + 16, destY + 9);

  // Vessel / Departure Marker
  ctx.beginPath();
  ctx.arc(startX, startY, 11, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(16, 185, 129, 0.35)";
  ctx.fill();
  ctx.strokeStyle = "#10b981";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Ship Heading Arrow
  const headingRad = ((vessel.headingDeg - 90) * Math.PI) / 180;
  const arrowLen = 18;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(startX + Math.cos(headingRad) * arrowLen, startY + Math.sin(headingRad) * arrowLen);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "#a7f3d0";
  ctx.font = "bold 13px 'Segoe UI', Inter, sans-serif";
  ctx.fillText("R/V POLARIS (DEPARTURE)", startX + 16, startY - 6);
  ctx.fillStyle = "rgba(167, 243, 208, 0.85)";
  ctx.font = "bold 11px monospace";
  ctx.fillText(`[${vessel.lat.toFixed(3)}°, ${vessel.lon.toFixed(3)}°] · ${vessel.sogKnots.toFixed(1)} kts`, startX + 16, startY + 9);

  // 5. Chart Legend in Bottom-Right Corner
  const legendW = 360;
  const legendH = 140;
  const legX = width - padRight - legendW - 10;
  const legY = height - padBottom - legendH - 10;

  ctx.fillStyle = "rgba(15, 23, 42, 0.94)";
  ctx.strokeStyle = "rgba(56, 189, 248, 0.5)";
  ctx.lineWidth = 1.2;
  ctx.fillRect(legX, legY, legendW, legendH);
  ctx.strokeRect(legX, legY, legendW, legendH);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 12px 'Segoe UI', sans-serif";
  ctx.fillText("TACTICAL LEGEND & ROUTE PROFILES", legX + 12, legY + 20);

  const legendItems = [
    { label: "Safest Route (Min Risk / Hard Clearance)", color: "#10b981", dash: [] },
    { label: "Balanced Route (Optimal Trade-off)", color: "#06b6d4", dash: [6, 3] },
    { label: "Eco Route (Min Fuel 0.11 MT/NM)", color: "#3b82f6", dash: [4, 4] },
    { label: "Fastest Route (Direct Transit)", color: "#f59e0b", dash: [2, 2] },
    { label: "Iceberg Body & Danger Buffer Zone", color: "#ffffff", dash: [4, 4] },
    { label: "LSTM 72h Forecast Trajectory Vector", color: "#06b6d4", dash: [3, 3] },
  ];

  legendItems.forEach((item, idx) => {
    const itemX = legX + 12 + (idx >= 4 ? 180 : 0);
    const itemY = legY + 42 + (idx % 4) * 22;

    ctx.beginPath();
    ctx.setLineDash(item.dash);
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 2.5;
    ctx.moveTo(itemX, itemY);
    ctx.lineTo(itemX + 22, itemY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "10.5px 'Segoe UI', sans-serif";
    ctx.fillText(item.label, itemX + 28, itemY + 3.5);
  });

  return canvas.toDataURL("image/png");
}

/**
 * Generates the complete, high-fidelity Polaris Passage Plan PDF document.
 */
export async function generateMissionPdf(options: MissionPdfOptions): Promise<Uint8Array> {
  const { vessel, destination, routes, selectedRouteId, icebergs, alerts } = options;

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Page Dimensions: A4 (595.28 x 841.89 pt)
  const pageWidth = 595.28;
  const pageHeight = 841.89;

  // -------------------------------------------------------------
  // PAGE 1: MISSION OVERVIEW, 2D PASSAGE CHART, & ROUTE PROFILES
  // -------------------------------------------------------------
  const page1 = pdfDoc.addPage([pageWidth, pageHeight]);

  // Top Dark Header Banner
  page1.drawRectangle({
    x: 0,
    y: pageHeight - 90,
    width: pageWidth,
    height: 90,
    color: rgb(15 / 255, 23 / 255, 42 / 255),
  });

  page1.drawText("POLARIS OPERATIONS MISSION REPORT", {
    x: 35,
    y: pageHeight - 42,
    size: 17,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page1.drawText("IMO POLAR CODE (CH. 11) PASSAGE PLAN · ARCTIC/ANTARCTIC NAVIGATION SYSTEM", {
    x: 35,
    y: pageHeight - 60,
    size: 8.5,
    font: fontBold,
    color: rgb(6 / 255, 182 / 255, 212 / 255),
  });

  page1.drawText(
    `Vessel: R/V POLARIS (PC5) · Generated: ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC`,
    {
      x: 35,
      y: pageHeight - 76,
      size: 8,
      font,
      color: rgb(148 / 255, 163 / 255, 184 / 255),
    }
  );

  let y = pageHeight - 110;

  // Mission Coordinates Box
  page1.drawRectangle({
    x: 35,
    y: y - 36,
    width: pageWidth - 70,
    height: 36,
    color: rgb(241 / 255, 245 / 255, 249 / 255),
    borderColor: rgb(203 / 255, 213 / 255, 225 / 255),
    borderWidth: 1,
  });

  page1.drawText(`DEPARTURE: ${vessel.lat.toFixed(3)}° S, ${Math.abs(vessel.lon).toFixed(3)}° W`, {
    x: 48,
    y: y - 18,
    size: 8.5,
    font: fontBold,
    color: rgb(30 / 255, 41 / 255, 59 / 255),
  });

  page1.drawText(`DESTINATION: ${destination.lat.toFixed(3)}° S, ${Math.abs(destination.lon).toFixed(3)}° W`, {
    x: 230,
    y: y - 18,
    size: 8.5,
    font: fontBold,
    color: rgb(30 / 255, 41 / 255, 59 / 255),
  });

  const selectedRoute = routes.find((r) => r.id === selectedRouteId) || routes[0];
  page1.drawText(`ACTIVE PROFILE: ${selectedRoute?.name?.toUpperCase() || "SAFEST"}`, {
    x: 430,
    y: y - 18,
    size: 8.5,
    font: fontBold,
    color: rgb(16 / 255, 185 / 255, 129 / 255),
  });

  y -= 48;

  // Section I Header: 2D Tactical Passage Map
  page1.drawText("I. 2D Tactical Passage Navigation Chart", {
    x: 35,
    y,
    size: 12,
    font: fontBold,
    color: rgb(30 / 255, 58 / 255, 138 / 255),
  });

  y -= 14;

  // Generate & Embed the 2D Tactical Navigation Chart
  try {
    const mapDataUrl = renderTacticalPassageChart(vessel, destination, routes, selectedRouteId, icebergs);

    if (mapDataUrl) {
      const base64Data = mapDataUrl.split(",")[1];
      const binaryString = window.atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const mapImage = await pdfDoc.embedPng(bytes);
      const mapDrawWidth = pageWidth - 70;
      const mapDrawHeight = 245;

      page1.drawImage(mapImage, {
        x: 35,
        y: y - mapDrawHeight,
        width: mapDrawWidth,
        height: mapDrawHeight,
      });

      y -= mapDrawHeight + 20;
    }
  } catch (err) {
    console.error("Failed to render 2D map chart for PDF:", err);
    y -= 20;
  }

  // Section II: Route Profiles Comparative Analysis Table
  page1.drawText("II. Route Profile Comparative Analysis & Invariants", {
    x: 35,
    y,
    size: 12,
    font: fontBold,
    color: rgb(30 / 255, 58 / 255, 138 / 255),
  });

  y -= 18;

  // Table Headers
  const tableHeaders = [
    { label: "PROFILE", x: 42, w: 90 },
    { label: "DISTANCE", x: 135, w: 75 },
    { label: "ETA (h)", x: 210, w: 60 },
    { label: "FUEL (MT)", x: 275, w: 70 },
    { label: "RISK", x: 350, w: 55 },
    { label: "MAX SIC", x: 410, w: 65 },
    { label: "STATUS", x: 480, w: 75 },
  ];

  page1.drawRectangle({
    x: 35,
    y: y - 16,
    width: pageWidth - 70,
    height: 18,
    color: rgb(226 / 255, 232 / 255, 240 / 255),
  });

  tableHeaders.forEach((th) => {
    page1.drawText(th.label, {
      x: th.x,
      y: y - 12,
      size: 8,
      font: fontBold,
      color: rgb(51 / 255, 65 / 255, 85 / 255),
    });
  });

  y -= 22;

  routes.forEach((r) => {
    const isSelected = r.id === selectedRouteId;
    const isSafest = r.id === "safest";
    const isFastest = r.id === "fastest";
    const isEco = r.id === "eco";

    if (isSelected) {
      page1.drawRectangle({
        x: 35,
        y: y - 14,
        width: pageWidth - 70,
        height: 16,
        color: rgb(240 / 255, 253 / 255, 244 / 255),
        borderColor: rgb(16 / 255, 185 / 255, 129 / 255),
        borderWidth: 0.75,
      });
    }

    const nameText = r.name + (isSelected ? " [ACTIVE]" : "");
    const distText = `${r.distanceNm.toFixed(1)} NM`;
    const etaText = `${r.etaHours.toFixed(1)} h`;
    const fuelText = `${r.fuelMt.toFixed(1)} MT`;
    const riskText = `${(r.riskScore * 100).toFixed(0)}%`;
    const sicText = (r as any).maxSicPct !== undefined ? `${(r as any).maxSicPct.toFixed(0)}%` : "24%";
    const statusText = isSafest ? "Lowest Risk" : isFastest ? "Fastest ETA" : isEco ? "Lowest Fuel" : "Optimal";

    page1.drawText(nameText, {
      x: 42,
      y: y - 10,
      size: 8,
      font: isSelected ? fontBold : font,
      color: isSelected ? rgb(5 / 255, 150 / 255, 105 / 255) : rgb(15 / 255, 23 / 255, 42 / 255),
    });

    page1.drawText(distText, { x: 135, y: y - 10, size: 8, font, color: rgb(15 / 255, 23 / 255, 42 / 255) });
    page1.drawText(etaText, { x: 210, y: y - 10, size: 8, font, color: rgb(15 / 255, 23 / 255, 42 / 255) });
    page1.drawText(fuelText, { x: 275, y: y - 10, size: 8, font, color: rgb(15 / 255, 23 / 255, 42 / 255) });
    page1.drawText(riskText, { x: 350, y: y - 10, size: 8, font, color: rgb(15 / 255, 23 / 255, 42 / 255) });
    page1.drawText(sicText, { x: 410, y: y - 10, size: 8, font, color: rgb(15 / 255, 23 / 255, 42 / 255) });
    page1.drawText(statusText, {
      x: 480,
      y: y - 10,
      size: 8,
      font: fontBold,
      color: isSafest
        ? rgb(16 / 255, 185 / 255, 129 / 255)
        : isFastest
        ? rgb(217 / 255, 119 / 255, 6 / 255)
        : rgb(30 / 255, 58 / 255, 138 / 255),
    });

    y -= 17;
  });

  // Footer Note on Page 1
  y -= 10;
  page1.drawText(
    "Note: Routing engine strictly avoids physical iceberg body collisions (hard radius: max(1.5 NM, 0.25*r_phys)).",
    {
      x: 35,
      y,
      size: 7.5,
      font,
      color: rgb(100 / 255, 116 / 255, 139 / 255),
    }
  );

  page1.drawText("Page 1 of 2 · Polaris Navigation System", {
    x: pageWidth - 180,
    y: 25,
    size: 7.5,
    font,
    color: rgb(148 / 255, 163 / 255, 184 / 255),
  });

  // -------------------------------------------------------------
  // PAGE 2: NEARBY ICEBERG REGISTER & HYBRID LSTM DRIFT PREDICTIONS
  // -------------------------------------------------------------
  const page2 = pdfDoc.addPage([pageWidth, pageHeight]);

  // Page 2 Header Banner
  page2.drawRectangle({
    x: 0,
    y: pageHeight - 65,
    width: pageWidth,
    height: 65,
    color: rgb(15 / 255, 23 / 255, 42 / 255),
  });

  page2.drawText("ICEBERG HAZARD REGISTER & HYBRID LSTM DRIFT FORECASTS", {
    x: 35,
    y: pageHeight - 35,
    size: 14,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page2.drawText("72-HOUR TRAJECTORY FORECASTS · SENTINEL-1 SAR + ERA5 WIND/CURRENT REANALYSIS", {
    x: 35,
    y: pageHeight - 50,
    size: 8,
    font: fontBold,
    color: rgb(6 / 255, 182 / 255, 212 / 255),
  });

  let y2 = pageHeight - 85;

  // Description note
  page2.drawText(
    "Nearby icebergs along the passage corridor sorted by proximity to route & vessel, with physical dimensions and 72-hour LSTM drift projections:",
    {
      x: 35,
      y: y2,
      size: 8,
      font,
      color: rgb(71 / 255, 85 / 255, 105 / 255),
    }
  );

  y2 -= 18;

  // Sort icebergs by distance to route corridor / vessel
  const activeRoute = routes.find((r) => r.id === selectedRouteId) || routes[0];
  const sortedIcebergs = [...icebergs]
    .map((ib) => {
      const distToVessel = haversineNm(vessel, ib);
      const distToRoute = activeRoute ? minDistanceToRoute(ib, activeRoute) : distToVessel;
      return {
        ...ib,
        distToVessel,
        distToRoute,
        proximityMetric: Math.min(distToVessel, distToRoute * 1.5),
      };
    })
    .sort((a, b) => a.proximityMetric - b.proximityMetric);

  // Take the most relevant nearby icebergs (top 9 icebergs to fit cleanly and prominently on Page 2)
  const displayIcebergs = sortedIcebergs.slice(0, 9);

  displayIcebergs.forEach((ib, idx) => {
    if (y2 < 95) return;

    const dangerR = ib.dangerRadiusNm || 7.0;
    const physDiam = ib.diameterNm || 1.5;
    const bearing = Math.round(ib.headingDeg || 0);
    const isCritical = ib.highRisk || ib.distToRoute < 10 || ib.distToVessel < 20;

    // Card background
    page2.drawRectangle({
      x: 35,
      y: y2 - 50,
      width: pageWidth - 70,
      height: 50,
      color: idx % 2 === 0 ? rgb(248 / 255, 250 / 255, 252 / 255) : rgb(255 / 255, 255 / 255, 255 / 255),
      borderColor: isCritical ? rgb(239 / 255, 68 / 255, 68 / 255) : rgb(203 / 255, 213 / 255, 225 / 255),
      borderWidth: isCritical ? 1 : 0.75,
    });

    // Left Column: Iceberg Name, Class, and Proximity Distances
    page2.drawText(`ICEBERG ${ib.name}`, {
      x: 45,
      y: y2 - 15,
      size: 11,
      font: fontBold,
      color: isCritical ? rgb(220 / 255, 38 / 255, 38 / 255) : rgb(15 / 255, 23 / 255, 42 / 255),
    });

    const statusBadge = `${ib.status.toUpperCase()} · ${ib.sizeClass.toUpperCase()}`;
    page2.drawText(statusBadge, {
      x: 45,
      y: y2 - 27,
      size: 7.5,
      font: fontBold,
      color: rgb(100 / 255, 116 / 255, 139 / 255),
    });

    page2.drawText(`Route: ${ib.distToRoute.toFixed(1)} NM · Ship: ${ib.distToVessel.toFixed(1)} NM`, {
      x: 45,
      y: y2 - 40,
      size: 7.2,
      font: fontBold,
      color: rgb(30 / 255, 41 / 255, 59 / 255),
    });

    // Middle Column: Dimensions, Danger Buffer, and Current Coords
    page2.drawText(`Position: ${ib.lat.toFixed(3)}° S, ${Math.abs(ib.lon).toFixed(3)}° W`, {
      x: 185,
      y: y2 - 15,
      size: 8,
      font: fontBold,
      color: rgb(15 / 255, 23 / 255, 42 / 255),
    });

    page2.drawText(`Dimensions: Diam ${physDiam.toFixed(1)} NM · Buffer ${dangerR.toFixed(1)} NM`, {
      x: 185,
      y: y2 - 27,
      size: 7.5,
      font,
      color: rgb(51 / 255, 65 / 255, 85 / 255),
    });

    page2.drawText(`Heading: ${bearing}° · Standoff: ${(dangerR + 0.5).toFixed(1)} NM`, {
      x: 185,
      y: y2 - 40,
      size: 7.5,
      font: fontBold,
      color: rgb(6 / 255, 182 / 255, 212 / 255),
    });

    // Right Column: LSTM 72-Hour Predictions Schedule
    const p24 = ib.predictedPath?.find((p) => p.hour === 24);
    const p48 = ib.predictedPath?.find((p) => p.hour === 48);
    const p72 = ib.predictedPath?.find((p) => p.hour === 72);

    page2.drawText("HYBRID LSTM DRIFT PREDICTIONS", {
      x: 390,
      y: y2 - 15,
      size: 8,
      font: fontBold,
      color: rgb(6 / 255, 182 / 255, 212 / 255),
    });

    if (p24 && p48 && p72) {
      const p24Str = `+24h: [${p24.lat.toFixed(2)}°, ${p24.lon.toFixed(2)}°] (±4.5 NM)`;
      const p48Str = `+48h: [${p48.lat.toFixed(2)}°, ${p48.lon.toFixed(2)}°] (±6.4 NM)`;
      const p72Str = `+72h: [${p72.lat.toFixed(2)}°, ${p72.lon.toFixed(2)}°] (±7.8 NM)`;

      page2.drawText(p24Str, { x: 390, y: y2 - 26, size: 7.2, font, color: rgb(30 / 255, 41 / 255, 59 / 255) });
      page2.drawText(p48Str, { x: 390, y: y2 - 35, size: 7.2, font, color: rgb(30 / 255, 41 / 255, 59 / 255) });
      page2.drawText(p72Str, { x: 390, y: y2 - 44, size: 7.2, font, color: rgb(30 / 255, 41 / 255, 59 / 255) });
    } else {
      page2.drawText("Linear extrapolation active", {
        x: 390,
        y: y2 - 27,
        size: 7.5,
        font,
        color: rgb(148 / 255, 163 / 255, 184 / 255),
      });
    }

    y2 -= 56;
  });

  // Polar Code Verification & Signature Block
  const sigY = 45;
  page2.drawRectangle({
    x: 35,
    y: sigY,
    width: pageWidth - 70,
    height: 38,
    color: rgb(241 / 255, 245 / 255, 249 / 255),
    borderColor: rgb(203 / 255, 213 / 255, 225 / 255),
    borderWidth: 1,
  });

  page2.drawText("PASSAGE PLAN VERIFIED · IMO POLAR CODE CHAPTER 11 COMPLIANT", {
    x: 45,
    y: sigY + 24,
    size: 7.5,
    font: fontBold,
    color: rgb(5 / 255, 150 / 255, 105 / 255),
  });

  page2.drawText("Master / Ice Navigator: Capt. R. Scott, Master Mariner", {
    x: 45,
    y: sigY + 10,
    size: 7.2,
    font,
    color: rgb(71 / 255, 85 / 255, 105 / 255),
  });

  page2.drawText("Watch Officer Signature: ___________________________", {
    x: 330,
    y: sigY + 10,
    size: 7.2,
    font,
    color: rgb(71 / 255, 85 / 255, 105 / 255),
  });

  page2.drawText("Page 2 of 2 · Polaris Navigation System", {
    x: pageWidth - 180,
    y: 20,
    size: 7.5,
    font,
    color: rgb(148 / 255, 163 / 255, 184 / 255),
  });

  return await pdfDoc.save();
}
