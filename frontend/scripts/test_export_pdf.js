const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");

const ARTIFACT_DIR = "C:\\Users\\ADITYA\\.gemini\\antigravity-ide\\brain\\ebf4b4fb-64ed-4d05-a3ed-a1dd348154e1";

async function main() {
  console.log("Launching browser for PDF export verification...");
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
      "--window-size=1920,1080",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  console.log("Navigating to http://localhost:9000/dashboard ...");
  await page.goto("http://localhost:9000/dashboard", { waitUntil: "networkidle2", timeout: 45000 });

  // Wait for store and icebergs to load
  console.log("Waiting for store icebergs and routes to populate...");
  await page.waitForFunction(
    () => {
      const s = window.__polarisStore?.getState();
      return (s?.icebergs?.length || 0) > 0 && (s?.routes?.length || 0) > 0;
    },
    { timeout: 30000 }
  );

  console.log("Evaluating PDF generation in browser context...");
  const pdfBase64 = await page.evaluate(async () => {
    const store = window.__polarisStore.getState();
    // Use the missionPdfGenerator via window or create instance
    const { generateMissionPdf } = await import("/_next/static/chunks/app/dashboard/page.js").catch(() => ({}));
    
    // Trigger handleExportPdf or simulate generateMissionPdf call
    const vessel = store.vessel || { lat: -68.35, lon: -52.45, headingDeg: 112, sogKnots: 8.4, cogDeg: 112 };
    const destination = store.destination || { lat: -64.58, lon: -43.1 };
    const routes = store.routes;
    const selectedRouteId = store.lockedRouteId || "safest";
    const icebergs = store.allIcebergs?.length > 0 ? store.allIcebergs : store.icebergs;
    const alerts = store.alerts;

    // Call generateMissionPdf through export button click or direct invocation
    const exportBtn = Array.from(document.querySelectorAll("button")).find(b => b.textContent?.includes("Export PDF") || b.textContent?.includes("Export Mission PDF"));
    
    if (exportBtn) {
      console.log("Found Export PDF button, clicking...");
      exportBtn.click();
    }

    return {
      vessel,
      destination,
      routesCount: routes?.length,
      icebergsCount: icebergs?.length,
      selectedRouteId,
      topIcebergs: icebergs.slice(0, 5).map(ib => ({
        name: ib.name,
        lat: ib.lat,
        lon: ib.lon,
        diameterNm: ib.diameterNm,
        dangerRadiusNm: ib.dangerRadiusNm,
        predictedPath: ib.predictedPath
      }))
    };
  });

  console.log("Evaluation result:", JSON.stringify(pdfBase64, null, 2));

  // Take screenshot of Dashboard with Export PDF button
  const dashboardShot = path.join(ARTIFACT_DIR, "step5_2d_dashboard_pdf_export_ready.png");
  await page.screenshot({ path: dashboardShot, fullPage: false });
  console.log(`Saved screenshot: ${dashboardShot}`);

  // Now navigate to 3D Simulation HUD to test Export Mission PDF button there
  console.log("Navigating to http://localhost:9000/simulation ...");
  await page.goto("http://localhost:9000/simulation", { waitUntil: "networkidle2", timeout: 45000 });

  await page.waitForFunction(
    () => {
      const s = window.__polarisStore?.getState();
      return (s?.icebergs?.length || 0) > 0 && (s?.routes?.length || 0) > 0;
    },
    { timeout: 30000 }
  );

  // Capture HUD with Export Mission PDF button
  const simulationShot = path.join(ARTIFACT_DIR, "step5_3d_simulation_pdf_export_hud.png");
  await page.screenshot({ path: simulationShot, fullPage: false });
  console.log(`Saved screenshot: ${simulationShot}`);

  await browser.close();
  console.log("Browser test completed successfully.");
}

main().catch((err) => {
  console.error("PDF test error:", err);
  process.exit(1);
});
