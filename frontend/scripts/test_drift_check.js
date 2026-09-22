const puppeteer = require("puppeteer-core");
const path = require("path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("=== STEP 1 & 2: VERIFY CURRENT ROUTE SYNC & START/DEST DRIFT ===");

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

    // 1. Load 2D map
    console.log("\n--- Checking 2D map initial state ---");
    await page.goto("http://localhost:9000", { waitUntil: "networkidle2", timeout: 30000 });
    await sleep(3500);

    const initial2D = await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      const routes = s?.routes || [];
      const safest = routes.find(r => r.id === "safest");
      const balanced = routes.find(r => r.id === "balanced");
      const fastest = routes.find(r => r.id === "fastest");
      return {
        vessel: s?.vessel,
        destination: s?.destination,
        lockedRouteId: s?.lockedRouteId,
        routesCount: routes.length,
        safestStart: safest?.points?.[0],
        safestEnd: safest?.points?.[safest.points.length - 1],
        balancedStart: balanced?.points?.[0],
        balancedEnd: balanced?.points?.[balanced.points.length - 1],
        fastestStart: fastest?.points?.[0],
        fastestEnd: fastest?.points?.[fastest.points.length - 1],
      };
    });
    console.log("Initial 2D Route & Vessel state:", initial2D);

    // 2. Load 3D Simulator
    console.log("\n--- Checking 3D simulator initial state ---");
    await page.goto("http://localhost:9000/simulation", { waitUntil: "networkidle2", timeout: 30000 });
    await sleep(3500);

    const initial3D = await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      const activeRoute = s?.routes?.find(r => r.id === s.lockedRouteId);
      const startPt = activeRoute?.points?.[0];
      const endPt = activeRoute?.points?.[activeRoute.points.length - 1];
      const vessel = s?.vessel;
      const destination = s?.destination;

      const startDistNm = (startPt && vessel)
        ? Math.hypot((vessel.lat - startPt.lat) * 60, (vessel.lon - startPt.lon) * 60 * Math.cos(vessel.lat * Math.PI / 180))
        : null;

      const endDistNm = (endPt && destination)
        ? Math.hypot((destination.lat - endPt.lat) * 60, (destination.lon - endPt.lon) * 60 * Math.cos(destination.lat * Math.PI / 180))
        : null;

      return {
        vessel,
        destination,
        lockedRouteId: s?.lockedRouteId,
        routeStartPt: startPt,
        routeEndPt: endPt,
        startDistNm,
        endDistNm,
        routesCount: s?.routes?.length || 0,
      };
    });
    console.log("Initial 3D Route vs Vessel Alignment:", initial3D);

    // 3. Test DRIFT Scenario:
    // Scenario A: User on 2D map inputs new route endpoints [-66.0, -50.0] -> [-62.0, -45.0] and computes
    console.log("\n--- Testing Drift Scenario: Computing new route from 2D page ---");
    await page.goto("http://localhost:9000", { waitUntil: "networkidle2", timeout: 30000 });
    await sleep(2500);

    // Enter new start/dest coords on 2D map
    const customRouteResult = await page.evaluate(async () => {
      const s = window.__polarisStore?.getState();
      const newStart = [-66.0, -50.0];
      const newDest = [-62.0, -45.0];
      const res = await s.fetchRoutesIfNeeded(newStart, newDest, true);
      return {
        routesLength: res?.length || 0,
        storeVessel: s.vessel,
        storeDest: s.destination,
        localStorageVessel: localStorage.getItem("polaris_vessel_pos"),
        localStorageWarp: localStorage.getItem("polaris_warp_target"),
      };
    });
    console.log("After computing custom route on 2D:", customRouteResult);

    // Now switch to 3D Simulator and see where the vessel is!
    await page.goto("http://localhost:9000/simulation", { waitUntil: "networkidle2", timeout: 30000 });
    await sleep(3500);

    const post3DState = await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      const activeRoute = s?.routes?.find(r => r.id === s.lockedRouteId);
      const startPt = activeRoute?.points?.[0];
      const endPt = activeRoute?.points?.[activeRoute.points.length - 1];
      const vessel = s?.vessel;
      const destination = s?.destination;

      const startOffsetNm = (startPt && vessel)
        ? Math.hypot((vessel.lat - startPt.lat) * 60, (vessel.lon - startPt.lon) * 60 * Math.cos(vessel.lat * Math.PI / 180))
        : null;

      const destOffsetNm = (endPt && destination)
        ? Math.hypot((destination.lat - endPt.lat) * 60, (destination.lon - endPt.lon) * 60 * Math.cos(destination.lat * Math.PI / 180))
        : null;

      return {
        vessel,
        destination,
        routeStartPt: startPt,
        routeEndPt: endPt,
        startOffsetNm,
        destOffsetNm,
        isOutOfSync: startOffsetNm !== null && startOffsetNm > 0.1,
      };
    });
    console.log("3D State after navigating to custom route:", post3DState);

  } catch (err) {
    console.error("Test failed:", err);
  } finally {
    await browser.close();
  }
}

run();
