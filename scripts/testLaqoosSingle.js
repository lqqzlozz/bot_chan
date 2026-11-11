// Diagnostic only: do not modify production statistics.
const { chromium } = require('playwright');
const url = 'https://www.laqoos.com/ja-JP/genshin/characters/10000136/active';
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ locale: 'ja-JP' });
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    console.log('HTTP:', response?.status(), 'URL:', page.url(), 'Title:', await page.title());
    for (let attempt = 0; attempt < 12; attempt++) {
      const body = await page.locator('body').innerText().catch(() => '');
      const ownership = body.match(/所持率\s*(\d{1,3}(?:\.\d+)?)\s*%/);
      const abyss = body.match(/深境螺旋の使用率\s*(\d{1,3}(?:\.\d+)?)\s*%/);
      if (ownership && abyss) {
        console.log('SUCCESS:', JSON.stringify({ avatarId: 10000136, ownership: Number(ownership[1]), abyssUsage: Number(abyss[1]) }));
        return;
      }
      console.log('Attempt', attempt + 1, 'length:', body.length, 'preview:', body.slice(0, 400));
      await page.waitForTimeout(2000);
    }
    throw new Error('Statistics were not found within 24 seconds; check page text previews above');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
