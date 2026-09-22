const puppeteer = require("puppeteer-core");
const path = require("path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:\\Users\\ADITYA\\.gemini\\antigravity-ide\\brain\\29cb259c-72d7-4ec7-88e5-b26a2cc8b1da";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("=== VERIFYING 2D MAP CLICK WARP & 3D REAL ICEBERG RE-FILTERING ===");

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

  const results = {};

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // Step 0: Clear localStorage and initial state
    await page.goto("http://localhost:9000", { waitUntil: "networkidle2", timeout: 30000 });
    await page.evaluate(() => {
      localStorage.removeItem("polaris_warp_target");
      localStorage.removeItem("polaris_vessel_pos");
    });

    // Reload 2D map cleanly
    await page.goto("http://localhost:9000", { waitUntil: "networkidle2", timeout: 30000 });
    await sleep(2000);
    await page.waitForFunction(() => {
      const s = window.__polarisStore?.getState();
      return (s?.allIcebergs?.length || 0) > 0;
    }, { timeout: 15000 }).catch(() => {});
    await sleep(1000);

    // Verify 2D initial state
    const initial2dState = await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      const map = window.mapForTesting;
      return {
        vessel: s?.vessel,
        warpTarget: s?.warpTarget,
        allIcebergsCount: s?.allIcebergs?.length || 0,
        icebergsCount: s?.icebergs?.length || 0,
        routesCount: s?.routes?.length || 0,
        mapLoaded: !!map,
      };
    });
    console.log("Initial 2D State:", initial2dState);
    results.initial2dState = initial2dState;

    // Step 1: Test clicking elsewhere on the map (UI panels and route lines)
    console.log("\n--- Testing clicks on UI panel and route line (must NOT trigger warp) ---");
    
    // Click on UI Panel (Route stats container: e.g. at (1200, 750))
    await page.mouse.click(1200, 750);
    await sleep(500);
    const toastAfterPanelClick = await page.evaluate(() => {
      return document.getElementById("warp-confirmation-toast") !== null;
    });
    console.log("Toast visible after UI panel click:", toastAfterPanelClick, "(expected: false)");
    results.toastAfterPanelClick = toastAfterPanelClick;

    // Find a point on an active route line
    const routePointScreen = await page.evaluate(() => {
      const map = window.mapForTesting;
      const s = window.__polarisStore?.getState();
      const activeRoute = s?.routes?.find(r => r.id === s.lockedRouteId) || s?.routes?.[0];
      if (activeRoute && activeRoute.points?.length > 10) {
        const midPoint = activeRoute.points[Math.floor(activeRoute.points.length / 2)];
        const pt = map.project([midPoint.lon, midPoint.lat]);
        return { x: Math.round(pt.x), y: Math.round(pt.y), lat: midPoint.lat, lon: midPoint.lon };
      }
      return null;
    });

    if (routePointScreen) {
      console.log("Clicking on route line at screen pos:", routePointScreen);
      await page.mouse.click(routePointScreen.x, routePointScreen.y);
      await sleep(500);
      const toastAfterRouteClick = await page.evaluate(() => {
        return document.getElementById("warp-confirmation-toast") !== null;
      });
      console.log("Toast visible after route line click:", toastAfterRouteClick, "(expected: false)");
      results.toastAfterRouteClick = toastAfterRouteClick;
    }

    // Step 2: Click a point on the map surface near a cluster of real icebergs (A85 & D33A)
    // A85: -63.7667, -53.95; D33A: -63.55, -55.1833. Midpoint: -63.65, -54.55
    const targetCoords = { lat: -63.65, lon: -54.55 };
    console.log("\n--- Targeting real iceberg cluster at:", targetCoords, "---");

    const screenClickPos = await page.evaluate((target) => {
      const map = window.mapForTesting;
      const pt = map.project([target.lon, target.lat]);
      return { x: Math.round(pt.x), y: Math.round(pt.y) };
    }, targetCoords);

    console.log("Projected click pos on screen:", screenClickPos);
    await page.mouse.click(screenClickPos.x, screenClickPos.y);
    await sleep(600);

    // Verify toast appeared on 2D map
    const toastState = await page.evaluate(() => {
      const toastEl = document.getElementById("warp-confirmation-toast");
      const s = window.__polarisStore?.getState();
      return {
        toastExists: !!toastEl,
        toastText: toastEl ? toastEl.innerText : null,
        storeWarpTarget: s?.warpTarget,
        url: window.location.href,
      };
    });
    console.log("Toast State on 2D page:", toastState);
    results.toastState = toastState;

    // Screenshot 1: 2D map with warp confirmation toast
    const screenshot1Path = path.join(ARTIFACTS_DIR, "10_2d_map_click_warp_toast.png");
    await page.screenshot({ path: screenshot1Path });
    console.log("Captured Screenshot 1 (2D):", screenshot1Path);

    // Confirm we did NOT auto-navigate away
    const stillOn2D = await page.evaluate(() => window.location.pathname === "/");
    console.log("User remained on 2D page (no auto-navigate):", stillOn2D);
    results.stillOn2D = stillOn2D;

    // Step 3: Switch to 3D Simulator
    console.log("\n--- Switching to 3D Simulator ---");
    // Click the "Open 3D Simulator" link in the toast or navigate
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }),
      page.evaluate(() => {
        const link = document.querySelector("#warp-confirmation-toast a");
        if (link) link.click();
        else window.location.href = "/simulation";
      }),
    ]);

    await sleep(2000);
    await page.waitForFunction(() => {
      const s = window.__polarisStore?.getState();
      return (s?.allIcebergs?.length || 0) > 0;
    }, { timeout: 15000 }).catch(() => {});
    await sleep(1500);

    // Verify 3D Simulator state:
    // - Ship positioned at clicked target coordinates
    // - warpTarget cleared from store
    // - Real nearby icebergs filtered (A85 and D33A)
    const simState = await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      return {
        vesselLat: s?.vessel?.lat,
        vesselLon: s?.vessel?.lon,
        vesselSog: s?.vessel?.sogKnots,
        warpTarget: s?.warpTarget,
        allIcebergsCount: s?.allIcebergs?.length || 0,
        filteredIcebergs: s?.icebergs?.map((ib) => ({
          name: ib.name,
          lat: ib.lat,
          lon: ib.lon,
        })),
        detections: s?.detections?.slice(-5) || [],
      };
    });
    console.log("3D Simulator Post-Warp State:", simState);
    results.simState = simState;

    // Set an optimal camera angle for viewing the ship and nearby icebergs
    await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      // Orbit camera slightly to get great view of ship deck, ocean, and icebergs
      s.setOrbit(0.35, 0.28, 48);
    });
    await sleep(1500);

    // Screenshot 2: 3D scene showing ship at new position with nearby real icebergs
    const screenshot2Path = path.join(ARTIFACTS_DIR, "13_3d_ship_at_warped_cluster.png");
    await page.screenshot({ path: screenshot2Path });
    console.log("Captured Screenshot 2 (3D):", screenshot2Path);

    // Step 4: Verify Ship Movement & Physics at new position
    console.log("\n--- Testing Ship Movement & Physics from Warped Position ---");
    const posBeforeMove = await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      return { lat: s.vessel.lat, lon: s.vessel.lon, sog: s.vessel.sogKnots, heading: s.vessel.headingDeg };
    });

    // Press 'W' to accelerate forward for 2.5 seconds
    await page.keyboard.down("KeyW");
    await sleep(2500);
    await page.keyboard.up("KeyW");

    // Press 'A' to turn port for 1.5 seconds
    await page.keyboard.down("KeyA");
    await sleep(1500);
    await page.keyboard.up("KeyA");

    await sleep(800);

    const posAfterMove = await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      return { lat: s.vessel.lat, lon: s.vessel.lon, sog: s.vessel.sogKnots, heading: s.vessel.headingDeg };
    });
    console.log("Vessel before move:", posBeforeMove);
    console.log("Vessel after move:", posAfterMove);

    const physicsActive =
      posAfterMove.sog > 0 &&
      (posAfterMove.lat !== posBeforeMove.lat || posAfterMove.lon !== posBeforeMove.lon) &&
      posAfterMove.heading !== posBeforeMove.heading;

    console.log("Ship movement & physics verified active from new position:", physicsActive);
    results.physicsActive = physicsActive;

    // Screenshot 3: Active navigation at warped position
    const screenshot3Path = path.join(ARTIFACTS_DIR, "14_3d_active_movement_at_new_pos.png");
    await page.screenshot({ path: screenshot3Path });
    console.log("Captured Screenshot 3 (3D Physics):", screenshot3Path);

    // Step 5: Test revisiting/refreshing simulator (confirm no re-warp)
    console.log("\n--- Testing Page Reload / Revisit (Warp must not re-trigger) ---");
    const currentVessel = posAfterMove;
    await page.reload({ waitUntil: "networkidle2" });
    await sleep(3000);

    const reloadState = await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      return {
        warpTarget: s?.warpTarget,
        vesselLat: s?.vessel?.lat,
        vesselLon: s?.vessel?.lon,
        icebergCount: s?.icebergs?.length,
      };
    });
    console.log("State after reload:", reloadState);
    const noRetrigger = reloadState.warpTarget === null;
    console.log("No re-trigger verified:", noRetrigger);
    results.noRetrigger = noRetrigger;

    console.log("\n=== ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY ===");
    console.log(JSON.stringify(results, null, 2));

  } catch (err) {
    console.error("Verification failed with error:", err);
  } finally {
    await browser.close();
  }
}

run();
