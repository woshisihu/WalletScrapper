import { Actor } from 'apify';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteerExtra.use(StealthPlugin());

Actor.main(async () => {
  let browser;
  try {
    console.log('Starting browser launch in Apify...');

    // 直接用 puppeteerExtra.launch（兼容 Apify Docker）
    browser = await puppeteerExtra.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',  // Apify 镜像路径
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

    // 等待数据加载
    await page.waitForFunction(
      () => window.__SERVER_DATA !== undefined && window.__SERVER_DATA !== null,
      { timeout: 60000 }
    ).catch(() => console.warn('__SERVER_DATA timeout, continuing...'));

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

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.stack);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION at:', promise, 'reason:', reason);
});
