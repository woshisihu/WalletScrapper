import { main as ApifyMain, launchPuppeteer, pushData } from 'apify';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

ApifyMain(async () => {
  let browser;
  try {
    console.log('Starting browser launch in Apify...');

    // 使用 Apify.launchPuppeteer() 兼容 Docker 环境
    browser = await launchPuppeteer({
      useChrome: true,  // 优先使用 Apify 提供的 Chrome
      launchOptions: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',     // 避免 /dev/shm 空间不足
          '--disable-gpu',               // 避免 GPU 相关错误
          '--no-zygote',                 // 避免 zygote 进程问题
          '--single-process',            // 单进程模式，更稳定
          '--disable-extensions',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ],
        ignoreHTTPSErrors: true,
        timeout: 120000  // 启动超时延长到 120 秒
      }
    });

    console.log('Browser launched successfully!');

    const page = await browser.newPage();

    // 设置真实 UA 和视窗大小（防检测）
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1280, height: 800 });

    console.log('Fetching Dexscreener...');
    await page.goto('https://dexscreener.com/', {
      waitUntil: 'networkidle2',
      timeout: 90000  // 页面加载超时延长
    });

    // 等待 DexScreener 的 SPA 数据加载完成
    await page.waitForFunction(
      () => window.__SERVER_DATA !== undefined && window.__SERVER_DATA !== null,
      { timeout: 60000 }
    ).catch(() => {
      console.warn('__SERVER_DATA not loaded within timeout, proceeding anyway.');
    });

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

    // 输出到 Apify Dataset（关键一步）
    await pushData({
      timestamp: new Date().toISOString(),
      source: 'dexscreener',
      pairs: data,
      count: data.length
    });

  } catch (error) {
    console.error('Critical error during execution:', error.stack || error.message);

    // 失败时也输出信息，便于调试
    await pushData({
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

// 全局错误捕获，防止 uncaught exception 导致 Actor 崩溃
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.stack);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION at:', promise, 'reason:', reason);
});
