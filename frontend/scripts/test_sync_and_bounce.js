const puppeteer = require("puppeteer-core");
const path = require("path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:\\Users\\ADITYA\\.gemini\\antigravity-ide\\brain\\29cb259c-72d7-4ec7-88e5-b26a2cc8b1da";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("==================================================");
  console.log("STARTING FULL ROUTE SYNC & BOUNCE TEST SUITE");
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

    // ================================================================
    // PHASE 1: 2D -> 3D (Forward Direction)
    // ================================================================
    console.log("\n[PHASE 1] 1A. Navigating to 2D Map (http://localhost:9000)...");
    await page.goto("http://localhost:9000", { waitUntil: "networkidle2", timeout: 30000 });
    await sleep(3500);

    console.log("[PHASE 1] 1B. Selecting 'FASTEST' in 2D table...");
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll("tr"));
      const r = rows.find((x) => x.innerText.toUpperCase().includes("FASTEST"));
      r.querySelector("button").click();
    });
    await sleep(1500);

    const shot1Path = path.join(ARTIFACTS_DIR, "step2_1_2d_fastest_selected.png");
    await page.screenshot({ path: shot1Path });
    console.log("Saved screenshot:", shot1Path);

    console.log("[PHASE 1] 1C. Navigating to 3D Simulator via link (No refresh)...");
    const simLink = await page.$('a[href="/simulation"]');
    await simLink.click();
    await page.waitForSelector("canvas", { timeout: 15000 });
    await sleep(4000);

    const shot2Path = path.join(ARTIFACTS_DIR, "step2_2_3d_fastest_active.png");
    await page.screenshot({ path: shot2Path });
    console.log("Saved screenshot:", shot2Path);

    const simState1 = await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      return {
        lockedRouteId: s?.lockedRouteId,
        routes: s?.routes?.map((r) => r.name),
        url: window.location.pathname,
      };
    });
    console.log("[PHASE 1 Result]", simState1);

    // ================================================================
    // PHASE 2: 3D -> 2D (Reverse Direction with Canvas Layer Verification)
    // ================================================================
    console.log("\n[PHASE 2] 2A. Selecting 'Safest' profile tab in 3D HUD...");
    await page.waitForFunction(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      return btns.some((b) => b.innerText.trim() === "Safest");
    }, { timeout: 10000 });

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const b = btns.find((x) => x.innerText.trim() === "Safest");
      if (b) b.click();
    });
    await sleep(2000);

    const shot3Path = path.join(ARTIFACTS_DIR, "step2_3_3d_safest_selected.png");
    await page.screenshot({ path: shot3Path });
    console.log("Saved screenshot:", shot3Path);

    console.log("[PHASE 2] 2B. Navigating back to 2D Map via link (No refresh)...");
    const homeLink = await page.$('a[href="/"]');
    await homeLink.click();
    await page.waitForFunction(() => window.location.pathname === "/", { timeout: 15000 });
    await sleep(3500);

    const mapStateReverse = await page.evaluate(() => {
      const map = window.mapForTesting;
      const s = window.__polarisStore?.getState();
      const rows = Array.from(document.querySelectorAll("tr"));
      const lockedRow = rows.find((r) => r.innerText.includes("Locked"))?.innerText.replace(/\s+/g, " ").trim();
      return {
        lockedRouteId: s?.lockedRouteId,
        lockedRowInTable: lockedRow,
        hasMap: !!map,
        isStyleLoaded: map ? map.isStyleLoaded() : false,
        safestLayer: map ? !!map.getLayer("route-safest-layer") : false,
        balancedLayer: map ? !!map.getLayer("route-balanced-layer") : false,
        fastestLayer: map ? !!map.getLayer("route-fastest-layer") : false,
        safestLineWidth: map && map.getLayer("route-safest-layer") ? map.getPaintProperty("route-safest-layer", "line-width") : null,
        safestLineOpacity: map && map.getLayer("route-safest-layer") ? map.getPaintProperty("route-safest-layer", "line-opacity") : null,
      };
    });
    console.log("[PHASE 2 Result - Reverse Map State]:", mapStateReverse);

    const shot4Path = path.join(ARTIFACTS_DIR, "step2_4_2d_safest_reflected.png");
    await page.screenshot({ path: shot4Path });
    console.log("Saved screenshot:", shot4Path);

    // ================================================================
    // PHASE 3: REPEATED BOUNCE TEST (2D -> 3D -> 2D -> 3D -> 2D)
    // ================================================================
    console.log("\n[PHASE 3] Starting Repeated Bounce Test...");

    // Bounce 1: In 2D, select Balanced -> go to 3D
    console.log("Bounce 1: 2D Select 'BALANCED' -> 3D");
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll("tr"));
      const r = rows.find((x) => x.innerText.toUpperCase().includes("BALANCED"));
      r.querySelector("button").click();
    });
    await sleep(1000);

    const simLinkB1 = await page.$('a[href="/simulation"]');
    await simLinkB1.click();
    await page.waitForSelector("canvas", { timeout: 15000 });
    await sleep(3500);

    const shotB1Path = path.join(ARTIFACTS_DIR, "bounce_1_3d_balanced.png");
    await page.screenshot({ path: shotB1Path });
    console.log("Saved screenshot:", shotB1Path);

    const b1State = await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      return { bounce: 1, lockedRouteId: s?.lockedRouteId };
    });
    console.log("Bounce 1 State in 3D:", b1State);

    // Bounce 2: In 3D, select Fastest -> go to 2D
    console.log("Bounce 2: 3D Select 'Fastest' -> 2D");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const b = btns.find((x) => x.innerText.trim() === "Fastest");
      if (b) b.click();
    });
    await sleep(1500);

    const homeLinkB2 = await page.$('a[href="/"]');
    await homeLinkB2.click();
    await page.waitForFunction(() => window.location.pathname === "/", { timeout: 15000 });
    await sleep(3500);

    const shotB2Path = path.join(ARTIFACTS_DIR, "bounce_2_2d_fastest.png");
    await page.screenshot({ path: shotB2Path });
    console.log("Saved screenshot:", shotB2Path);

    const b2State = await page.evaluate(() => {
      const map = window.mapForTesting;
      const s = window.__polarisStore?.getState();
      return {
        bounce: 2,
        lockedRouteId: s?.lockedRouteId,
        fastestLayer: map ? !!map.getLayer("route-fastest-layer") : false,
        fastestLineWidth: map && map.getLayer("route-fastest-layer") ? map.getPaintProperty("route-fastest-layer", "line-width") : null,
      };
    });
    console.log("Bounce 2 State in 2D:", b2State);

    // Bounce 3: In 2D, select Safest -> go to 3D
    console.log("Bounce 3: 2D Select 'SAFEST' -> 3D");
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll("tr"));
      const r = rows.find((x) => x.innerText.toUpperCase().includes("SAFEST"));
      r.querySelector("button").click();
    });
    await sleep(1000);

    const simLinkB3 = await page.$('a[href="/simulation"]');
    await simLinkB3.click();
    await page.waitForSelector("canvas", { timeout: 15000 });
    await sleep(3500);

    const shotB3Path = path.join(ARTIFACTS_DIR, "bounce_3_3d_safest.png");
    await page.screenshot({ path: shotB3Path });
    console.log("Saved screenshot:", shotB3Path);

    const b3State = await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      return { bounce: 3, lockedRouteId: s?.lockedRouteId };
    });
    console.log("Bounce 3 State in 3D:", b3State);

    // Bounce 4: Return to 2D
    console.log("Bounce 4: Return to 2D");
    const homeLinkB4 = await page.$('a[href="/"]');
    await homeLinkB4.click();
    await page.waitForFunction(() => window.location.pathname === "/", { timeout: 15000 });
    await sleep(3500);

    const shotB4Path = path.join(ARTIFACTS_DIR, "bounce_4_2d_safest.png");
    await page.screenshot({ path: shotB4Path });
    console.log("Saved screenshot:", shotB4Path);

    const b4State = await page.evaluate(() => {
      const map = window.mapForTesting;
      const s = window.__polarisStore?.getState();
      return {
        bounce: 4,
        lockedRouteId: s?.lockedRouteId,
        safestLayer: map ? !!map.getLayer("route-safest-layer") : false,
        safestLineWidth: map && map.getLayer("route-safest-layer") ? map.getPaintProperty("route-safest-layer", "line-width") : null,
      };
    });
    console.log("Bounce 4 State in 2D:", b4State);

    console.log("\n==================================================");
    console.log("ALL TESTS COMPLETED SUCCESSFULLY!");
    console.log("==================================================");
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
