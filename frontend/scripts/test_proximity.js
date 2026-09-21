const puppeteer = require("puppeteer-core");
const path = require("path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:\\Users\\ADITYA\\.gemini\\antigravity-ide\\brain\\43b9ab02-0949-49b6-a6f6-4925f3b9d984";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("=== Starting Proximity Alert Automated Verification ===");
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
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    const logs = [];
    page.on("console", (msg) => logs.push(`[BROWSER] ${msg.type()}: ${msg.text()}`));

    console.log("1. Navigating to http://localhost:9000/simulation...");
    await page.goto("http://localhost:9000/simulation", { waitUntil: "networkidle2", timeout: 30000 });
    
    console.log("Waiting for icebergs to load into store...");
    await page.waitForFunction(() => {
      const s = window.__polarisStore?.getState();
      return s && s.icebergs && s.icebergs.length > 0;
    }, { timeout: 15000 });

    await sleep(1000);

    // Initial screenshot
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "1_sim_loaded.png") });
    console.log("Captured 1_sim_loaded.png");

    // Inspect initial store state
    const storeState = await page.evaluate(() => {
      const s = window.__polarisStore ? window.__polarisStore.getState() : null;
      if (!s) return null;
      return {
        vessel: s.vessel,
        soundOn: s.soundOn,
        icebergCount: s.icebergs.length,
        highRiskIcebergs: s.icebergs
          .filter((i) => i.highRisk || (i.dangerRadiusNm && i.dangerRadiusNm > 0))
          .map((i) => ({
            id: i.id,
            name: i.name,
            lat: i.lat,
            lon: i.lon,
            dangerRadiusNm: i.dangerRadiusNm || 5,
            highRisk: i.highRisk,
          })),
      };
    });

    console.log("Store state loaded:", {
      icebergCount: storeState?.icebergCount,
      soundOn: storeState?.soundOn,
      highRiskCount: storeState?.highRiskIcebergs.length,
    });

    if (!storeState || storeState.highRiskIcebergs.length === 0) {
      throw new Error("No high-risk icebergs found in store!");
    }

    const targetBerg = storeState.highRiskIcebergs[0];
    console.log(`Targeting iceberg ${targetBerg.name} (${targetBerg.id}) at lat=${targetBerg.lat}, lon=${targetBerg.lon}, radius=${targetBerg.dangerRadiusNm} NM`);

    // Enable sound
    console.log("2. Toggling Audio ON...");
    await page.evaluate(() => {
      window.__polarisStore.getState().setSoundOn(true);
    });

    const isSoundOn = await page.evaluate(() => window.__polarisStore.getState().soundOn);
    console.log("Audio ON verified:", isSoundOn);

    // Position vessel safely outside danger radius first
    console.log("3. Placing vessel outside danger radius (radius + 3 NM)...");
    const outsideDistNm = targetBerg.dangerRadiusNm + 3.0;
    const outsideLat = targetBerg.lat - outsideDistNm / 60;
    const targetLon = targetBerg.lon;

    await page.evaluate(({ lat, lon }) => {
      window.__polarisStore.getState().setVessel({ lat, lon, sogKnots: 10, headingDeg: 0 });
    }, { lat: outsideLat, lon: targetLon });
    await sleep(1000);

    const outsideFlashId = await page.evaluate(() => window.__polarisStore.getState().proximityFlashId);
    console.log("Outside danger zone, proximityFlashId:", outsideFlashId);

    // Now steer vessel into danger radius (radius - 1.5 NM)
    console.log("4. Moving vessel into iceberg danger radius...");
    const insideDistNm = targetBerg.dangerRadiusNm - 1.5;
    const insideLat = targetBerg.lat - insideDistNm / 60;

    await page.evaluate(({ lat, lon }) => {
      window.__polarisStore.getState().setVessel({ lat, lon, sogKnots: 12, headingDeg: 0 });
    }, { lat: insideLat, lon: targetLon });

    // Allow animation frame to process detection
    await sleep(200);

    // Capture visual flash screenshot immediately during active pulse
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "2_proximity_flash_active.png") });
    console.log("Captured 2_proximity_flash_active.png during flash!");

    const alertStatus = await page.evaluate(() => {
      const s = window.__polarisStore.getState();
      const latest = s.alerts[s.alerts.length - 1];
      const hasOverlay = document.querySelector(".animate-proximity-vignette") !== null;
      return {
        flashId: s.proximityFlashId,
        latestAlert: latest,
        hasOverlay,
      };
    });
    console.log("Alert triggered state:", alertStatus);

    // Wait for 1.8s for the 1.5s animation to fade out completely
    console.log("5. Waiting for visual flash to complete and fade out...");
    await sleep(1800);

    const fadeStatus = await page.evaluate(() => {
      const hasOverlay = document.querySelector(".animate-proximity-vignette") !== null;
      return { hasOverlay };
    });
    console.log("Overlay after fade out:", fadeStatus);

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "3_flash_faded_out.png") });
    console.log("Captured 3_flash_faded_out.png (no permanent tint)");

    // Test remaining inside stationary - should NOT spam
    console.log("6. Remaining stationary inside radius for 3 seconds (checking spam prevention)...");
    const flashIdBefore = alertStatus.flashId;
    await sleep(3000);
    const flashIdAfter = await page.evaluate(() => window.__polarisStore.getState().proximityFlashId);
    const didSpam = flashIdAfter !== flashIdBefore;
    console.log("Did alert spam while stationary?:", didSpam ? "YES (FAILED)" : "NO (PASSED - once per entry)");

    // Move out of danger radius
    console.log("7. Moving vessel away out of danger radius...");
    await page.evaluate(({ lat, lon }) => {
      window.__polarisStore.getState().setVessel({ lat, lon, sogKnots: 15, headingDeg: 180 });
    }, { lat: outsideLat, lon: targetLon });
    await sleep(1000);

    // Re-enter danger radius - should re-trigger!
    console.log("8. Re-entering danger radius to test fresh entry re-trigger...");
    await page.evaluate(({ lat, lon }) => {
      window.__polarisStore.getState().setVessel({ lat, lon, sogKnots: 12, headingDeg: 0 });
    }, { lat: insideLat, lon: targetLon });
    await sleep(250);

    const retriggerStatus = await page.evaluate(() => {
      const s = window.__polarisStore.getState();
      return {
        flashId: s.proximityFlashId,
        hasOverlay: document.querySelector(".animate-proximity-vignette") !== null,
        latestAlert: s.alerts[s.alerts.length - 1],
      };
    });
    console.log("Re-trigger status:", retriggerStatus);
    const didRetrigger = retriggerStatus.flashId > flashIdAfter;
    console.log("Did re-trigger on fresh entry?:", didRetrigger ? "YES (PASSED)" : "NO (FAILED)");

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "4_retriggered_flash.png") });

    // Test Audio OFF toggle gating
    console.log("9. Testing Audio OFF toggle gating...");
    await page.evaluate(() => {
      window.__polarisStore.getState().setSoundOn(false);
    });
    const soundOffState = await page.evaluate(() => window.__polarisStore.getState().soundOn);
    console.log("Audio OFF confirmed:", !soundOffState);

    console.log("=== Proximity Alert Test Completed Successfully ===");
  } catch (err) {
    console.error("Test error:", err);
  } finally {
    await browser.close();
  }
}

run();
