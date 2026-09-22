const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=d3d11']
  });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  await page.goto('http://localhost:9000');
  await new Promise(r => setTimeout(r, 2000));
  
  // Click fastest
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tr'));
    const r = rows.find(x => x.innerText.includes('FASTEST'));
    r.querySelector('button').click();
  });
  await new Promise(r => setTimeout(r, 500));
  
  // Go to 3D
  const simLink = await page.$('a[href="/simulation"]');
  await simLink.click();
  await page.waitForSelector('canvas');
  await new Promise(r => setTimeout(r, 2000));
  
  // Select safest in 3D
  await page.waitForFunction(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.some(b => b.innerText.trim() === 'Safest');
  }, { timeout: 10000 });
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find(x => x.innerText.trim() === 'Safest');
    if (b) b.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  
  // Return to 2D
  const homeLink = await page.$('a[href="/"]');
  await homeLink.click();
  await page.waitForFunction(() => window.location.pathname === '/');
  await new Promise(r => setTimeout(r, 3000));
  
  const mapState = await page.evaluate(() => {
    const map = window.mapForTesting;
    const s = window.__polarisStore?.getState();
    return {
      hasMap: !!map,
      isStyleLoaded: map ? map.isStyleLoaded() : false,
      loaded: map ? map.loaded() : false,
      routesInStore: s?.routes?.length,
      lockedRouteId: s?.lockedRouteId,
      safestLayer: map ? !!map.getLayer('route-safest-layer') : false,
      safestSource: map ? !!map.getSource('route-safest-source') : false,
      allLayers: map && map.getStyle() ? map.getStyle().layers.map(l => l.id) : [],
      windowRoutes: s?.routes,
    };
  });
  console.log('Map State upon return:', JSON.stringify(mapState, null, 2));
  await browser.close();
})();
