const puppeteer = require("puppeteer-core");
const path = require("path");

const ARTIFACT_DIR = "C:\\Users\\ADITYA\\.gemini\\antigravity-ide\\brain\\ebf4b4fb-64ed-4d05-a3ed-a1dd348154e1";

async function main() {
  console.log("Launching Chrome to verify fast iceberg rendering with WebGL D3D11...");
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--enable-webgl",
      "--use-gl=angle",
      "--use-angle=d3d11",
      "--ignore-gpu-blocklist",
      "--window-size=1920,1080",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  console.log("Navigating to http://localhost:9000/dashboard ...");
  const start = Date.now();
  await page.goto("http://localhost:9000/dashboard", { waitUntil: "networkidle2", timeout: 45000 });

  await new Promise((r) => setTimeout(r, 2000));
  const elapsed = Date.now() - start;

  const result = await page.evaluate(() => {
    const s = window.__polarisStore?.getState();
    const markers = document.querySelectorAll(".maplibregl-marker");
    return {
      storeIcebergsCount: s?.icebergs?.length,
      allIcebergsCount: s?.allIcebergs?.length,
      renderedMarkersCount: markers.length,
      icebergNames: s?.icebergs?.slice(0, 8).map((ib) => ib.name),
    };
  });

  console.log(`\nVerified 2D Map (${elapsed}ms total):`);
  console.log(JSON.stringify(result, null, 2));

  const shotPath = path.join(ARTIFACT_DIR, "step6_2d_instant_icebergs_verified.png");
  await page.screenshot({ path: shotPath });
  console.log(`Saved screenshot to: ${shotPath}`);

  await browser.close();
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
