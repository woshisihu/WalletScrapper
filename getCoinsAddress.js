
const Apify = require('apify');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

Apify.main(async () => {
  let browser;
  try {
    console.log('Starting browser launch in Apify...');

    // 使用 Apify.launchPuppeteer() 而不是 puppeteer.launch()
    browser = await Apify.launchPuppeteer({
      useChrome: true,  // 优先用 Apify 提供的 Chrome
      launchOptions: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',     // 必须加，避免 /dev/shm 空间不足
          '--disable-gpu',               // 避免 GPU 相关错误
          '--no-zygote',                 // 避免 zygote 进程问题
          '--single-process',            // 单进程模式，更稳定
          '--disable-extensions',
          '--disable-background-timer-throttling'
        ],
        ignoreHTTPSErrors: true,
        timeout: 120000  // 延长到 120 秒
      }
    });

    console.log('Browser launched successfully!');

    const page = await browser.newPage();

    // 设置更真实的 UA 和 viewport（防检测）
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1280, height: 800 });

    console.log('Fetching Dexscreener...');
    await page.goto('https://dexscreener.com/', {
      waitUntil: 'networkidle2',
      timeout: 60000  // 延长超时
    });

    // 等待页面完全加载（DexScreener 是 SPA，可能需要额外等待）
    await page.waitForFunction(() => window.__SERVER_DATA !== undefined, { timeout: 30000 });

    const serverData = await page.evaluate(() => {
      return window.__SERVER_DATA || null;
    });

    let data = [];
    if (serverData?.route?.data?.dexScreenerData?.pairs) {
      data = serverData.route.data.dexScreenerData.pairs.map(coin => ({
        address: coin.pairAddress,
        chainId: coin.chainId
      }));
      console.log(`Extracted ${data.length} pairs successfully.`);
    } else {
      console.log('window.__SERVER_DATA not found or no pairs data.');
    }

    // 输出到 Apify Dataset（必须有这行！）
    await Apify.pushData({
      timestamp: new Date().toISOString(),
      source: 'dexscreener',
      pairs: data
    });

  } catch (error) {
    console.error('Critical error during execution:', error.stack || error.message);
    // 即使失败也 push 点信息，便于调试
    await Apify.pushData({
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

// 全局错误捕获（防止 uncaught exception）
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.stack);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION at:', promise, 'reason:', reason);
});
