const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=d3d11']
  });
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  await page.goto('http://localhost:9000');
  await new Promise(r => setTimeout(r, 2000));
  console.log('Pathname before click:', await page.evaluate(() => window.location.pathname));
  
  const link = await page.$('a[href="/simulation"]');
  console.log('Link element found:', !!link);
  if (link) {
    await link.click();
  }
  await new Promise(r => setTimeout(r, 4000));
  console.log('Pathname after click:', await page.evaluate(() => window.location.pathname));
  console.log('Canvas present:', await page.evaluate(() => !!document.querySelector('canvas')));
  console.log('Store state after click:', await page.evaluate(() => {
    const s = window.__polarisStore?.getState();
    return {
      lockedRouteId: s?.lockedRouteId,
      routesCount: s?.routes?.length,
      routeNames: s?.routes?.map(r => r.name),
    };
  }));
  await browser.close();
})();
