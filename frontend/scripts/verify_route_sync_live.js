const puppeteer = require("puppeteer-core");
const path = require("path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:\\Users\\ADITYA\\.gemini\\antigravity-ide\\brain\\29cb259c-72d7-4ec7-88e5-b26a2cc8b1da";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifySync() {
  console.log("==================================================");
  console.log("STARTING 2D/3D ROUTE SYNC LIVE FUNCTIONAL TEST");
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

    page.on("console", (msg) => {
      const txt = msg.text();
      if (txt.includes("route") || txt.includes("Route") || txt.includes("API")) {
        console.log("  [Browser Console]", txt);
      }
    });

    // ----------------------------------------------------
    // TEST 1: Open 2D Map (http://localhost:9000)
    // ----------------------------------------------------
    console.log("\n>>> STEP 1A: Navigating to 2D Map (http://localhost:9000)...");
    await page.goto("http://localhost:9000", { waitUntil: "networkidle2", timeout: 30000 });
    await sleep(3000);

    const initial2D = await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      return {
        url: window.location.pathname,
        lockedRouteId: s?.lockedRouteId,
        routesCount: s?.routes?.length || 0,
        routes: s?.routes?.map((r) => ({ id: r.id, name: r.name, dist: r.distanceNm })),
      };
    });
    console.log("Initial 2D Store State:", JSON.stringify(initial2D, null, 2));

    // Select "Fastest" profile on the 2D table
    console.log("\n>>> STEP 1B: Selecting 'FASTEST' route in 2D table...");
    const clickedFastest = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll("tr"));
      for (const row of rows) {
        if (row.innerText.toUpperCase().includes("FASTEST")) {
          const btn = row.querySelector("button");
          if (btn) {
            btn.click();
            return true;
          }
        }
      }
      return false;
    });
    console.log("Clicked Fastest button in 2D:", clickedFastest);
    await sleep(1500);

    const postSelect2D = await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      const rows = Array.from(document.querySelectorAll("tr"));
      const tableStatus = rows.map((r) => {
        const text = r.innerText.replace(/\s+/g, " ").trim();
        return text;
      }).filter((t) => t.includes("SAFEST") || t.includes("BALANCED") || t.includes("FASTEST"));
      return {
        lockedRouteId: s?.lockedRouteId,
        localStorageLocked: localStorage.getItem("polaris_locked_route"),
        tableRows: tableStatus,
      };
    });
    console.log("2D State after selecting Fastest:", JSON.stringify(postSelect2D, null, 2));

    const shot1 = path.join(ARTIFACTS_DIR, "step1_2d_fastest_selected.png");
    await page.screenshot({ path: shot1 });
    console.log("SAVED SCREENSHOT 1 (2D with Fastest Selected):", shot1);

    // ----------------------------------------------------
    // TEST 2: Switch to 3D Simulator WITHOUT Refreshing
    // ----------------------------------------------------
    console.log("\n>>> STEP 2A: Switching to 3D Simulator via link (No refresh)...");
    const navLink = await page.$('a[href="/simulation"]');
    if (!navLink) {
      throw new Error("Could not find <a href='/simulation'> on page!");
    }
    await navLink.click();
    console.log("Clicked 'Launch 3D Simulator' link.");

    // Wait for canvas and 3D HUD to appear
    await page.waitForSelector("canvas", { timeout: 15000 });
    await sleep(4000); // allow WebGL scene & HUD to fully mount and render

    const sim3D = await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      const hudPanels = Array.from(document.querySelectorAll(".hud-panel"));
      const navPlanPanel = hudPanels.find((p) => p.innerText.includes("NAVIGATION PLAN"));
      const navPlanText = navPlanPanel ? navPlanPanel.innerText.replace(/\s+/g, " ") : "NOT FOUND";
      
      // Check which tab is active in RouteInfoPanel
      const buttons = Array.from(navPlanPanel ? navPlanPanel.querySelectorAll("button") : []);
      const activeTab = buttons.find((b) => b.className.includes("border-rose") || b.className.includes("border-amber") || b.className.includes("border-emerald"));

      return {
        url: window.location.pathname,
        lockedRouteId: s?.lockedRouteId,
        activeRouteInStore: s?.routes?.find((r) => r.id === s?.lockedRouteId)?.name,
        localStorageLocked: localStorage.getItem("polaris_locked_route"),
        navPlanTextSnippet: navPlanText,
        activeTabLabel: activeTab ? activeTab.innerText : "none",
        canvasExists: !!document.querySelector("canvas"),
      };
    });
    console.log("3D Simulator State after navigation from 2D:", JSON.stringify(sim3D, null, 2));

    const shot2 = path.join(ARTIFACTS_DIR, "step1_3d_fastest_rendered.png");
    await page.screenshot({ path: shot2 });
    console.log("SAVED SCREENSHOT 2 (3D showing Fastest Active):", shot2);

    // ----------------------------------------------------
    // TEST 3: Reverse Test - Select "Safest" in 3D
    // ----------------------------------------------------
    console.log("\n>>> STEP 3A: Selecting 'Safest' profile tab in 3D HUD panel...");
    const clickedSafest3D = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const safestBtn = buttons.find((b) => b.innerText.trim() === "Safest");
      if (safestBtn) {
        safestBtn.click();
        return true;
      }
      return false;
    });
    console.log("Clicked Safest tab in 3D HUD:", clickedSafest3D);
    await sleep(2000);

    const postSelect3D = await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      const hudPanels = Array.from(document.querySelectorAll(".hud-panel"));
      const navPlanPanel = hudPanels.find((p) => p.innerText.includes("NAVIGATION PLAN"));
      const navPlanText = navPlanPanel ? navPlanPanel.innerText.replace(/\s+/g, " ") : "NOT FOUND";
      return {
        lockedRouteId: s?.lockedRouteId,
        localStorageLocked: localStorage.getItem("polaris_locked_route"),
        navPlanTextSnippet: navPlanText,
      };
    });
    console.log("3D State after selecting Safest in 3D:", JSON.stringify(postSelect3D, null, 2));

    const shot3 = path.join(ARTIFACTS_DIR, "step1_3d_safest_selected.png");
    await page.screenshot({ path: shot3 });
    console.log("SAVED SCREENSHOT 3 (3D with Safest Selected):", shot3);

    // ----------------------------------------------------
    // TEST 4: Switch Back to 2D Map WITHOUT Refreshing
    // ----------------------------------------------------
    console.log("\n>>> STEP 4A: Switching back to 2D Overview Map via link (No refresh)...");
    const overviewLink = await page.$('a[href="/"]');
    if (!overviewLink) {
      throw new Error("Could not find <a href='/'> Overview link in 3D simulator!");
    }
    await overviewLink.click();
    console.log("Clicked 'Overview map' link.");

    // Wait for 2D map container
    await page.waitForFunction(() => window.location.pathname === "/", { timeout: 15000 });
    await sleep(4000);

    const final2D = await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      const rows = Array.from(document.querySelectorAll("tr"));
      const tableStatus = rows.map((r) => {
        return r.innerText.replace(/\s+/g, " ").trim();
      }).filter((t) => t.includes("SAFEST") || t.includes("BALANCED") || t.includes("FASTEST"));

      // Check which button has "Locked"
      const lockedRow = rows.find((r) => r.innerText.includes("Locked"))?.innerText.replace(/\s+/g, " ").trim();

      return {
        url: window.location.pathname,
        lockedRouteId: s?.lockedRouteId,
        activeRouteInStore: s?.routes?.find((r) => r.id === s?.lockedRouteId)?.name,
        localStorageLocked: localStorage.getItem("polaris_locked_route"),
        tableRows: tableStatus,
        rowWithLockedBadge: lockedRow,
      };
    });
    console.log("Final 2D Map State after switch back from 3D:", JSON.stringify(final2D, null, 2));

    const shot4 = path.join(ARTIFACTS_DIR, "step1_2d_safest_reflected.png");
    await page.screenshot({ path: shot4 });
    console.log("SAVED SCREENSHOT 4 (2D showing Safest Locked):", shot4);

    console.log("\n==================================================");
    console.log("VERIFICATION TEST COMPLETED!");
    console.log("==================================================");

    return {
      step1: postSelect2D,
      step2: sim3D,
      step3: postSelect3D,
      step4: final2D,
    };
  } finally {
    await browser.close();
  }
}

verifySync()
  .then((res) => {
    console.log("RESULT SUMMARY:", JSON.stringify(res, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error("FATAL ERROR:", err);
    process.exit(1);
  });
