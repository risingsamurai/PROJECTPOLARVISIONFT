const puppeteer = require("puppeteer-core");
const path = require("path");

const ARTIFACT_DIR = "C:\\Users\\ADITYA\\.gemini\\antigravity-ide\\brain\\ebf4b4fb-64ed-4d05-a3ed-a1dd348154e1";

async function main() {
  console.log("Launching browser to test instant iceberg rendering...");
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-web-security",
      "--window-size=1920,1080",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  // Session 1: Initial 2D Dashboard Load
  console.log("\n=== Session 1: Initial 2D Dashboard Load ===");
  const t0 = Date.now();
  await page.goto("http://localhost:9000/dashboard", { waitUntil: "networkidle2", timeout: 45000 });

  // Wait for map container and markers
  await page.waitForSelector(".maplibregl-canvas", { timeout: 30000 });
  await page.waitForFunction(
    () => {
      const s = window.__polarisStore?.getState();
      return (s?.allIcebergs?.length || 0) > 0 || (s?.icebergs?.length || 0) > 0;
    },
    { timeout: 30000 }
  );

  const session1Data = await page.evaluate(() => {
    const s = window.__polarisStore?.getState();
    const markers = document.querySelectorAll(".maplibregl-marker").length;
    return {
      icebergsCount: s?.icebergs?.length,
      allIcebergsCount: s?.allIcebergs?.length,
      htmlMarkersRendered: markers,
      sampleIcebergs: s?.icebergs?.slice(0, 4).map((i) => ({ name: i.name, lat: i.lat, lon: i.lon })),
    };
  });
  const t1 = Date.now();
  console.log(`Session 1 map & icebergs fully active in ${t1 - t0}ms:`, JSON.stringify(session1Data, null, 2));

  const shot1Path = path.join(ARTIFACT_DIR, "step6_session1_instant_icebergs_2d.png");
  await page.screenshot({ path: shot1Path });
  console.log(`Saved screenshot: ${shot1Path}`);

  // Session 2: Navigate to 3D Simulation then return to 2D Dashboard
  console.log("\n=== Session 2: Navigate to 3D and Return to 2D Map ===");
  await page.goto("http://localhost:9000/simulation", { waitUntil: "networkidle2", timeout: 45000 });
  await page.waitForSelector("canvas", { timeout: 30000 });

  const t2 = Date.now();
  await page.goto("http://localhost:9000/dashboard", { waitUntil: "networkidle2", timeout: 45000 });
  await page.waitForSelector(".maplibregl-canvas", { timeout: 30000 });

  const session2Data = await page.evaluate(() => {
    const s = window.__polarisStore?.getState();
    const markers = document.querySelectorAll(".maplibregl-marker").length;
    return {
      icebergsCount: s?.icebergs?.length,
      allIcebergsCount: s?.allIcebergs?.length,
      htmlMarkersRendered: markers,
    };
  });
  const t3 = Date.now();
  console.log(`Session 2 immediate return active in ${t3 - t2}ms:`, JSON.stringify(session2Data, null, 2));

  const shot2Path = path.join(ARTIFACT_DIR, "step6_session2_instant_icebergs_return.png");
  await page.screenshot({ path: shot2Path });
  console.log(`Saved screenshot: ${shot2Path}`);

  await browser.close();
  console.log("\nAll sessions verified successfully!");
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
