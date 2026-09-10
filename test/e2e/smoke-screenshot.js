const { chromium } = require('playwright');
(async () => {
  const base = process.env.BASE_URL || 'http://127.0.0.1:3200';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', m => console.log('[browser]', m.type(), m.text().slice(0, 200)));
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 500)));
  await page.goto(base + '/login.html', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test/screenshots/login.png', fullPage: true });
  const title = await page.title().catch(() => '(no title)');
  const tabStudent = await page.locator('#studentTab').count();
  const tabAdmin = await page.locator('#adminTab').count();
  console.log(JSON.stringify({ ok: true, url: base + '/login.html', title, tabStudent, tabAdmin }));
  await browser.close();
})().catch(e => { console.error('SMOKE_FAIL', e); process.exit(1); });
