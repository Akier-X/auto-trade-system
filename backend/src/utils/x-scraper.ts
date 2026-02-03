/**
 * Unified X (Twitter) Scraper Utility
 * Consolidates duplicate scraping logic with and without authentication
 */

import { chromium, Browser, Page } from 'playwright';
import { addSystemLog } from '../routes/system';

export interface XAuthCredentials {
  authToken: string;
  ct0: string;
}

export interface XScraperOptions {
  maxTweets?: number;
  auth?: XAuthCredentials;
  targetCount?: number;
  timeout?: number;
}

export interface XTweet {
  id: string;
  text: string;
  author: {
    id: string;
    username: string;
    name: string;
  };
  created_at: string;
  public_metrics?: any;
  cashtags: string[];
  hashtags: string[];
  mediaUrls: string[];
}

/**
 * Clean tweet text by removing URLs and normalizing whitespace
 */
export function cleanTweetText(text: string): string {
  let cleaned = text.replace(/http\S+/g, ''); // Remove URLs
  cleaned = cleaned.replace(/\s+/g, ' '); // Normalize whitespace
  return cleaned.trim();
}

/**
 * Setup browser with common configuration
 */
async function setupBrowser(): Promise<Browser> {
  const launchOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  };

  try {
    return await chromium.launch(launchOptions);
  } catch (error: any) {
    addSystemLog(`Playwright Chromium 起動失敗、システムChromeを試行: ${error?.message ?? 'unknown error'}`, 'warning');
  }

  try {
    return await chromium.launch({ ...launchOptions, channel: 'chrome' });
  } catch (error: any) {
    addSystemLog(`システムChrome起動失敗、Edgeを試行: ${error?.message ?? 'unknown error'}`, 'warning');
  }

  return await chromium.launch({ ...launchOptions, channel: 'msedge' });
}

/**
 * Setup page with common headers and viewport
 */
async function setupPage(browser: Browser, auth?: XAuthCredentials): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  });

  // Add authentication cookies if provided
  if (auth) {
    await context.addCookies([
      { name: 'auth_token', value: auth.authToken, domain: '.x.com', path: '/' },
      { name: 'ct0', value: auth.ct0, domain: '.x.com', path: '/' }
    ]);
  }

  const page = await context.newPage();
  
  // Anti-bot detection
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  if (!auth) {
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
  }

  return page;
}

/**
 * Scrape tweets without authentication (basic scraping)
 */
async function scrapeBasicTweets(
  page: Page,
  username: string,
  maxTweets: number
): Promise<XTweet[]> {
  const tweets: XTweet[] = [];
  const tweetElements = await page.$$('article[data-testid="tweet"]');

  for (let i = 0; i < Math.min(tweetElements.length, maxTweets); i++) {
    try {
      const article = tweetElements[i];

      // Extract tweet text
      const tweetTextElement = await article.$('[data-testid="tweetText"]');
      const tweetText = tweetTextElement ? await tweetTextElement.textContent() : '';

      // Extract timestamp
      const timeElement = await article.$('time');
      const timestamp = timeElement
        ? await timeElement.getAttribute('datetime')
        : new Date().toISOString();

      // Extract tweet link to get ID
      const tweetLink = await article.$('a[href*="/status/"]');
      const tweetHref = tweetLink ? await tweetLink.getAttribute('href') : '';
      const tweetId = tweetHref?.match(/status\/(\d+)/)?.[1] || `temp-${Date.now()}-${i}`;

      // Extract author info
      const authorElement = await article.$('[data-testid="User-Name"]');
      const authorNameElement = authorElement ? await authorElement.$('span') : null;
      const authorName = authorNameElement
        ? await authorNameElement.textContent()
        : username;

      // Check for media
      const photoElement = await article.$('[data-testid="tweetPhoto"]');
      const videoElement = await article.$('video');
      const hasMedia = photoElement !== null || videoElement !== null;

      tweets.push({
        id: tweetId,
        text: tweetText || '',
        author: {
          id: username,
          username: username,
          name: authorName || username,
        },
        created_at: timestamp || new Date().toISOString(),
        public_metrics: undefined,
        cashtags: [],
        hashtags: [],
        mediaUrls: hasMedia ? [`https://x.com/${username}/status/${tweetId}`] : [],
      });
    } catch (err) {
      console.error(`Failed to extract tweet ${i}:`, err);
    }
  }

  return tweets;
}

/**
 * Scrape tweets with authentication (advanced scraping with scrolling)
 */
async function scrapeAuthenticatedTweets(
  page: Page,
  username: string,
  targetCount: number
): Promise<string[]> {
  const tweetsCollected: string[] = [];
  const seenTexts = new Set<string>();

  // Check if login is required
  if (page.url().includes('login')) {
    throw new Error('Cookie無効。再取得してください。');
  }

  // Scroll up to 8 times to get target number of tweets
  for (let attempt = 0; attempt < 8; attempt++) {
    const elements = await page.$$('[data-testid="tweetText"]');

    for (const el of elements) {
      try {
        const text = await el.textContent();
        if (text) {
          const cleaned = cleanTweetText(text);
          if (cleaned && cleaned.length > 5 && !seenTexts.has(cleaned)) {
            seenTexts.add(cleaned);
            tweetsCollected.push(cleaned);
          }
        }
      } catch (err) {
        continue;
      }
    }

    addSystemLog(`進捗: ${tweetsCollected.length}件取得済み`, 'info');

    if (tweetsCollected.length >= targetCount) {
      break;
    }

    // Scroll down
    await page.evaluate('window.scrollBy(0, 1200)');
    await page.waitForTimeout(3000);
  }

  return tweetsCollected.slice(0, 20); // Return max 20 tweets
}

/**
 * Main unified scraper function
 * Handles both authenticated and non-authenticated scraping
 */
export async function scrapeUserTweets(
  username: string,
  options: XScraperOptions = {}
): Promise<XTweet[] | string[]> {
  const {
    maxTweets = 5,
    auth,
    targetCount = 15,
    timeout = 40000
  } = options;

  let browser: Browser | undefined;

  try {
    const mode = auth ? '認証付き' : '通常';
    addSystemLog(
      `${mode}モードで @${username} のツイートを取得中${auth ? `（目標: ${targetCount}件）` : ''}`,
      'info'
    );

    // Setup browser and page
    browser = await setupBrowser();
    const page = await setupPage(browser, auth);

    // Navigate to user profile
    const url = `https://x.com/${username}`;
    const waitUntil = auth ? 'commit' : 'domcontentloaded';
    await page.goto(url, { waitUntil, timeout });
    await page.waitForTimeout(3000);

    // Scrape based on authentication mode
    let result: XTweet[] | string[];
    
    if (auth) {
      result = await scrapeAuthenticatedTweets(page, username, targetCount);
    } else {
      result = await scrapeBasicTweets(page, username, maxTweets);
    }

    await browser.close();

    addSystemLog(
      `@${username} のツイート ${result.length}件を取得完了`,
      'success'
    );

    return result;

  } catch (error: any) {
    console.error(`Failed to scrape tweets for ${username}:`, error);
    addSystemLog(
      `@${username} のツイート取得失敗: ${error.message}`,
      'error'
    );
    
    if (browser) {
      await browser.close();
    }
    
    throw error;
  }
}

/**
 * Helper to check if auth credentials are valid
 */
export function validateAuthCredentials(authToken?: string, ct0?: string): XAuthCredentials {
  if (!authToken || !ct0) {
    throw new Error('X認証情報が環境変数に設定されていません（X_AUTH_TOKEN, X_CT0）');
  }
  
  return { authToken, ct0 };
}
