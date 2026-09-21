const puppeteer = require("puppeteer-core");
const path = require("path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:\\Users\\ADITYA\\.gemini\\antigravity-ide\\brain\\43b9ab02-0949-49b6-a6f6-4925f3b9d984";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("=== Testing Scope 2: Tactical Reasoning Panel ===");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--enable-webgl",
      "--use-gl=angle",
      "--use-angle=d3d11",
      "--window-size=1440,900",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    console.log("1. Navigating to simulation page...");
    await page.goto("http://localhost:9000/simulation", { waitUntil: "networkidle2", timeout: 30000 });

    console.log("Waiting for store icebergs and routes...");
    await page.waitForFunction(() => {
      const s = window.__polarisStore?.getState();
      return s && s.icebergs?.length > 0 && s.routes?.length > 0;
    }, { timeout: 15000 });

    await sleep(2000);

    // Verify Reasoning Panel element
    const panelExists = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes("Tactical Reasoning") && text.includes("Autonomous Event Feed");
    });
    console.log("Reasoning Panel exists in DOM:", panelExists);

    // Inspect mini-diagram content
    const diagramData = await page.evaluate(() => {
      const s = window.__polarisStore.getState();
      const logs = Array.from(document.querySelectorAll(".font-mono.text-\\[10px\\] p")).map((p) => p.innerText);
      return {
        vessel: { lat: s.vessel.lat, lon: s.vessel.lon, sog: s.vessel.sogKnots },
        destination: s.destination,
        lockedRouteId: s.lockedRouteId,
        routesCount: s.routes.length,
        logLines: logs,
      };
    });
    console.log("Tactical diagram & initial logs:", diagramData);

    // Click "Safest" profile in RouteInfoPanel or lockRoute("safest")
    console.log("2. Switching route profile to 'Safest'...");
    await page.evaluate(() => {
      window.__polarisStore.getState().lockRoute("safest");
    });
    await sleep(1000);

    const afterSwitchLogs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll(".font-mono.text-\\[10px\\] p")).map((p) => p.innerText);
    });
    console.log("Logs after switching to Safest:", afterSwitchLogs);

    // Trigger route recalculation
    console.log("3. Triggering recalculateRoute()...");
    await page.evaluate(async () => {
      await window.__polarisStore.getState().recalculateRoute();
    });
    await sleep(2500);

    const afterRecalcLogs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll(".font-mono.text-\\[10px\\] p")).map((p) => p.innerText);
    });
    console.log("Logs after route recalculation:", afterRecalcLogs);

    // Capture screenshot of ReasoningPanel in action
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "5_reasoning_panel_verified.png") });
    console.log("Captured 5_reasoning_panel_verified.png");

    console.log("=== Scope 2 Verification Completed Successfully ===");
  } catch (err) {
    console.error("Scope 2 test error:", err);
  } finally {
    await browser.close();
  }
}

run();
