const puppeteer = require("puppeteer-core");
const path = require("path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:\\Users\\ADITYA\\.gemini\\antigravity-ide\\brain\\29cb259c-72d7-4ec7-88e5-b26a2cc8b1da";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("=== COMPREHENSIVE VERIFICATION: THREE ROUTES VISIBILITY & EXACT START/DEST ALIGNMENT ===");

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

  const report = {};

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // =========================================================================
    // PART 1: VERIFY THREE ROUTES VISIBILITY AND COLOR CODING (2D & 3D)
    // =========================================================================
    console.log("\n--- Part 1: Testing 3 Routes Simultaneous Visibility & Colors on 2D Map ---");
    await page.goto("http://localhost:9000", { waitUntil: "networkidle2", timeout: 30000 });
    await sleep(3500);
    for (let i = 0; i < 15; i++) {
      const ready = await page.evaluate(() => {
        const m = window.mapForTesting;
        return !!(m && m.getLayer("route-balanced-layer"));
      });
      if (ready) break;
      await sleep(1000);
    }
    await sleep(1000);

    const check2dLayers = await page.evaluate(() => {
      const map = window.mapForTesting;
      const s = window.__polarisStore?.getState();
      const safestLayer = map.getLayer("route-safest-layer");
      const balancedLayer = map.getLayer("route-balanced-layer");
      const fastestLayer = map.getLayer("route-fastest-layer");
      return {
        routesCount: s?.routes?.length,
        lockedRouteId: s?.lockedRouteId,
        layersExist: {
          safest: !!safestLayer,
          balanced: !!balancedLayer,
          fastest: !!fastestLayer,
        },
        safestColor: safestLayer ? map.getPaintProperty("route-safest-layer", "line-color") : null,
        safestOpacity: safestLayer ? map.getPaintProperty("route-safest-layer", "line-opacity") : null,
        balancedColor: balancedLayer ? map.getPaintProperty("route-balanced-layer", "line-color") : null,
        balancedOpacity: balancedLayer ? map.getPaintProperty("route-balanced-layer", "line-opacity") : null,
        fastestColor: fastestLayer ? map.getPaintProperty("route-fastest-layer", "line-color") : null,
        fastestOpacity: fastestLayer ? map.getPaintProperty("route-fastest-layer", "line-opacity") : null,
      };
    });
    console.log("2D Map Route Layers State:", check2dLayers);
    report.check2dLayers = check2dLayers;

    const screen1Path = path.join(ARTIFACTS_DIR, "15_2d_three_routes_simultaneous.png");
    await page.screenshot({ path: screen1Path });
    console.log("Captured 15_2d_three_routes_simultaneous.png");

    // Check 3D simulator for three routes simultaneous rendering
    console.log("\n--- Part 1b: Testing 3 Routes Simultaneous Visibility in 3D Simulator ---");
    await page.goto("http://localhost:9000/simulation", { waitUntil: "networkidle2", timeout: 30000 });
    await sleep(4000);

    const check3dRoutes = await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      return {
        routesCount: s?.routes?.length,
        lockedRouteId: s?.lockedRouteId,
        routes: s?.routes?.map((r) => ({ id: r.id, name: r.name, pointsCount: r.points?.length })),
      };
    });
    console.log("3D Simulator Routes State:", check3dRoutes);
    report.check3dRoutes = check3dRoutes;

    // Set orbit angle to clearly see the three routes branching and the destination marker
    await page.evaluate(() => {
      window.__polarisStore?.getState().setCameraTargetCoord(null);
      window.__polarisStore?.getState().setOrbit(0.55, 0.40, 75);
    });
    await sleep(1500);

    const screen2Path = path.join(ARTIFACTS_DIR, "16_3d_three_routes_simultaneous.png");
    await page.screenshot({ path: screen2Path });
    console.log("Captured 16_3d_three_routes_simultaneous.png");

    // =========================================================================
    // PART 2: TEST PAIR 1 - Start: [-68.35, -52.45], Dest: [-64.5496, -43.1029]
    // =========================================================================
    console.log("\n--- Part 2: Testing Pair 1 (Peninsula to Weddell Corridor) ---");
    const pair1 = {
      start: [-68.35, -52.45],
      dest: [-64.5496, -43.1029],
    };

    const pair1Result = await page.evaluate(async (p) => {
      const store = window.__polarisStore;
      const routes = await store.getState().fetchRoutesIfNeeded(p.start, p.dest, true);
      const s = store.getState();
      const active = routes.find((r) => r.id === s.lockedRouteId) || routes[0];
      const startPt = active?.points?.[0];
      const endPt = active?.points?.[active.points.length - 1];
      const vessel = s.vessel;
      const destination = s.destination;

      const startDistNm = Math.hypot(
        (vessel.lat - startPt.lat) * 60,
        (vessel.lon - startPt.lon) * 60 * Math.cos((vessel.lat * Math.PI) / 180)
      );

      const destDistNm = Math.hypot(
        (destination.lat - endPt.lat) * 60,
        (destination.lon - endPt.lon) * 60 * Math.cos((destination.lat * Math.PI) / 180)
      );

      return {
        vesselLat: vessel.lat,
        vesselLon: vessel.lon,
        routeStartLat: startPt?.lat,
        routeStartLon: startPt?.lon,
        startDistNm: +startDistNm.toFixed(4),
        destLat: destination.lat,
        destLon: destination.lon,
        routeEndLat: endPt?.lat,
        routeEndLon: endPt?.lon,
        destDistNm: +destDistNm.toFixed(4),
        exactStartMatch: Math.abs(vessel.lat - startPt.lat) < 1e-4 && Math.abs(vessel.lon - startPt.lon) < 1e-4,
        exactDestMatch: Math.abs(destination.lat - endPt.lat) < 1e-4 && Math.abs(destination.lon - endPt.lon) < 1e-4,
      };
    }, pair1);

    console.log("Pair 1 Alignment Metrics:", pair1Result);
    report.pair1Result = pair1Result;

    // Screenshot 17: Close-up behind ship showing zero gap at route start
    await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      s.setCameraTargetCoord(null);
      s.setOrbit(0.0, 0.28, 25);
    });
    await sleep(2000);

    const screen3Path = path.join(ARTIFACTS_DIR, "17_pair1_ship_exact_start_point.png");
    await page.screenshot({ path: screen3Path });
    console.log("Captured 17_pair1_ship_exact_start_point.png");

    // Screenshot 18: Close-up of Destination Beacon showing zero gap at route endpoint
    await page.evaluate((p) => {
      const s = window.__polarisStore?.getState();
      s.setCameraTargetCoord([p.dest[0], p.dest[1]]);
      s.setOrbit(0.35, 0.30, 30);
    }, pair1);
    await sleep(2000);

    const screen4Path = path.join(ARTIFACTS_DIR, "18_pair1_destination_beacon_exact_end.png");
    await page.screenshot({ path: screen4Path });
    console.log("Captured 18_pair1_destination_beacon_exact_end.png");

    // =========================================================================
    // PART 3: TEST PAIR 2 - Start: [-63.65, -54.55], Dest: [-61.50, -50.00]
    // =========================================================================
    console.log("\n--- Part 3: Testing Pair 2 (Northern Weddell Sea to Open Ocean) ---");
    const pair2 = {
      start: [-63.65, -54.55],
      dest: [-61.50, -50.00],
    };

    const pair2Result = await page.evaluate(async (p) => {
      const store = window.__polarisStore;
      const routes = await store.getState().fetchRoutesIfNeeded(p.start, p.dest, true);
      const s = store.getState();
      const active = routes.find((r) => r.id === s.lockedRouteId) || routes[0];
      const startPt = active?.points?.[0];
      const endPt = active?.points?.[active.points.length - 1];
      const vessel = s.vessel;
      const destination = s.destination;

      const startDistNm = Math.hypot(
        (vessel.lat - startPt.lat) * 60,
        (vessel.lon - startPt.lon) * 60 * Math.cos((vessel.lat * Math.PI) / 180)
      );

      const destDistNm = Math.hypot(
        (destination.lat - endPt.lat) * 60,
        (destination.lon - endPt.lon) * 60 * Math.cos((destination.lat * Math.PI) / 180)
      );

      return {
        vesselLat: vessel.lat,
        vesselLon: vessel.lon,
        routeStartLat: startPt?.lat,
        routeStartLon: startPt?.lon,
        startDistNm: +startDistNm.toFixed(4),
        destLat: destination.lat,
        destLon: destination.lon,
        routeEndLat: endPt?.lat,
        routeEndLon: endPt?.lon,
        destDistNm: +destDistNm.toFixed(4),
        exactStartMatch: Math.abs(vessel.lat - startPt.lat) < 1e-4 && Math.abs(vessel.lon - startPt.lon) < 1e-4,
        exactDestMatch: Math.abs(destination.lat - endPt.lat) < 1e-4 && Math.abs(destination.lon - endPt.lon) < 1e-4,
      };
    }, pair2);

    console.log("Pair 2 Alignment Metrics:", pair2Result);
    report.pair2Result = pair2Result;

    // Screenshot 19: Close-up behind ship relocated to Pair 2 start
    await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      s.setCameraTargetCoord(null);
      s.setOrbit(0.0, 0.28, 25);
    });
    await sleep(2000);

    const screen5Path = path.join(ARTIFACTS_DIR, "19_pair2_ship_exact_start_point.png");
    await page.screenshot({ path: screen5Path });
    console.log("Captured 19_pair2_ship_exact_start_point.png");

    // Screenshot 20: Close-up of Destination Beacon at Pair 2 endpoint
    await page.evaluate((p) => {
      const s = window.__polarisStore?.getState();
      s.setCameraTargetCoord([p.dest[0], p.dest[1]]);
      s.setOrbit(0.35, 0.30, 30);
    }, pair2);
    await sleep(2000);

    const screen6Path = path.join(ARTIFACTS_DIR, "20_pair2_destination_beacon_exact_end.png");
    await page.screenshot({ path: screen6Path });
    console.log("Captured 20_pair2_destination_beacon_exact_end.png");

    // Reset camera target coordinate to null for normal operations
    await page.evaluate(() => {
      window.__polarisStore?.getState().setCameraTargetCoord(null);
    });

    console.log("\n=== ALL PAIR VERIFICATIONS COMPLETE ===");
    console.log(JSON.stringify(report, null, 2));
  } catch (err) {
    console.error("Verification script error:", err);
  } finally {
    await browser.close();
  }
}

run();
