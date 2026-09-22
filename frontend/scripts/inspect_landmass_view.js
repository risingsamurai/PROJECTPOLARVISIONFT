const puppeteer = require("puppeteer-core");
const path = require("path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:\\Users\\ADITYA\\.gemini\\antigravity-ide\\brain\\29cb259c-72d7-4ec7-88e5-b26a2cc8b1da";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
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

    console.log("Navigating to 3D simulation...");
    await page.goto("http://localhost:9000/simulation", { waitUntil: "networkidle2", timeout: 30000 });
    await sleep(4000);

    // Measure FPS
    const fpsMetrics = await page.evaluate(async () => {
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
      const duration = (performance.now() - start) / 1000;
      return { fps: Math.round(frames / duration) };
    });
    console.log("Measured FPS:", fpsMetrics);

    // Inspect scene objects
    const sceneInfo = await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      return {
        vessel: s?.vessel,
        cameraDist: s?.cameraDistance,
        orbitPitch: s?.orbitPitch,
        orbitYaw: s?.orbitYaw,
      };
    });
    console.log("Scene Info:", sceneInfo);

    // Capture standard view
    const shot1 = path.join(ARTIFACTS_DIR, "inspect_land_1_standard.png");
    await page.screenshot({ path: shot1 });
    console.log("Captured:", shot1);

    // Set camera high altitude / wide view to inspect coastline & ocean horizon
    await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      s.setOrbit(-0.8, 0.75, 85);
    });
    await sleep(2000);

    const shot2 = path.join(ARTIFACTS_DIR, "inspect_land_2_wide_high.png");
    await page.screenshot({ path: shot2 });
    console.log("Captured:", shot2);

    // Rotate camera to look towards the Antarctic Peninsula (West/Southwest)
    await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      s.setOrbit(1.5, 0.35, 75);
    });
    await sleep(2000);

    const shot3 = path.join(ARTIFACTS_DIR, "inspect_land_3_peninsula_angle.png");
    await page.screenshot({ path: shot3 });
    console.log("Captured:", shot3);

    // Top-down tactical view
    await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      s.setOrbit(0, 1.1, 85);
    });
    await sleep(2000);

    const shot4 = path.join(ARTIFACTS_DIR, "inspect_land_4_topdown.png");
    await page.screenshot({ path: shot4 });
    console.log("Captured:", shot4);

  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
