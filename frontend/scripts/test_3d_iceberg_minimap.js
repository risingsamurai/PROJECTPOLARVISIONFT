const puppeteer = require('puppeteer-core');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ARTIFACTS_DIR = 'C:\\Users\\ADITYA\\.gemini\\antigravity-ide\\brain\\ebf4b4fb-64ed-4d05-a3ed-a1dd348154e1';

async function run() {
  console.log('Launching browser via puppeteer-core...');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  console.log('Navigating to http://localhost:9000/simulation ...');
  await page.goto('http://localhost:9000/simulation', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 4000));

  // 1. Initial 3D simulation view with decent big icebergs
  const img1 = path.join(ARTIFACTS_DIR, 'step7_3d_decent_big_icebergs.png');
  await page.screenshot({ path: img1 });
  console.log(`Saved: ${img1}`);

  // 2. Select an iceberg from dropdown (e.g. D33B or A85)
  const selectElem = await page.$('select');
  if (selectElem) {
    // Select an iceberg with ID IBG-D33B or second option
    const options = await page.$$eval('select option', (opts) => opts.map(o => ({ value: o.value, text: o.text })));
    console.log('Available iceberg options:', options.slice(0, 5));
    
    const target = options.find(o => o.text.includes('D33B')) || options[1];
    if (target) {
      console.log(`Selecting target iceberg: ${target.text} (${target.value})`);
      await page.select('select', target.value);
    }
  }

  // Allow camera to smoothly fly to the iceberg and frame it
  await new Promise((r) => setTimeout(r, 3500));

  // 2. Focused iceberg with 72h LSTM drift minimap
  const img2 = path.join(ARTIFACTS_DIR, 'step7_3d_camera_focused_iceberg_minimap.png');
  await page.screenshot({ path: img2 });
  console.log(`Saved: ${img2}`);

  // 3. Select A85 for another perspective
  const options = await page.$$eval('select option', (opts) => opts.map(o => ({ value: o.value, text: o.text })));
  const targetA85 = options.find(o => o.text.includes('A85')) || options[2];
  if (targetA85) {
    console.log(`Selecting target iceberg: ${targetA85.text} (${targetA85.value})`);
    await page.select('select', targetA85.value);
    await new Promise((r) => setTimeout(r, 3500));

    const img3 = path.join(ARTIFACTS_DIR, 'step7_3d_a85_focused_minimap_and_nodes.png');
    await page.screenshot({ path: img3 });
    console.log(`Saved: ${img3}`);
  }

  await browser.close();
  console.log('All 3D iceberg verification screenshots captured successfully.');
}

run().catch((err) => {
  console.error('Error during 3D verification:', err);
  process.exit(1);
});
