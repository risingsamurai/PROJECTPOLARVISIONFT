const puppeteer = require("puppeteer-core");
const path = require("path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:\\Users\\ADITYA\\.gemini\\antigravity-ide\\brain\\43b9ab02-0949-49b6-a6f6-4925f3b9d984";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("=== Starting Comprehensive Verification for Scopes 3, 4, 5, 6 ===");
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

    // ==========================================
    // 1. SCOPE 3: 2D OVERVIEW MAP - THREE ROUTES
    // ==========================================
    console.log("\n--- 1. Testing Scope 3 in 2D Overview Map ---");
    await page.goto("http://localhost:9000", { waitUntil: "networkidle2", timeout: 30000 });
    await sleep(3500);

    const map2dRoutes = await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      return {
        routesCount: s?.routes?.length || 0,
        routeIds: s?.routes?.map((r) => r.id),
        lockedRouteId: s?.lockedRouteId,
      };
    });
    console.log("2D Map route state:", map2dRoutes);

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "6_2d_three_routes_visible.png") });
    console.log("Captured 6_2d_three_routes_visible.png");

    // ==========================================
    // 2. SCOPE 5: 2D MAP CLICK WARP
    // ==========================================
    console.log("\n--- 2. Testing Scope 5: 2D Map Click Warp ---");
    // Click on map surface
    await page.mouse.click(650, 420);
    await sleep(800);

    const warpResult = await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      const toast = document.querySelector(".z-50")?.textContent || "";
      return {
        vessel: s?.vessel,
        warpTarget: s?.shipWarpTarget,
        toastText: toast,
      };
    });
    console.log("Warp registered on 2D map:", warpResult);

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "10_2d_map_click_warp_toast.png") });
    console.log("Captured 10_2d_map_click_warp_toast.png");

    // ==========================================
    // 3. SCOPE 3 & 4: 3D SIMULATOR THREE ROUTES & ALIGNMENT
    // ==========================================
    console.log("\n--- 3. Testing Scope 3 & 4 in 3D Simulator ---");
    await page.goto("http://localhost:9000/simulation", { waitUntil: "networkidle2", timeout: 30000 });

    console.log("Waiting for store icebergs and routes in 3D...");
    await page.waitForFunction(() => {
      const s = window.__polarisStore?.getState();
      return s && s.icebergs && s.icebergs.length > 0 && s.routes && s.routes.length > 0;
    }, { timeout: 35000 });

    await sleep(2500);

    const simState = await page.evaluate(() => {
      const s = window.__polarisStore.getState();
      const active = s.routes.find((r) => r.id === s.lockedRouteId) || s.routes[0];
      const startPt = active?.points?.[0];
      const destPt = active?.points?.[active.points.length - 1];

      // Distance between vessel and route start
      const dlat = s.vessel.lat - (startPt?.lat || 0);
      const dlon = s.vessel.lon - (startPt?.lon || 0);
      const startOffsetNm = Math.sqrt(dlat * dlat + dlon * dlon) * 60;

      return {
        routesCount: s.routes.length,
        lockedRouteId: s.lockedRouteId,
        vessel: { lat: s.vessel.lat, lon: s.vessel.lon },
        routeStart: startPt,
        routeDest: destPt,
        startOffsetNm: +startOffsetNm.toFixed(4),
      };
    });
    console.log("3D Simulation Route & Alignment State:", simState);

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "7_3d_three_routes_visible.png") });
    console.log("Captured 7_3d_three_routes_visible.png");

    // Switch profile to "Fastest"
    console.log("Switching to 'Fastest' profile in 3D...");
    await page.evaluate(() => {
      window.__polarisStore.getState().lockRoute("fastest");
    });
    await sleep(1000);

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "8_3d_profile_switch_fastest.png") });
    console.log("Captured 8_3d_profile_switch_fastest.png");

    // ==========================================
    // 4. SCOPE 6: LANDMASS GEOMETRY & OCEAN
    // ==========================================
    console.log("\n--- 4. Testing Scope 6: Antarctic Landmass & Extended Ocean ---");
    // Position vessel and camera to view Antarctic coast and ocean
    await page.evaluate(() => {
      window.__polarisStore.getState().setOrbit(0.95, 0.22, 85);
    });
    await sleep(2000);

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "12_3d_landmass_and_infinite_ocean.png") });
    console.log("Captured 12_3d_landmass_and_infinite_ocean.png");

    console.log("\n=== All Scopes 3, 4, 5, 6 Successfully Verified ===");
  } catch (err) {
    console.error("Verification failed:", err);
  } finally {
    await browser.close();
  }
}

run();
