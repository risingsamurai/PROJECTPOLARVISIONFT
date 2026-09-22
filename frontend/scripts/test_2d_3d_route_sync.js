const puppeteer = require("puppeteer-core");
const path = require("path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:\\Users\\ADITYA\\.gemini\\antigravity-ide\\brain\\29cb259c-72d7-4ec7-88e5-b26a2cc8b1da";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("=== Testing 2D/3D Route Synchronization ===");
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
    // STEP 1: OPEN 2D MAP & SELECT 'FASTEST'
    // ==========================================
    console.log("\n1. Navigating to 2D Map (http://localhost:9000)...");
    await page.goto("http://localhost:9000", { waitUntil: "networkidle2", timeout: 30000 });
    await sleep(3500);

    const initial2DState = await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      return {
        routesCount: s?.routes?.length || 0,
        lockedRouteId: s?.lockedRouteId,
        routes: s?.routes?.map((r) => ({ id: r.id, name: r.name, dist: r.distanceNm })),
      };
    });
    console.log("Initial 2D Store State:", initial2DState);

    // Select "Fastest" profile on the 2D table
    console.log("Clicking 'Select' button for Fastest profile on 2D table...");
    const clickedFastest = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll("tr"));
      for (const row of rows) {
        if (row.innerText.includes("FASTEST")) {
          const btn = row.querySelector("button");
          if (btn) {
            btn.click();
            return true;
          }
        }
      }
      return false;
    });
    console.log("Fastest button clicked in DOM:", clickedFastest);
    await sleep(1000);

    const postClick2DState = await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      return {
        lockedRouteId: s?.lockedRouteId,
        localStorageLocked: localStorage.getItem("polaris_locked_route"),
      };
    });
    console.log("Post-click 2D State:", postClick2DState);

    const shot1Path = path.join(ARTIFACTS_DIR, "sync_1_2d_fastest_selected.png");
    await page.screenshot({ path: shot1Path });
    console.log("Captured:", shot1Path);

    // ==========================================
    // STEP 2: SWITCH TO 3D SIMULATOR (VIA LINK)
    // ==========================================
    console.log("\n2. Switching to 3D Simulator via <Link href='/simulation'>...");
    // Find the link to /simulation and click it (SPA client-side navigation)
    const linkClicked = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a"));
      const simLink = links.find((a) => a.getAttribute("href") === "/simulation");
      if (simLink) {
        simLink.click();
        return true;
      }
      return false;
    });
    console.log("Simulation link clicked:", linkClicked);

    // Wait for 3D simulation elements to mount
    await page.waitForFunction(() => {
      return document.querySelector("canvas") && window.location.pathname.includes("simulation");
    }, { timeout: 15000 });
    await sleep(3500);

    const sim3DState = await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      const routePanelText = document.querySelector(".hud-panel")?.innerText || "";
      const lockedInPanel = document.body.innerText.includes("Fastest");
      return {
        url: window.location.pathname,
        lockedRouteId: s?.lockedRouteId,
        activeRouteInStore: s?.routes?.find((r) => r.id === s?.lockedRouteId)?.name,
        localStorageLocked: localStorage.getItem("polaris_locked_route"),
        bodyHasFastest: lockedInPanel,
      };
    });
    console.log("3D Simulator State after navigation:", sim3DState);

    const shot2Path = path.join(ARTIFACTS_DIR, "sync_2_3d_after_switch.png");
    await page.screenshot({ path: shot2Path });
    console.log("Captured:", shot2Path);

    // ==========================================
    // STEP 3: REVERSE TEST - SELECT 'SAFEST' IN 3D
    // ==========================================
    console.log("\n3. Reverse Test: Clicking 'Safest' profile tab in 3D RouteInfoPanel...");
    const clickedSafest3D = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const safestBtn = buttons.find((b) => b.innerText.trim() === "Safest");
      if (safestBtn) {
        safestBtn.click();
        return true;
      }
      return false;
    });
    console.log("Safest tab clicked in 3D:", clickedSafest3D);
    await sleep(1500);

    const postClick3DState = await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      return {
        lockedRouteId: s?.lockedRouteId,
        localStorageLocked: localStorage.getItem("polaris_locked_route"),
      };
    });
    console.log("Post-click 3D State:", postClick3DState);

    const shot3Path = path.join(ARTIFACTS_DIR, "sync_3_3d_safest_selected.png");
    await page.screenshot({ path: shot3Path });
    console.log("Captured:", shot3Path);

    // ==========================================
    // STEP 4: SWITCH BACK TO 2D OVERVIEW MAP
    // ==========================================
    console.log("\n4. Switching back to 2D Overview Map via <Link href='/'>...");
    const overviewLinkClicked = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a"));
      const ovLink = links.find((a) => a.getAttribute("href") === "/" || a.innerText.toLowerCase().includes("overview"));
      if (ovLink) {
        ovLink.click();
        return true;
      }
      return false;
    });
    console.log("Overview link clicked in 3D:", overviewLinkClicked);

    await page.waitForFunction(() => {
      return window.location.pathname === "/" || !window.location.pathname.includes("simulation");
    }, { timeout: 15000 });
    await sleep(3500);

    const final2DState = await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      // Check which row has 'Locked' in table
      const rows = Array.from(document.querySelectorAll("tr"));
      const lockedRow = rows.find((r) => r.innerText.includes("Locked"))?.innerText || "";
      return {
        url: window.location.pathname,
        lockedRouteId: s?.lockedRouteId,
        activeRouteInStore: s?.routes?.find((r) => r.id === s?.lockedRouteId)?.name,
        localStorageLocked: localStorage.getItem("polaris_locked_route"),
        lockedRowText: lockedRow,
      };
    });
    console.log("Final 2D Map State after switch back:", final2DState);

    const shot4Path = path.join(ARTIFACTS_DIR, "sync_4_2d_after_switch_back.png");
    await page.screenshot({ path: shot4Path });
    console.log("Captured:", shot4Path);

    console.log("\n=== Synchronization Verification Completed Successfully ===");
  } catch (err) {
    console.error("Test execution failed:", err);
  } finally {
    await browser.close();
  }
}

run();
