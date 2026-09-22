const puppeteer = require("puppeteer-core");
const path = require("path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:\\Users\\ADITYA\\.gemini\\antigravity-ide\\brain\\29cb259c-72d7-4ec7-88e5-b26a2cc8b1da";

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
    await page.goto("http://localhost:9000/simulation", { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 4000));

    // Position camera with high altitude and yaw to view the landmass in foreground/midground with ship & ocean beyond
    await page.evaluate(() => {
      const s = window.__polarisStore?.getState();
      s.setOrbit(-1.57, 0.45, 120);
    });
    await new Promise((r) => setTimeout(r, 2000));

    const shot = path.join(ARTIFACTS_DIR, "establishing_wide_from_coast.png");
    await page.screenshot({ path: shot });
    console.log("Saved screenshot:", shot);
  } finally {
    await browser.close();
  }
}

run();
