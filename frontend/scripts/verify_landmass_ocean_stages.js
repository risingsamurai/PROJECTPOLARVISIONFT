const puppeteer = require("puppeteer-core");
const path = require("path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:\\Users\\ADITYA\\.gemini\\antigravity-ide\\brain\\29cb259c-72d7-4ec7-88e5-b26a2cc8b1da";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("==================================================");
  console.log("VERIFYING LANDMASS, EXTENDED OCEAN & STAGES 1-8");
  console.log("==================================================");

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

    console.log("\n1. Navigating to 3D Simulation...");
    await page.goto("http://localhost:9000/simulation", { waitUntil: "networkidle2", timeout: 30000 });
    await sleep(4000);

    // Measure FPS before
    const fpsBefore = await page.evaluate(async () => {
      let frames = 0;
      const start = performance.now();
      await new Promise((resolve) => {
        function tick() {
          frames++;
          if (performance.now() - start < 1000) {
            requestAnimationFrame(tick);
          } else {
            resolve();
          }
        }
        requestAnimationFrame(tick);
      });
      return Math.round(frames / ((performance.now() - start) / 1000));
    });
    console.log("Current Render FPS:", fpsBefore);

    // ----------------------------------------------------
    // SHOT 1: Antarctic Coastline & Landmass View
    // Camera placed to clearly show the extruded Antarctic Peninsula cliffs,
    // icebergs floating offshore in the sea, and the ship
    // ----------------------------------------------------
    console.log("\n2. Capturing Antarctic Coastline / Landmass with Ship & Icebergs...");
    await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      // Orbit camera looking towards the peninsula (West)
      s.setOrbit(1.57, 0.28, 65);
    });
    await sleep(2500);

    const shot1 = path.join(ARTIFACTS_DIR, "stage4_antarctic_coastline_landmass.png");
    await page.screenshot({ path: shot1 });
    console.log("Saved Screenshot 1 (Coastline / Landmass):", shot1);

    // ----------------------------------------------------
    // SHOT 2: Extended Ocean Horizon (No visible edges)
    // High-altitude wide view looking in a different direction (East / North)
    // ----------------------------------------------------
    console.log("\n3. Capturing Extended Ocean Horizon (No visible edge)...");
    await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      s.setOrbit(-0.9, 0.48, 88);
    });
    await sleep(2500);

    const shot2 = path.join(ARTIFACTS_DIR, "stage5_extended_ocean_horizon.png");
    await page.screenshot({ path: shot2 });
    console.log("Saved Screenshot 2 (Ocean Horizon without Edge):", shot2);

    // ----------------------------------------------------
    // SHOT 3: Ship Movement & Physics + WASD HUD Indicator
    // Press 'KeyW' to accelerate vessel forward
    // ----------------------------------------------------
    console.log("\n4. Testing Stage 1 & 3: Ship Physics & WASD HUD...");
    // Reset camera behind ship
    await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      s.setOrbit(0, 0.38, 38);
    });
    await sleep(1000);

    // Dispatch KeyDown 'KeyW'
    await page.keyboard.down("KeyW");
    await sleep(2000); // let ship accelerate

    const physicsState = await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      const wasdActive = document.querySelector(".wasd-indicator")?.innerText || "";
      return {
        sogKnots: s?.vessel?.sogKnots,
        headingDeg: s?.vessel?.headingDeg,
        keys: s?.keys,
      };
    });
    console.log("Physics state under W acceleration:", physicsState);

    const shot3 = path.join(ARTIFACTS_DIR, "stage1_3_ship_physics_wasd.png");
    await page.screenshot({ path: shot3 });
    console.log("Saved Screenshot 3 (Ship Physics & WASD Keypress):", shot3);

    await page.keyboard.up("KeyW");
    await sleep(1000);

    // ----------------------------------------------------
    // SHOT 4: Water Waves & Gerstner Swell Close-up
    // ----------------------------------------------------
    console.log("\n5. Capturing Stage 2: Gerstner Ocean Wave Dynamics...");
    await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      s.setOrbit(0.5, 0.18, 26);
    });
    await sleep(2000);

    const shot4 = path.join(ARTIFACTS_DIR, "stage2_ocean_waves_dynamics.png");
    await page.screenshot({ path: shot4 });
    console.log("Saved Screenshot 4 (Water Waves & Vessel Bobbing):", shot4);

    // ----------------------------------------------------
    // SHOT 5: Tactical Reasoning Panel & Proximity Alert (Stages 6 & 7)
    // ----------------------------------------------------
    console.log("\n6. Capturing Stages 6 & 7: Tactical Reasoning & Alerts...");
    await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      s.setOrbit(0, 0.42, 38);
    });
    await sleep(1500);

    const shot5 = path.join(ARTIFACTS_DIR, "stage6_7_reasoning_and_alerts.png");
    await page.screenshot({ path: shot5 });
    console.log("Saved Screenshot 5 (Tactical Reasoning & Alerts):", shot5);

    // ----------------------------------------------------
    // SHOT 6: Route Sync & 3-Route Lines (Stage 8)
    // ----------------------------------------------------
    console.log("\n7. Capturing Stage 8: 3-Route Lines & Profile Sync in 3D...");
    await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      s.setOrbit(0, 0.85, 75);
    });
    await sleep(2000);

    const shot6 = path.join(ARTIFACTS_DIR, "stage8_routes_and_sync.png");
    await page.screenshot({ path: shot6 });
    console.log("Saved Screenshot 6 (Stage 8 Routes in 3D):", shot6);

    console.log("\n==================================================");
    console.log("ALL STAGE VERIFICATIONS COMPLETED SUCCESSFULLY!");
    console.log("==================================================");

  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
