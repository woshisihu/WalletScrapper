import { Actor } from 'apify';  // 正确导入：Actor 是主对象
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

Actor.main(async () => {
  let browser;
  try {
    console.log('Starting browser launch in Apify...');

    // 使用 Actor.launchPuppeteer()（Apify SDK v3+ 推荐）
    browser = await Actor.launchPuppeteer({
      useChrome: true,
      launchOptions: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-zygote',
          '--single-process',
          '--disable-extensions',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ],
        ignoreHTTPSErrors: true,
        timeout: 120000
      }
    });

    console.log('Browser launched successfully!');

    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1280, height: 800 });

    console.log('Fetching Dexscreener...');
    await page.goto('https://dexscreener.com/', {
      waitUntil: 'networkidle2',
      timeout: 90000
    });

    // 等待数据加载（更健壮）
    await page.waitForFunction(
      () => window.__SERVER_DATA !== undefined && window.__SERVER_DATA !== null,
      { timeout: 60000 }
    ).catch(() => {
      console.warn('__SERVER_DATA timeout, but continuing...');
    });

    const serverData = await page.evaluate(() => window.__SERVER_DATA || null);

    let data = [];
    if (serverData?.route?.data?.dexScreenerData?.pairs) {
      data = serverData.route.data.dexScreenerData.pairs.map(coin => ({
        address: coin.pairAddress,
        chainId: coin.chainId
      }));
      console.log(`Extracted ${data.length} pairs successfully.`);
    } else {
      console.log('No __SERVER_DATA or pairs found.');
    }

    // 输出到 Dataset
    await Actor.pushData({
      timestamp: new Date().toISOString(),
      source: 'dexscreener',
      pairs: data,
      count: data.length
    });

  } catch (error) {
    console.error('Critical error:', error.stack || error.message);

    await Actor.pushData({
      status: 'failed',
      error: error.message || 'Unknown error',
      timestamp: new Date().toISOString()
    });
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed.');
    }
  }
});

// 全局错误捕获
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.stack);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION at:', promise, 'reason:', reason);
});
